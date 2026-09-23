import fs from 'node:fs/promises';
import path from 'node:path';

const GDELT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const OUT = path.resolve('data');

const desks = {
  world: {
    query: '(election OR economy OR conflict OR diplomacy OR climate OR disaster OR government)',
    rssQuery: 'world breaking news',
    timespan: '2d',
    lane: 'World',
    maxrecords: 70,
    locale: 'US'
  },
  local: {
    query: '(Malta OR Maltese OR Valletta OR Mdina OR Gozo)',
    rssQuery: 'Malta OR Valletta OR Gozo',
    timespan: '7d',
    lane: 'Local',
    maxrecords: 70,
    locale: 'MT'
  },
  tech: {
    query: '(technology OR "artificial intelligence" OR cybersecurity OR smartphone OR computing OR startup)',
    rssQuery: 'technology OR AI OR cybersecurity OR smartphones',
    timespan: '3d',
    lane: 'Tech',
    maxrecords: 70,
    locale: 'US'
  },
  gaming: {
    query: '("video games" OR gaming OR PlayStation OR Xbox OR Nintendo OR Steam OR esports)',
    rssQuery: 'gaming OR PlayStation OR Xbox OR Nintendo OR Steam OR esports',
    timespan: '3d',
    lane: 'Gaming',
    maxrecords: 70,
    locale: 'US'
  }
};

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const match = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return match ? decodeXml(match[1]) : '';
}

function domainFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'News source'; }
}

function gdeltDate(value) {
  if (!value) return new Date().toISOString();
  const raw = String(value);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3] + 'T' + match[4] + ':' + match[5] + ':' + match[6] + 'Z';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function normalize(item, lane) {
  const url = item.url || item.link || '';
  return {
    title: String(item.title || 'Untitled story').trim(),
    url,
    image: item.socialimage || item.socialimageurl || item.image || item.imageurl || '',
    domain: item.domain || domainFrom(url),
    country: item.sourcecountry || item.sourceCountry || item.country || '',
    language: item.language || '',
    publishedAt: gdeltDate(item.seendate || item.date || item.published || item.publishedAt),
    lane
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);
    if (!key || seen.has(key) || !item.url) return false;
    seen.add(key);
    return true;
  });
}

async function fetchWithTimeout(url, ms, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGdelt(config) {
  const params = new URLSearchParams({
    query: config.query,
    mode: 'artlist',
    maxrecords: String(config.maxrecords),
    format: 'json',
    sort: 'datedesc',
    timespan: config.timespan
  });
  const response = await fetchWithTimeout(
    GDELT + '?' + params.toString(),
    8000,
    { accept: 'application/json', 'user-agent': 'PulsePress-GitHub-Newsroom/2.0' }
  );
  if (!response.ok) throw new Error('GDELT HTTP ' + response.status);
  const payload = await response.json();
  const raw = Array.isArray(payload && payload.articles) ? payload.articles : [];
  const articles = dedupe(raw.map(item => normalize(item, config.lane)));
  if (!articles.length) throw new Error('GDELT returned no articles');
  return articles;
}

function googleRssUrl(config) {
  const isMalta = config.locale === 'MT';
  const suffix = isMalta ? '&hl=en&gl=MT&ceid=MT:en' : '&hl=en-US&gl=US&ceid=US:en';
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(config.rssQuery + ' when:7d') + suffix;
}

async function fetchGoogleRss(config) {
  const response = await fetchWithTimeout(
    googleRssUrl(config),
    8000,
    { accept: 'application/rss+xml,text/xml,*/*', 'user-agent': 'Mozilla/5.0 PulsePress-Newsroom/2.0' }
  );
  if (!response.ok) throw new Error('Google RSS HTTP ' + response.status);
  const xml = await response.text();
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const items = blocks.map(block => {
    const sourceMatch = block.match(/<source(?:\s+url="([^"]*)")?[^>]*>([\s\S]*?)<\/source>/i);
    const source = sourceMatch ? decodeXml(sourceMatch[2]) : '';
    const link = tag(block, 'link');
    let title = tag(block, 'title');
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    return normalize({
      title,
      link,
      domain: source || domainFrom(link),
      country: config.locale === 'MT' ? 'Malta' : '',
      publishedAt: tag(block, 'pubDate')
    }, config.lane);
  });
  const articles = dedupe(items);
  if (!articles.length) throw new Error('Google RSS returned no articles');
  return articles.slice(0, config.maxrecords);
}

async function fetchDesk(name, config) {
  try {
    const articles = await fetchGdelt(config);
    console.log(name + ': GDELT ' + articles.length);
    return articles;
  } catch (error) {
    console.warn(name + ': GDELT unavailable - ' + error.message);
  }

  const articles = await fetchGoogleRss(config);
  console.log(name + ': Google RSS ' + articles.length);
  return articles;
}

await fs.mkdir(OUT, { recursive: true });
const results = {};

for (const [name, config] of Object.entries(desks)) {
  try {
    const articles = await fetchDesk(name, config);
    results[name] = articles;
    await fs.writeFile(
      path.join(OUT, name + '.json'),
      JSON.stringify({ updatedAt: new Date().toISOString(), desk: name, articles }, null, 2) + '\n'
    );
  } catch (error) {
    console.error(name + ': all providers failed - keeping previous snapshot - ' + error.message);
  }
}

const home = dedupe(Object.values(results).flat())
  .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  .slice(0, 120);

if (home.length) {
  await fs.writeFile(
    path.join(OUT, 'home.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), desk: 'home', articles: home }, null, 2) + '\n'
  );
  console.log('home: ' + home.length + ' articles');
}
