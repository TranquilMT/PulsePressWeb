(() => {
  'use strict';

  const DOC_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';
  const CONTEXT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/context/context';
  const CACHE_PREFIX = 'pulsepress:gdelt:';
  const CACHE_TTL = 90 * 1000;

  const QUERIES = {
    world: '(election OR economy OR conflict OR diplomacy OR climate OR disaster OR government)',
    local: '(Malta OR Maltese OR Valletta OR Mdina OR Gozo)',
    tech: '(technology OR "artificial intelligence" OR cybersecurity OR smartphone OR computing OR startup)',
    gaming: '("video games" OR gaming OR PlayStation OR Xbox OR Nintendo OR Steam OR esports)',
  };

  const STOP = new Set([
    'about','after','again','against','among','because','before','being','between','could','first','from','have','into',
    'more','most','news','over','says','said','than','that','their','there','these','they','this','through','under','what',
    'when','where','which','while','will','with','would','your','latest','amid','report','reports','update','new'
  ]);

  function timeoutFetch(url, ms = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, {
      cache: 'no-store',
      mode: 'cors',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  }

  function gdeltDate(value) {
    if (!value) return new Date().toISOString();
    const raw = String(value);
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  function domainFrom(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'News source';
    }
  }

  function normalize(item, lane = '') {
    const url = item.url || item.link || '';
    return {
      id: btoa(unescape(encodeURIComponent(url || item.title || Math.random().toString()))).replace(/[^a-z0-9]/gi, '').slice(-22),
      title: (item.title || 'Untitled story').trim(),
      url,
      image: item.socialimage || item.socialimageurl || item.image || item.imageurl || '',
      domain: item.domain || domainFrom(url),
      country: item.sourcecountry || item.sourceCountry || item.country || '',
      language: item.language || '',
      publishedAt: gdeltDate(item.seendate || item.date || item.published),
      lane,
    };
  }

  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.at > CACHE_TTL) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function cacheSet(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    } catch {
      // Storage can be unavailable in privacy modes; live fetching still works.
    }
  }

  async function fetchArticles(query, options = {}) {
    const {
      maxrecords = 35,
      timespan = '1d',
      sort = 'datedesc',
      lane = '',
      force = false,
    } = options;
    const cacheKey = `${query}|${maxrecords}|${timespan}|${sort}|${lane}`;
    if (!force) {
      const cached = cacheGet(cacheKey);
      if (cached) return cached;
    }

    const params = new URLSearchParams({
      query,
      mode: 'artlist',
      maxrecords: String(maxrecords),
      format: 'json',
      sort,
      timespan,
    });

    const response = await timeoutFetch(`${DOC_ENDPOINT}?${params.toString()}`);
    if (!response.ok) throw new Error(`GDELT returned ${response.status}`);
    const payload = await response.json();
    const raw = Array.isArray(payload.articles) ? payload.articles : Array.isArray(payload) ? payload : [];
    const result = raw.map(item => normalize(item, lane)).filter(item => item.title && item.url);
    cacheSet(cacheKey, result);
    return result;
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sortNewest(items) {
    return [...items].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  async function fetchHome(force = false) {
    const [world, local, tech, gaming] = await Promise.allSettled([
      fetchArticles(QUERIES.world, { maxrecords: 18, timespan: '12h', lane: 'World', force }),
      fetchArticles(QUERIES.local, { maxrecords: 14, timespan: '3d', lane: 'Local', force }),
      fetchArticles(QUERIES.tech, { maxrecords: 16, timespan: '2d', lane: 'Tech', force }),
      fetchArticles(QUERIES.gaming, { maxrecords: 16, timespan: '2d', lane: 'Gaming', force }),
    ]);
    const values = [world, local, tech, gaming].flatMap(result => result.status === 'fulfilled' ? result.value : []);
    return sortNewest(dedupe(values)).slice(0, 46);
  }

  async function fetchBriefing(force = false) {
    const configs = [
      ['World', QUERIES.world, '12h'],
      ['Local', QUERIES.local, '3d'],
      ['Tech', QUERIES.tech, '2d'],
      ['Gaming', QUERIES.gaming, '2d'],
    ];
    const results = await Promise.allSettled(configs.map(([lane, query, timespan]) =>
      fetchArticles(query, { maxrecords: 12, timespan, lane, force })
    ));
    return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  }

  function keywordQuery(title) {
    const words = String(title)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4 && !STOP.has(word));
    const unique = [...new Set(words)].slice(0, 4);
    if (!unique.length) return String(title).split(/\s+/).slice(0, 4).join(' ');
    return unique.join(' ');
  }

  async function fetchRelated(article, maxrecords = 18) {
    const query = keywordQuery(article.title);
    try {
      const items = await fetchArticles(query, { maxrecords, timespan: '7d', sort: 'datedesc', force: true });
      return dedupe(items.filter(item => item.url !== article.url)).slice(0, maxrecords);
    } catch {
      return [];
    }
  }

  function trimWords(text, maxWords = 22) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return words.length <= maxWords ? words.join(' ') : `${words.slice(0, maxWords).join(' ')}…`;
  }

  async function fetchContext(article, maxrecords = 8) {
    const query = keywordQuery(article.title);
    const params = new URLSearchParams({
      query,
      mode: 'artlist',
      maxrecords: String(maxrecords),
      format: 'json',
      sort: 'datedesc',
      timespan: '72h',
    });
    try {
      const response = await timeoutFetch(`${CONTEXT_ENDPOINT}?${params.toString()}`, 9000);
      if (!response.ok) return [];
      const payload = await response.json();
      const raw = Array.isArray(payload.articles) ? payload.articles : Array.isArray(payload) ? payload : [];
      return raw.map(item => ({
        title: item.title || '',
        url: item.url || '',
        domain: item.domain || domainFrom(item.url || ''),
        publishedAt: gdeltDate(item.seendate || item.date),
        snippet: trimWords(item.context || item.snippet || item.sentence || item.text || '', 22),
      })).filter(item => item.title || item.snippet);
    } catch {
      return [];
    }
  }

  window.PulseNews = {
    QUERIES,
    fetchArticles,
    fetchHome,
    fetchBriefing,
    fetchRelated,
    fetchContext,
    dedupe,
    sortNewest,
    keywordQuery,
  };
})();
