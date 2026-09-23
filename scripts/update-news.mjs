import fs from 'node:fs/promises';
import path from 'node:path';

const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
const OUT = path.resolve('data');
const desks = {
  world: { query: '(election OR economy OR conflict OR diplomacy OR climate OR disaster OR government)', timespan: '2d', lane: 'World', maxrecords: 70 },
  local: { query: '(Malta OR Maltese OR Valletta OR Mdina OR Gozo)', timespan: '7d', lane: 'Local', maxrecords: 70 },
  tech: { query: '(technology OR "artificial intelligence" OR cybersecurity OR smartphone OR computing OR startup)', timespan: '3d', lane: 'Tech', maxrecords: 70 },
  gaming: { query: '("video games" OR gaming OR PlayStation OR Xbox OR Nintendo OR Steam OR esports)', timespan: '3d', lane: 'Gaming', maxrecords: 70 }
};

function gdeltDate(value) {
  if (!value) return new Date().toISOString();
  const raw = String(value);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
  if (match) return match[1] + '-' + match[2] + '-' + match[3] + 'T' + match[4] + ':' + match[5] + ':' + match[6] + 'Z';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function domainFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'News source'; }
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
    publishedAt: gdeltDate(item.seendate || item.date || item.published),
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

async function fetchDesk(name, config) {
  const params = new URLSearchParams({
    query: config.query,
    mode: 'artlist',
    maxrecords: String(config.maxrecords),
    format: 'json',
    sort: 'datedesc',
    timespan: config.timespan
  });

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(ENDPOINT + '?' + params.toString(), {
        headers: { accept: 'application/json', 'user-agent': 'PulsePress-GitHub-Newsroom/1.0' }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = await response.json();
      const raw = Array.isArray(payload && payload.articles) ? payload.articles : [];
      const articles = dedupe(raw.map(item => normalize(item, config.lane)));
      if (!articles.length) throw new Error('No articles returned');
      return articles;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, attempt * 2500));
    }
  }
  throw lastError;
}

await fs.mkdir(OUT, { recursive: true });
const results = {};

for (const entry of Object.entries(desks)) {
  const name = entry[0];
  const config = entry[1];
  try {
    const articles = await fetchDesk(name, config);
    results[name] = articles;
    await fs.writeFile(
      path.join(OUT, name + '.json'),
      JSON.stringify({ updatedAt: new Date().toISOString(), desk: name, articles }, null, 2) + '\n'
    );
    console.log(name + ': ' + articles.length + ' articles');
  } catch (error) {
    console.error(name + ': keeping previous snapshot - ' + error.message);
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
