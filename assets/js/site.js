(() => {
  'use strict';

  const PAGE = document.body.dataset.page || 'home';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = value => String(value || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
  const STORAGE_SAVED = 'pulsepress:saved';
  const STORAGE_CURRENT = 'pulsepress:current';
  const STORAGE_SETTINGS = 'pulsepress:settings';
  const STORAGE_HISTORY = 'pulsepress:history';
  const STORAGE_ACTIVITY = 'pulsepress:activity';
  const STORAGE_FOLLOWS = 'pulsepress:follows';
  const SETTINGS_DEFAULT = { refresh: 120000, motion: true, density: 'normal', readerScale: 1, readerWide: false, theme: 'system' };
  const TOPICS = {
    home: [['All',''],['World','World'],['Malta','Local'],['Tech','Tech'],['Gaming','Gaming']],
    world: [['All',''],['Politics','election government politics president minister'],['Economy','economy business market inflation finance'],['Climate','climate weather environment energy'],['Conflict','conflict war military security']],
    local: [['All',''],['Malta','malta maltese'],['Valletta','valletta'],['Rabat','rabat mdina'],['Gozo','gozo'],['Transport','transport traffic road bus ferry']],
    tech: [['All',''],['AI','artificial intelligence ai openai model'],['Security','cyber security breach hack ransomware'],['Mobile','phone iphone android smartphone mobile'],['Computing','computer pc chip gpu processor laptop'],['Startups','startup funding venture']],
    gaming: [['All',''],['Updates & patches','patch update hotfix season dlc expansion roadmap'],['Reviews','review verdict'],['Releases','release launch announced reveal'],['PlayStation','playstation ps5 sony'],['Xbox','xbox game pass microsoft'],['Nintendo','nintendo switch'],['PC','pc steam gpu'],['Mobile','mobile android ios'],['Esports','esports tournament competitive']]
  };

  let articles = [];
  let loading = false;
  let sortMode = 'top';
  let pageSize = 36;
  let feedMode = 'all';
  const requestedCountry = new URLSearchParams(location.search).get('country');
  let selectedCountry = PulseNews.COUNTRIES[requestedCountry] ? requestedCountry : '';
  function followedSources() { try { return JSON.parse(localStorage.getItem('pulsepress:sources') || '[]'); } catch { return []; } }
  function sourceKey(article) { return article.sourceId || article.domain; }
  function visibleArticles(items) {
    let rows = feedMode === 'following' ? items.filter(a => followedSources().includes(sourceKey(a))) : items;
    if (feedMode === 'updates') rows = rows.filter(a => /patch|update|hotfix|season|dlc|expansion|roadmap/i.test(a.title));
    return sortMode === 'newest' ? PulseNews.sortNewest(rows) : sortMode === 'coverage' ? [...rows].sort((a,b)=>(b.coverageSources||1)-(a.coverageSources||1)||(b.topScore||0)-(a.topScore||0)) : sortMode === 'trending' ? PulseNews.sortTrending(rows) : PulseNews.sortTop(rows);
  }
  function renderBulletin(items) {
    const root = $('[data-top-bulletin]'); if (!root) return;
    const ranked = PulseNews.sortTrending(items);
    const breaking = ranked.filter(a => a.alertLevel === 'breaking').slice(0, 3);
    const developing = ['home','world','local'].includes(PAGE) ? ranked.filter(a => a.alertLevel === 'developing').slice(0, 4) : [];
    const top = ranked.filter(a => !breaking.some(b => b.url === a.url)).slice(0, 5);
    const heading = selectedCountry ? PulseNews.COUNTRIES[selectedCountry] + ' headlines' : 'Top news bulletin';
    root.innerHTML =
      (breaking.length ? '<div class="breaking-list"><b><i></i> BREAKING</b>' + breaking.map(a => '<button data-url="' + escapeHTML(a.url) + '"><span>' + escapeHTML(a.title) + '</span><small>' + escapeHTML(a.publisher || a.domain) + ' · ' + escapeHTML(relativeTime(a.publishedAt)) + '</small></button>').join('') + '</div>' : '') +
      '<div class="bulletin-heading"><h2>' + escapeHTML(heading) + '</h2><span>Momentum · coverage · freshness</span></div>' +
      '<div class="bulletin-grid">' + top.map((a,i) => '<button class="bulletin-item" data-url="' + escapeHTML(a.url) + '"><span class="bulletin-rank">' + String(i+1).padStart(2,'0') + '</span><span><small>' + escapeHTML(a.publisher || a.domain) + ' · ' + escapeHTML(relativeTime(a.publishedAt)) + (a.coverageSources > 1 ? ' · ' + a.coverageSources + ' sources' : '') + '</small><strong>' + escapeHTML(a.title) + '</strong></span></button>').join('') + '</div>' +
      (developing.length ? '<div class="developing-list"><b>Developing now</b>' + developing.map(a => '<button data-url="' + escapeHTML(a.url) + '"><span>' + escapeHTML(a.title) + '</span><small>' + escapeHTML(a.publisher || a.domain) + ' · ' + escapeHTML(relativeTime(a.publishedAt)) + '</small></button>').join('') + '</div>' : '');
  }

  function updateEditionStatus() {
    const meta=PulseNews.getMeta(), stamp=meta.updatedAt;
    const stale=meta.stale || !stamp || Date.now()-Date.parse(stamp)>45*60000;
    setStatus(meta.offline?'Offline · saved edition':stale?'Last available edition':'Headlines updated '+relativeTime(stamp), stale?'cached':'live');
    const el=$('[data-last-update]');if(el)el.textContent=stamp?'News refreshed '+formatDate(stamp):'Waiting for publisher updates';
  }
  function renderEdition() {
    const rows=visibleArticles(articles);
    renderBulletin(rows);renderHero(rows);renderQuickPulse(rows);renderMyPulse(rows);renderTopicBar(rows);
    renderGrid(rows);renderMetrics(rows);updateTicker(PulseNews.sortTop(rows));refreshMotion(document);
  }
  function setupEditionControls() {
    const nav=$('.section-nav');
    if(nav&&!nav.querySelector('[href="sources.html"]'))nav.insertAdjacentHTML('beforeend','<a href="sources.html">Sources</a>');
    if(!['home','world','local','tech','gaming'].includes(PAGE))return;
    const main=$('main'); const box=document.createElement('section');box.className='edition-controls';
    box.innerHTML='<div class="country-shortcuts"><a href="world.html?country=uk">United Kingdom</a><a href="world.html?country=france">France</a><a href="local.html">Malta</a><a href="world.html?country=usa">United States</a><a href="world.html?country=germany">Germany</a><a href="world.html">All countries</a></div><div class="edition-options">'+(['home','world'].includes(PAGE)?'<label>Country<select data-country-select><option value="">All countries</option>'+Object.entries(PulseNews.COUNTRIES).map(([k,v])=>'<option value="'+k+'" '+(selectedCountry===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>':'')+'<label>Order<select data-sort-select><option value="top">Top stories</option><option value="newest">Newest first</option><option value="coverage">Most covered</option><option value="trending">Trending now</option><option value="trending">Trending now</option></select></label><label>Reading feed<select data-feed-select><option value="all">All sources</option><option value="following">Following</option>'+(PAGE==='gaming'?'<option value="updates">Game updates &amp; patches</option>':'')+'</select></label><a class="manage-sources" href="sources.html">Follow news sources →</a></div><p class="edition-note">Publisher feeds refresh throughout the day. Top stories use coverage and freshness; publisher traffic totals are not available.</p>';
    main.prepend(box);
    box.querySelector('[data-country-select]')?.addEventListener('change',e=>{location.href='world.html'+(e.target.value?'?country='+encodeURIComponent(e.target.value):'');});
    box.querySelector('[data-sort-select]').addEventListener('change',e=>{sortMode=e.target.value;renderEdition();});
    box.querySelector('[data-feed-select]').addEventListener('change',async e=>{feedMode=e.target.value;activeTopic='All';if(PAGE==='home'&&!selectedCountry){try{articles=feedMode==='following'?await PulseNews.fetchAll():await PulseNews.fetchHome();}catch{}}renderEdition();});
    const bulletin=document.createElement('section');bulletin.className='top-bulletin';bulletin.dataset.topBulletin='';box.after(bulletin);
    if(selectedCountry){const title=$('.page-intro h1');if(title)title.textContent=PulseNews.COUNTRIES[selectedCountry];const desc=$('.page-intro p');if(desc)desc.textContent='The latest reporting, politics and developments from '+PulseNews.COUNTRIES[selectedCountry]+'.';}
    if(PAGE==='gaming'){const weekly=document.createElement('section');weekly.className='weekly-gaming';weekly.dataset.weeklyGaming='';bulletin.after(weekly);loadWeekly();}
  }
  async function loadSources() {
    const root=$('[data-sources]');
    try {
      const sources=await PulseNews.fetchSources();
      let activeCategory='All';
      let filters=$('[data-source-filters]');
      if(!filters){
        filters=document.createElement('div');
        filters.className='source-filters';
        filters.dataset.sourceFilters='1';
        root.before(filters);
      }
      const categories=['All',...new Set(sources.map(s=>s.category).filter(Boolean))];
      function render(){
        const term=($('[data-source-search]')?.value||'').toLowerCase();
        const followed=followedSources();
        filters.innerHTML=categories.map(category=>'<button type="button" data-source-category="'+escapeHTML(category)+'" class="'+(activeCategory===category?'active':'')+'">'+escapeHTML(category)+'</button>').join('');
        const visible=sources.filter(s=>{
          const matchesTerm=(s.name+' '+s.category+' '+s.description).toLowerCase().includes(term);
          const matchesCategory=activeCategory==='All'||s.category===activeCategory;
          return matchesTerm&&matchesCategory;
        }).sort((a,b)=>Number(followed.includes(b.id))-Number(followed.includes(a.id))||Number(b.available)-Number(a.available)||(b.count||0)-(a.count||0)||a.name.localeCompare(b.name));
        root.innerHTML=visible.map(s=>'<article class="source-card '+(followed.includes(s.id)?'is-followed ':'')+(s.available?'':'is-unavailable')+'"><div class="source-card-top"><span class="eyebrow">'+escapeHTML(s.category)+'</span><span class="source-health">'+(s.available?'Live feed':'Temporarily unavailable')+'</span></div><h2>'+escapeHTML(s.name)+'</h2><p>'+escapeHTML(s.description)+'</p><small>'+s.count+' current stories</small><div><button data-follow-source="'+escapeHTML(s.id)+'" aria-pressed="'+followed.includes(s.id)+'">'+(followed.includes(s.id)?'✓ Following':'+ Follow')+'</button><a href="'+escapeHTML(s.url)+'" target="_blank" rel="noopener">Visit publisher ↗</a></div></article>').join('')||'<div class="empty-library"><span>⌕</span><h2>No publishers found</h2><p>Try another name or category.</p></div>';
        $('[data-follow-count]').textContent=followed.length+' source'+(followed.length===1?'':'s')+' followed';
      }
      render();
      $('[data-source-search]').addEventListener('input',render);
      filters.addEventListener('click',e=>{const btn=e.target.closest('[data-source-category]');if(!btn)return;activeCategory=btn.dataset.sourceCategory||'All';render();});
      root.addEventListener('click',e=>{const btn=e.target.closest('[data-follow-source]');if(!btn)return;const id=btn.dataset.followSource,current=followedSources();try{localStorage.setItem('pulsepress:sources',JSON.stringify(current.includes(id)?current.filter(x=>x!==id):[...current,id]));render();}catch{toast('Your browser could not save this preference');}});
      setStatus('Choose your news sources','live');
    }catch{root.innerHTML='<div class="feed-error"><h2>Sources couldn’t load</h2><p>Please refresh and try again.</p></div>';}
  }

  async function loadWeekly(){try{const data=await PulseNews.fetchWeekly();const root=$('[data-weekly-gaming]');root.innerHTML='<div class="bulletin-heading"><div><span class="eyebrow">The last seven days</span><h2>This week in gaming</h2></div><span>'+escapeHTML(data.periodLabel||'Weekly highlights')+'</span></div><p>Major releases, game updates and the stories making headlines. Selected by coverage and publisher prominence.</p><div class="weekly-grid">'+data.articles.slice(0,6).map(a=>'<a class="weekly-story" href="article.html?id='+encodeURIComponent(a.id)+'&edition=gaming">'+(a.image?'<img src="'+escapeHTML(a.image)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">':'')+'<small>'+escapeHTML(a.publisher||a.domain)+'</small><h3>'+escapeHTML(a.title)+'</h3><p>'+escapeHTML(a.summary||'Read the publisher’s coverage.')+'</p></a>').join('')+'</div>';}catch{}}

  let refreshTimer = 0;
  let deckIndex = 0;
  let quickSwiper = null;
  let lenis = null;
  let speechUtterance = null;
  let activeTopic = 'All';
  let libraryMode = 'saved';
  let deferredInstallPrompt = null;
  let settings = loadSettings();
  requestAnimationFrame(() => document.body.classList.add('page-ready'));

  function loadSettings() {
    try {
      return { ...SETTINGS_DEFAULT, ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}') };
    } catch {
      return { ...SETTINGS_DEFAULT };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)); } catch {}
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off';
    document.documentElement.dataset.density = settings.density;
    document.documentElement.dataset.theme = settings.theme || 'system';
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HISTORY) || '[]'); }
    catch { return []; }
  }

  function setHistory(items) {
    try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(items.slice(0, 120))); } catch {}
  }

  function getFollowedTopics() {
    try { return JSON.parse(localStorage.getItem(STORAGE_FOLLOWS) || '[]'); }
    catch { return []; }
  }

  function toggleFollowedTopic(topic) {
    const current = getFollowedTopics();
    const exists = current.includes(topic);
    const next = exists ? current.filter(item => item !== topic) : [...current, topic];
    try { localStorage.setItem(STORAGE_FOLLOWS, JSON.stringify(next)); } catch {}
    return !exists;
  }

  function recordRead(article) {
    const history = getHistory().filter(item => item.url !== article.url);
    setHistory([{ ...article, readAt: new Date().toISOString() }, ...history]);
    try {
      const activity = JSON.parse(localStorage.getItem(STORAGE_ACTIVITY) || '[]');
      const today = new Date().toISOString().slice(0,10);
      localStorage.setItem(STORAGE_ACTIVITY, JSON.stringify([...new Set([today, ...activity])].slice(0,60)));
    } catch {}
  }

  function readingStreak() {
    let days = [];
    try { days = JSON.parse(localStorage.getItem(STORAGE_ACTIVITY) || '[]'); } catch {}
    const set = new Set(days);
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const key = cursor.toISOString().slice(0,10);
      if (!set.has(key)) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function articleMatchesTopic(article, topic) {
    if (!topic || topic === 'All') return true;
    const defs = TOPICS[PAGE] || TOPICS.home;
    const row = defs.find(item => item[0] === topic);
    if (!row) return true;
    if (PAGE === 'home' && row[1]) return article.lane === row[1];
    const terms = row[1].split(/\s+/).filter(Boolean);
    const haystack = (article.title + ' ' + article.domain + ' ' + (article.lane || '')).toLowerCase();
    return terms.some(term => haystack.includes(term.toLowerCase()));
  }

  function hotScore(article) {
    const ageHours = Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / 3600000);
    const freshness = Math.max(0, 100 - ageHours * 4);
    const followed = getFollowedTopics();
    const text = (article.title + ' ' + (article.lane || '')).toLowerCase();
    const interestBoost = followed.some(topic => text.includes(topic.toLowerCase())) ? 24 : 0;
    return freshness + interestBoost + (article.image ? 8 : 0) + Math.min(70, (article.trendScore || 0) * 0.35) + Math.min(30, (article.coverageSources || 1) * 5);
  }

  function filteredArticles(items) {
    return activeTopic === 'All' ? visibleArticles(items) : visibleArticles(items).filter(item => articleMatchesTopic(item, activeTopic));
  }
  function getSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_SAVED) || '[]'); }
    catch { return []; }
  }

  function setSaved(items) {
    try { localStorage.setItem(STORAGE_SAVED, JSON.stringify(items)); } catch {}
    updateSavedBadges();
  }

  function isSaved(article) {
    return getSaved().some(item => item.url === article.url);
  }

  function toggleSaved(article) {
    const saved = getSaved();
    const exists = saved.some(item => item.url === article.url);
    setSaved(exists ? saved.filter(item => item.url !== article.url) : [article, ...saved].slice(0, 150));
    return !exists;
  }

  function updateSavedBadges() {
    const count = getSaved().length;
    $$('[data-saved-count]').forEach(el => el.textContent = String(count));
  }

  function relativeTime(dateString) {
    const time = new Date(dateString).getTime();
    if (!Number.isFinite(time)) return 'recently';
    const diff = Math.max(0, Date.now() - time);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Recently';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function sourceInitials(domain) {
    return String(domain || 'N').replace(/^www\./, '').split(/[.-]/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase().slice(0, 2);
  }

  function imageMarkup(article, className = 'story-media') {
    if (!article.image) {
      return `<div class="${className} media-fallback"><span>${escapeHTML(sourceInitials(article.domain))}</span><i></i></div>`;
    }
    return `<div class="${className}">
      <img src="${escapeHTML(article.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.add('media-fallback');this.remove();">
      <span class="source-chip">${escapeHTML(sourceInitials(article.domain))}</span>
    </div>`;
  }

  function card(article, index = 0, compact = false) {
    const ageHours = Math.max(0, (Date.now() - new Date(article.publishedAt).getTime()) / 3600000);
    const trend = !article.alertLevel && (article.coverageSources || 1) >= 3 && ageHours <= 18;
    const signal = article.alertLevel === 'breaking' ? '<span class="story-alert breaking">Breaking</span>' : article.alertLevel === 'developing' ? '<span class="story-alert developing">Developing</span>' : trend ? '<span class="story-alert trending">Trending</span>' : '';
    return `<article class="news-card reveal ${compact ? 'news-card-compact' : ''} ${article.alertLevel ? 'has-alert' : ''}" data-url="${escapeHTML(article.url)}" style="--delay:${Math.min(index,8) * 45}ms">
      ${imageMarkup(article)}
      <div class="news-card-body">
        <div class="meta-line">
          <span class="source-logo">${escapeHTML(sourceInitials(article.domain))}</span>
          <span>${escapeHTML(article.publisher || article.domain)}</span>
          <span>•</span>
          <time>${escapeHTML(relativeTime(article.publishedAt))}</time>
          ${signal}
        </div>
        <h3><a class="story-link" href="article.html?id=${encodeURIComponent(article.id || '')}&edition=${encodeURIComponent(article.countryCode ? 'country-'+article.countryCode : (article.lane || 'home').toLowerCase())}">${escapeHTML(article.title)}</a></h3>${article.summary ? `<p class="story-summary">${escapeHTML(article.summary)}</p>` : ''}
        <div class="card-footer">
          <span class="story-category">${escapeHTML(article.country || article.lane || 'News')}</span>
          ${article.coverageSources > 1 ? '<span class="coverage-chip">' + article.coverageSources + ' sources</span>' : ''}
          <button class="save-button ${isSaved(article) ? 'saved' : ''}" type="button" aria-label="Save story" data-save-url="${escapeHTML(article.url)}">${isSaved(article) ? '★' : '☆'}</button>
        </div>
      </div>
    </article>`;
  }

  function renderSkeleton(count = 8) {
    const grid = $('[data-news-grid]');
    if (!grid) return;
    grid.innerHTML = Array.from({length: count}, () => '<div class="skeleton-card"><div></div><span></span><span></span><span></span></div>').join('');
  }

  function setStatus(message, mode = 'live') {
    const status = $('[data-live-status]');
    if (!status) return;
    status.dataset.state = mode;
    status.innerHTML = `<i></i><span>${escapeHTML(message)}</span>`;
  }

  function updateClock() {
    const el = $('[data-clock]');
    if (el) el.textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date());
  }

  function updateTicker(items) {
    const track = $('[data-ticker-track]');
    if (!track || !items.length) return;
    const content = PulseNews.sortTrending(items).slice(0, 10).map(item => `<button type="button" data-url="${escapeHTML(item.url)}">${escapeHTML(item.title)} <b>◆</b></button>`).join('');
    track.innerHTML = content + content;
  }

  function renderHero(items) {
    const hero = $('[data-hero]');
    if (!hero || !items.length) return;
    const lead = items[0];
    const side = items.slice(1, 4);
    hero.innerHTML = `<article class="hero-lead reveal" data-url="${escapeHTML(lead.url)}">
      ${lead.image ? `<img src="${escapeHTML(lead.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <div class="hero-shade"></div>
      <div class="hero-copy">
        <span class="eyebrow">Top story · ${escapeHTML(lead.lane || PAGE)}</span>
        <h1>${escapeHTML(lead.title)}</h1>
        <div class="hero-meta"><b>${escapeHTML(lead.domain)}</b><span>${escapeHTML(relativeTime(lead.publishedAt))}</span></div>
        <button class="hero-read" type="button">Read inside PulsePress <span>→</span></button>
      </div>
    </article>
    <div class="hero-rail">${side.map((item, index) => card(item, index, true)).join('')}</div>`;
  }

  function renderQuickPulse(items) {
    const container = $('[data-quick-pulse]');
    if (!container || items.length < 2) return;
    const pool = items.slice(0, 8);

    container.innerHTML = `<div class="quick-title"><div><span class="eyebrow">In focus</span><h2>Quick Pulse</h2></div><span>Swipe through top stories</span></div>
      <div class="swiper quick-swiper">
        <div class="swiper-wrapper">
          ${pool.map(item => `<div class="swiper-slide">
            <article class="quick-card" data-url="${escapeHTML(item.url)}">
              ${imageMarkup(item, 'quick-media')}
              <div class="quick-copy">
                <div class="meta-line"><span>${escapeHTML(item.domain)}</span><span>•</span><time>${escapeHTML(relativeTime(item.publishedAt))}</time></div>
                <h3>${escapeHTML(item.title)}</h3>
                <p>${escapeHTML(item.summary || 'Read the latest report from '+(item.publisher || item.domain)+'.')}</p>
                <button class="quick-open" data-url="${escapeHTML(item.url)}" type="button">Read story <span>→</span></button>
              </div>
            </article>
          </div>`).join('')}
        </div>
        <div class="quick-swiper-footer">
          <button class="quick-swiper-prev" type="button" aria-label="Previous story">←</button>
          <div class="quick-swiper-pagination"></div>
          <button class="quick-swiper-next" type="button" aria-label="Next story">→</button>
        </div>
      </div>`;

    if (quickSwiper?.destroy) quickSwiper.destroy(true, true);
    const swiperEl = $('.quick-swiper', container);
    if (window.Swiper && swiperEl) {
      quickSwiper = new Swiper(swiperEl, {
        slidesPerView: 1,
        spaceBetween: 22,
        speed: 760,
        grabCursor: true,
        loop: pool.length > 2,
        effect: 'creative',
        creativeEffect: {
          prev: { translate: ['-12%', 0, -120], opacity: 0.35, scale: 0.94 },
          next: { translate: ['12%', 0, -120], opacity: 0.35, scale: 0.94 }
        },
        autoplay: { delay: 6800, disableOnInteraction: false, pauseOnMouseEnter: true },
        pagination: { el: $('.quick-swiper-pagination', container), clickable: true },
        navigation: {
          prevEl: $('.quick-swiper-prev', container),
          nextEl: $('.quick-swiper-next', container)
        }
      });
    }
    refreshMotion(container);
  }

  function renderTopicBar(items) {
    if (!TOPICS[PAGE] || ['article','saved','search','briefing'].includes(PAGE)) return;
    let bar = $('[data-topic-toolbar]');
    if (!bar) {
      const anchor = $('.section-heading');
      if (!anchor) return;
      bar = document.createElement('section');
      bar.className = 'topic-toolbar reveal';
      bar.dataset.topicToolbar = '1';
      anchor.before(bar);
    }
    const followed = getFollowedTopics();
    const defs = TOPICS[PAGE];
    bar.innerHTML = '<div class="topic-toolbar-head"><div><span class="eyebrow">Shape your feed</span><h2>Explore topics</h2></div><span>Follow topics to personalize My Pulse</span></div><div class="topic-pills">' + defs.map(item => {
      const name = item[0];
      const active = activeTopic === name ? ' active' : '';
      const followedClass = followed.includes(name) ? ' followed' : '';
      const follow = name === 'All' ? '' : '<button class="topic-follow' + followedClass + '" type="button" data-topic-follow="' + escapeHTML(name) + '" aria-label="Follow ' + escapeHTML(name) + '">' + (followed.includes(name) ? '★' : '☆') + '</button>';
      return '<span class="topic-pill' + active + '"><button type="button" data-topic-filter="' + escapeHTML(name) + '">' + escapeHTML(name) + '</button>' + follow + '</span>';
    }).join('') + '</div>';
    refreshMotion(bar);
  }

  function renderMyPulse(items) {
    if (PAGE !== 'home') return;
    let panel = $('[data-my-pulse]');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'my-pulse reveal';
      panel.dataset.myPulse = '1';
      $('.page-intro')?.after(panel);
    }
    const followed = getFollowedTopics();
    const hot = [...items].sort((a,b) => hotScore(b) - hotScore(a)).slice(0,3);
    const history = getHistory();
    const intro = followed.length ? 'Following ' + followed.map(escapeHTML).join(', ') + '.' : 'Follow topics below and PulsePress will shape this space around what you care about.';
    panel.innerHTML = '<div class="my-pulse-top"><div><span class="eyebrow">Personalized for you</span><h2>My Pulse</h2><p>' + intro + '</p></div><div class="pulse-stats"><span><b>' + readingStreak() + '</b> day streak</span><span><b>' + getSaved().length + '</b> saved</span><span><b>' + history.length + '</b> read</span></div></div><div class="my-pulse-grid"><div class="hot-now"><div class="mini-heading"><span>For you</span><b>Recent coverage</b></div>' + hot.map((item,index) => '<button type="button" class="hot-item" data-url="' + escapeHTML(item.url) + '"><span class="hot-rank">0' + (index+1) + '</span><span><small>' + escapeHTML(item.domain) + '</small><strong>' + escapeHTML(item.title) + '</strong></span></button>').join('') + '</div><div class="pulse-actions"><button type="button" class="pulse-action primary" data-surprise><span>✦</span><b>Surprise me</b><small>Open something worth reading</small></button><button type="button" class="pulse-action" data-open-settings><span>◎</span><b>Tune My Pulse</b><small>Topics, theme and refresh</small></button></div></div>';
    refreshMotion(panel);
  }

  function updateInstallButtons() {
    $$('[data-install-app]').forEach(button => {
      const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      button.hidden = !!standalone;
      button.textContent = deferredInstallPrompt ? 'Install PulsePress' : 'Add PulsePress to device';
    });
  }
  function renderGrid(items) {
    const grid = $('[data-news-grid]');
    if (!grid) return;
    const visible = filteredArticles(items);
    grid.innerHTML = visible.length ? visible.slice(0,pageSize).map((item, index) => card(item, index)).join('') + (visible.length>pageSize?'<button class="load-more" data-load-more type="button">Show more stories ('+(visible.length-pageSize)+' remaining)</button>':'') : '<div class="empty-library"><span>◎</span><h2>No stories in this view yet</h2><p>Choose another topic or <a href="sources.html">follow more news sources</a>.</p></div>';
    activateReveals();
  }

  function renderMetrics(items) {
    const sourceCount = new Set(items.map(item => item.domain)).size;
    const countryCount = new Set(items.map(item => item.country).filter(Boolean)).size;
    $('[data-metric-stories]')?.replaceChildren(document.createTextNode(String(items.length)));
    $('[data-metric-sources]')?.replaceChildren(document.createTextNode(String(sourceCount)));
    $('[data-metric-countries]')?.replaceChildren(document.createTextNode(String(countryCount)));
  }

  function renderBriefing(items) {
    const lanes = $('[data-briefing-lanes]');
    if (!lanes) return;
    const names = ['World','Local','Tech','Gaming'];
    lanes.innerHTML = names.map(name => {
      const laneItems = items.filter(item => item.lane === name).slice(0, 6);
      return `<section class="brief-lane reveal lane-${name.toLowerCase()}">
        <div class="brief-lane-head"><h2>${name}</h2><span>${laneItems.length}</span></div>
        ${laneItems.map((item,index) => `<button class="brief-item" data-url="${escapeHTML(item.url)}" type="button">
          ${item.image ? `<img src="${escapeHTML(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'brief-number',textContent:'0${index+1}'}))">` : `<span class="brief-number">0${index+1}</span>`}
          <span><small>${escapeHTML(item.domain)}</small><strong>${escapeHTML(item.title)}</strong><em>${escapeHTML(relativeTime(item.publishedAt))}</em></span>
        </button>`).join('')}
      </section>`;
    }).join('');
    refreshMotion(lanes);
  }

  function findArticleByUrl(url) {
    return articles.find(item => item.url === url) || getSaved().find(item => item.url === url) || null;
  }

  function openArticle(article) {
    if (!article) return;
    recordRead(article);
    try { localStorage.setItem(STORAGE_CURRENT, JSON.stringify(article)); } catch {}
    document.body.classList.add('page-leaving');
    setTimeout(() => { window.location.href = 'article.html?id='+encodeURIComponent(article.id||'')+'&edition='+encodeURIComponent(article.countryCode?'country-'+article.countryCode:(article.lane||'home').toLowerCase()); }, settings.motion ? 180 : 0);
  }

  function bindClicks() {
    document.addEventListener('click', event => {
      if(event.target.closest('[data-load-more]')){pageSize+=36;renderGrid(articles);return;}
      const topicFilter = event.target.closest('[data-topic-filter]');
      if (topicFilter) {
        activeTopic = topicFilter.dataset.topicFilter || 'All';pageSize=36;
        renderTopicBar(articles);
        renderGrid(articles);
        return;
      }

      const topicFollow = event.target.closest('[data-topic-follow]');
      if (topicFollow) {
        event.preventDefault();
        event.stopPropagation();
        const topic = topicFollow.dataset.topicFollow;
        const nowFollowing = toggleFollowedTopic(topic);
        renderTopicBar(articles);
        renderMyPulse(articles);
        toast(nowFollowing ? 'Following ' + topic : 'No longer following ' + topic);
        return;
      }

      const library = event.target.closest('[data-library-mode]');
      if (library) {
        libraryMode = library.dataset.libraryMode || 'saved';
        renderSavedPage();
        return;
      }

      if (event.target.closest('[data-history-clear]')) {
        localStorage.removeItem(STORAGE_HISTORY);
        renderSavedPage();
        toast('Reading history cleared');
        return;
      }

      if (event.target.closest('[data-surprise]')) {
        if (articles.length) openArticle(articles[Math.floor(Math.random() * articles.length)]);
        return;
      }

      if (event.target.closest('[data-open-settings]')) {
        $('[data-settings-panel]')?.classList.add('open');
        return;
      }
      const save = event.target.closest('[data-save-url]');
      if (save) {
        event.preventDefault();
        event.stopPropagation();
        const article = findArticleByUrl(save.dataset.saveUrl);
        if (!article) return;
        const nowSaved = toggleSaved(article);
        save.classList.toggle('saved', nowSaved);
        save.textContent = nowSaved ? '★' : '☆';
        toast(nowSaved ? 'Story saved' : 'Story removed');
        if (PAGE === 'saved') renderSavedPage();
        return;
      }

      const deck = event.target.closest('[data-deck]');
      if (deck) {
        deckIndex += deck.dataset.deck === 'next' ? 1 : -1;
        renderQuickPulse(articles);
        return;
      }

      if(event.target.closest('a'))return;
      const open = event.target.closest('[data-url]');
      if (open?.dataset.url) {
        const article = findArticleByUrl(open.dataset.url);
        if (article) openArticle(article);
      }
    });
  }

  function toast(message) {
    const el = $('[data-toast]');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function activateReveals(root = document) {
    const nodes = $$('.reveal:not([data-motion-bound])', root);
    if (!nodes.length) return;

    if (!settings.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach(el => {
        el.dataset.motionBound = '1';
        el.classList.add('revealed');
      });
      return;
    }

    if (window.gsap && window.ScrollTrigger) {
      nodes.forEach((el, index) => {
        el.dataset.motionBound = '1';
        gsap.fromTo(el,
          { opacity: 0, y: 34, scale: 0.985, filter: 'blur(8px)' },
          {
            opacity: 1, y: 0, scale: 1, filter: 'blur(0px)',
            duration: 0.8, delay: Math.min(index, 5) * 0.035,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true },
            onComplete: () => el.classList.add('revealed')
          }
        );
      });
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '60px' });
    nodes.forEach(el => {
      el.dataset.motionBound = '1';
      observer.observe(el);
    });
  }

  function bindTilt() {
    if (!settings.motion || matchMedia('(pointer: coarse)').matches) return;
    document.addEventListener('pointermove', event => {
      const card = event.target.closest('.hero-lead, .quick-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      card.style.setProperty('--rx', `${-y * 2.5}deg`);
      card.style.setProperty('--ry', `${x * 3.5}deg`);
    });
    document.addEventListener('pointerout', event => {
      const card = event.target.closest?.('.hero-lead, .quick-card');
      if (card) {
        card.style.removeProperty('--rx');
        card.style.removeProperty('--ry');
      }
    });
  }


  function initMotionEngine() {
    if (!settings.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
    }

    if (window.Lenis && !lenis) {
      lenis = new Lenis({ duration: 1.05, wheelMultiplier: 0.9, touchMultiplier: 1.05, anchors: true });
      if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
      if (window.gsap) {
        gsap.ticker.add(time => lenis?.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = time => { lenis?.raf(time); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    }

    if (window.gsap) {
      gsap.from('.masthead > *', { opacity: 0, y: -14, duration: 0.65, stagger: 0.07, ease: 'power3.out' });
      gsap.from('.section-nav a', { opacity: 0, y: -8, duration: 0.45, stagger: 0.035, ease: 'power2.out', delay: 0.15 });
      gsap.from('.ticker', { opacity: 0, scaleX: 0.96, duration: 0.55, ease: 'power2.out', delay: 0.18 });
    }
    animateHeadlines(document);
  }

  function animateHeadlines(root = document) {
    if (!settings.motion || !window.gsap || !window.SplitType) return;
    $$('.page-intro h1:not([data-split-ready]), .briefing-hero h1:not([data-split-ready]), .search-hero h1:not([data-split-ready]), .article-hero h1:not([data-split-ready])', root).forEach(el => {
      el.dataset.splitReady = '1';
      const split = new SplitType(el, { types: 'words' });
      gsap.from(split.words, {
        opacity: 0,
        yPercent: 110,
        rotate: 2,
        duration: 0.78,
        stagger: 0.035,
        ease: 'power4.out',
        clearProps: 'transform'
      });
    });
  }

  function refreshMotion(root = document) {
    activateReveals(root);
    animateHeadlines(root);

    if (!settings.motion || !window.gsap || !window.ScrollTrigger) return;
    $$('.story-media img:not([data-parallax-ready]), .quick-media img:not([data-parallax-ready])', root).forEach(img => {
      img.dataset.parallaxReady = '1';
      gsap.fromTo(img, { yPercent: -3, scale: 1.04 }, {
        yPercent: 3,
        scale: 1.08,
        ease: 'none',
        scrollTrigger: {
          trigger: img.closest('.news-card, .quick-card') || img,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 0.7
        }
      });
    });
  }

  function setupReaderExperience(article, contexts, related) {
    const toolbar = $('[data-reader-toolbar]');
    if (!toolbar) return;

    const root = document.documentElement;
    const body = document.body;
    const articleCopy = $('.article-copy');
    const timeEl = $('[data-reading-time]');
    const percentEl = $('[data-reading-percent]');
    const speakButton = $('[data-reader-speak]');
    const focusButton = $('[data-reader-focus]');
    const widthButton = $('[data-reader-width]');
    const actions = $('.reader-toolbar-actions', toolbar);
    if (actions && !$('[data-reader-share]', actions)) actions.insertAdjacentHTML('beforeend', '<button type="button" data-reader-share>Share</button><button type="button" data-reader-copy>Copy</button>');
    const shareButton = $('[data-reader-share]', toolbar);
    const copyButton = $('[data-reader-copy]', toolbar);

    const applyReaderPreferences = () => {
      root.style.setProperty('--reader-scale', String(settings.readerScale || 1));
      body.classList.toggle('reader-wide', !!settings.readerWide);
      widthButton?.classList.toggle('active', !!settings.readerWide);
    };

    applyReaderPreferences();

    const words = (articleCopy?.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    if (timeEl) timeEl.textContent = Math.max(1, Math.ceil(words / 220)) + ' min read';

    $$('[data-reader-size]', toolbar).forEach(button => {
      button.addEventListener('click', () => {
        const direction = button.dataset.readerSize === 'up' ? 0.05 : -0.05;
        settings.readerScale = Math.min(1.25, Math.max(0.9, Number((settings.readerScale + direction).toFixed(2))));
        saveSettings();
        applyReaderPreferences();
        toast('Reading size updated');
      });
    });

    widthButton?.addEventListener('click', () => {
      settings.readerWide = !settings.readerWide;
      saveSettings();
      applyReaderPreferences();
    });

    focusButton?.addEventListener('click', () => {
      body.classList.toggle('focus-reading');
      focusButton.classList.toggle('active', body.classList.contains('focus-reading'));
      focusButton.textContent = body.classList.contains('focus-reading') ? 'Exit focus' : 'Focus';
      setTimeout(() => window.ScrollTrigger?.refresh(), 250);
    });

    shareButton?.addEventListener('click', async () => {
      const shareData = { title: article.title, text: article.title, url: article.url };
      if (navigator.share) {
        try { await navigator.share(shareData); } catch {};
      } else {
        try { await navigator.clipboard.writeText(article.url); toast('Story link copied'); } catch { toast('Share is not available in this browser'); }
      }
    });

    copyButton?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(article.url); toast('Story link copied'); }
      catch { toast('Could not copy the link'); }
    });

    speakButton?.addEventListener('click', () => {
      if (!('speechSynthesis' in window)) {
        toast('Listening is not supported by this browser');
        return;
      }

      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        speechUtterance = null;
        speakButton.classList.remove('active');
        speakButton.textContent = 'Listen';
        return;
      }

      const contextText = (contexts || []).slice(0, 4).map(item => item.snippet || item.title).join('. ');
      speechUtterance = new SpeechSynthesisUtterance([article.title, $('.standfirst')?.innerText || '', contextText].filter(Boolean).join('. '));
      speechUtterance.rate = 0.96;
      speechUtterance.pitch = 1;
      speechUtterance.onend = () => {
        speakButton.classList.remove('active');
        speakButton.textContent = 'Listen';
      };
      speakButton.classList.add('active');
      speakButton.textContent = 'Stop';
      speechSynthesis.speak(speechUtterance);
    });

    const updateProgress = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const value = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      $('[data-reading-progress]')?.style.setProperty('transform', 'scaleX(' + value + ')');
      if (percentEl) percentEl.textContent = Math.round(value * 100) + '%';
    };
    addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  async function loadStandard(force = false) {
    if(loading)return;loading=true;
    if(!articles.length){renderSkeleton();setStatus('Loading headlines…','loading');}
    try {
      let next;
      if(selectedCountry)next=await PulseNews.fetchArticles('',{country:selectedCountry,force});
      else if(PAGE==='home')next=feedMode==='following'?await PulseNews.fetchAll(force):await PulseNews.fetchHome(force);
      else next=await PulseNews.fetchArticles(PAGE,{force});
      const changed=JSON.stringify(next)!==JSON.stringify(articles);
      articles=next;
      if(changed || !force) renderEdition();
      updateEditionStatus();
      if(force&&changed)toast('Fresh headlines are ready');
    } catch {
      setStatus(articles.length?'Showing last available stories':'Headlines unavailable','cached');
      if(!articles.length)$('[data-news-grid]').innerHTML='<div class="feed-error"><h2>We couldn’t load this edition</h2><p>Please try again shortly.</p><button data-manual-refresh>Try again</button></div>';
    } finally {loading=false;}
  }

  async function loadBriefing(force = false) {
    setStatus('Building briefing…', 'loading');
    const target = $('[data-briefing-lanes]');
    if (target) target.innerHTML = '<div class="brief-loading">Loading live desks…</div>';
    try {
      articles = await PulseNews.fetchBriefing(force);
      renderBriefing(articles);
      updateTicker(articles);
      renderMetrics(articles);
      updateEditionStatus();
    } catch {
      setStatus('Briefing unavailable', 'error');
    }
  }

  function renderSavedPage() {
    const saved = getSaved();
    const history = getHistory();
    articles = libraryMode === 'saved' ? saved : history;
    const grid = $('[data-news-grid]');
    if (!grid) return;
    let tabs = $('[data-library-tabs]');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'library-tabs reveal';
      tabs.dataset.libraryTabs = '1';
      grid.before(tabs);
    }
    tabs.innerHTML = '<div><button type="button" data-library-mode="saved" class="' + (libraryMode === 'saved' ? 'active' : '') + '">Saved <span>' + saved.length + '</span></button><button type="button" data-library-mode="history" class="' + (libraryMode === 'history' ? 'active' : '') + '">Recently read <span>' + history.length + '</span></button></div>' + (libraryMode === 'history' && history.length ? '<button type="button" class="clear-history" data-history-clear>Clear history</button>' : '');
    if (!articles.length) {
      grid.innerHTML = libraryMode === 'saved' ? '<div class="empty-library"><span>☆</span><h2>No saved stories yet</h2><p>Save stories from any desk and they’ll appear here.</p><a href="index.html">Browse latest news</a></div>' : '<div class="empty-library"><span>◷</span><h2>No reading history yet</h2><p>Stories you open will appear here so you can return to them quickly.</p><a href="index.html">Explore today’s stories</a></div>';
    } else {
      grid.innerHTML = articles.map((item,index) => card(item,index)).join('');
      refreshMotion(grid);
    }
    renderMetrics(articles);
    refreshMotion(tabs);
  }

  async function loadSearch() {
    const input = $('[data-search-input]');
    const params = new URLSearchParams(location.search);
    const initial = params.get('q') || '';
    if (input) input.value = initial;
    if (initial) await runSearch(initial);
  }

  async function runSearch(query) {
    query = String(query || '').trim();
    if (!query) return;
    renderSkeleton(6);
    setStatus(`Searching “${query}”…`, 'loading');
    try {
      articles = await PulseNews.fetchArticles(query, { maxrecords: 50, timespan: '7d', force: true });
      renderGrid(articles);
      renderMetrics(articles);
      updateTicker(articles);
      refreshMotion(document);
      $('[data-search-heading]')?.replaceChildren(document.createTextNode(`Results for “${query}”`));
      setStatus(`${articles.length} matching stories`, 'live');
    } catch {
      setStatus('Search unavailable', 'error');
    }
  }

  async function loadArticle() {
    let article = null;
    try { article = JSON.parse(localStorage.getItem(STORAGE_CURRENT) || 'null'); } catch {}
    const params=new URLSearchParams(location.search);
    if(params.get('id') && article?.id!==params.get('id')) {
      try{article=await PulseNews.findArticle(params.get('id'),params.get('edition')||'home');}catch{article=null;}
    }
    const shell = $('[data-article-shell]');
    if (!article || !shell) {
      if(shell) shell.innerHTML = '<div class="feed-error"><h2>Story no longer in the current edition</h2><p>Choose a story from one of the live desks.</p><a class="button-link" href="index.html">Go to latest news</a></div>';
      return;
    }
    recordRead(article);
    articles = [article];
    const relatedTarget = $('[data-related-grid]');
    const contextTarget = $('[data-context-list]');

    $('[data-article-domain]').textContent = article.domain;
    $('[data-article-title]').textContent = article.title;
    $('[data-article-date]').textContent = formatDate(article.publishedAt);
    $('[data-article-country]').textContent = article.country || 'Global coverage';
    $('[data-article-original]').href = article.url;
    $('[data-article-save]').classList.toggle('saved', isSaved(article));
    $('[data-article-save]').textContent = isSaved(article) ? '★ Saved' : '☆ Save';
    if (article.image) {
      const hero = $('[data-article-image]');
      hero.src = article.image;
      hero.hidden = false;
      hero.onerror = () => { hero.hidden = true; };
    }
    $('[data-article-brief]').textContent = article.summary || 'Read the original report for the complete story.';

    setStatus('Expanding story context…', 'loading');
    const [related, contexts] = await Promise.all([
      PulseNews.fetchRelated(article, 18),
      PulseNews.fetchContext(article),
    ]);
    articles = [article, ...related];

    if (contexts.length) {
      contextTarget.innerHTML = contexts.slice(0, 5).map(item => `<li class="context-item reveal"><p>${escapeHTML(item.snippet || item.title)}</p><span>${escapeHTML(item.domain)} · ${escapeHTML(relativeTime(item.publishedAt))}</span></li>`).join('');
    } else {
      contextTarget.innerHTML = related.slice(0, 4).map(item => `<li class="context-item reveal"><p>${escapeHTML(item.title)}</p><span>${escapeHTML(item.domain)} · ${escapeHTML(relativeTime(item.publishedAt))}</span></li>`).join('') || '<li class="context-item"><p>Read the original publisher for the full report. More coverage appears here as it becomes available.</p></li>';
    }

    relatedTarget.innerHTML = related.slice(0, 12).map((item, index) => card(item,index)).join('');
    $('[data-coverage-count]').textContent = String(related.length + 1);
    $('[data-source-count]').textContent = String(new Set([article.domain, ...related.map(item => item.domain)]).size);
    $('[data-country-count]').textContent = String(new Set([article.country, ...related.map(item => item.country)].filter(Boolean)).size);
    const ageHours = Math.max(0, Math.round((Date.now() - new Date(article.publishedAt)) / 3600000));
    $('[data-story-momentum]').textContent = related.length >= 12 ? 'High' : related.length >= 5 ? 'Building' : 'Focused';
    $('[data-story-age]').textContent = ageHours < 1 ? 'Under 1h' : `${ageHours}h`;
    setStatus('Story ready', 'live');
    setupReaderExperience(article, contexts, related);
    refreshMotion(shell);

    $('[data-article-save]').addEventListener('click', () => {
      const nowSaved = toggleSaved(article);
      $('[data-article-save]').classList.toggle('saved', nowSaved);
      $('[data-article-save]').textContent = nowSaved ? '★ Saved' : '☆ Save';
      toast(nowSaved ? 'Story saved' : 'Story removed');
    });


  }

  function setupSearchForm() {
    const form = $('[data-search-form]');
    if (!form) return;
    form.addEventListener('submit', event => {
      event.preventDefault();
      const query = $('[data-search-input]')?.value.trim();
      if (!query) return;
      history.replaceState(null, '', `search.html?q=${encodeURIComponent(query)}`);
      runSearch(query);
    });
  }

  function setupSettings() {
    const panel = $('[data-settings-panel]');
    if (panel && !$('[data-advanced-settings]', panel)) {
      panel.insertAdjacentHTML('beforeend', '<div data-advanced-settings><div class="setting-group"><h3>Appearance</h3><p>Choose the look that feels best for reading.</p><div class="choice-row"><button data-theme-choice="system">System</button><button data-theme-choice="light">Light</button><button data-theme-choice="dark">Dark</button></div></div><div class="setting-group"><h3>Story density</h3><p>Show comfortable cards or fit more headlines on screen.</p><div class="choice-row"><button data-density-choice="normal">Comfortable</button><button data-density-choice="compact">Compact</button></div></div><div class="setting-group install-setting"><h3>Keep PulsePress close</h3><p>Add PulsePress to your device for faster access and a more app-like reading experience.</p><button class="install-button" type="button" data-install-app>Install PulsePress</button></div></div>');
    }
    $('[data-settings-toggle]')?.addEventListener('click', () => panel?.classList.toggle('open'));
    $('[data-settings-close]')?.addEventListener('click', () => panel?.classList.remove('open'));
    $$('[data-refresh-choice]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.refreshChoice) === settings.refresh);
      button.addEventListener('click', () => {
        settings.refresh = Number(button.dataset.refreshChoice);
        saveSettings();
        scheduleRefresh();
        $$('[data-refresh-choice]').forEach(item => item.classList.toggle('active', item === button));
      });
    });
    $('[data-motion-toggle]')?.addEventListener('click', event => {
      settings.motion = !settings.motion;
      saveSettings();
      event.currentTarget.classList.toggle('active', settings.motion);
    });
    $('[data-motion-toggle]')?.classList.toggle('active', settings.motion);
    $$('[data-theme-choice]').forEach(button => {
      button.classList.toggle('active', button.dataset.themeChoice === settings.theme);
      button.addEventListener('click', () => {
        settings.theme = button.dataset.themeChoice || 'system';
        saveSettings();
        $$('[data-theme-choice]').forEach(item => item.classList.toggle('active', item === button));
        toast(settings.theme === 'system' ? 'Theme follows your device' : settings.theme[0].toUpperCase() + settings.theme.slice(1) + ' theme enabled');
      });
    });
    $$('[data-density-choice]').forEach(button => {
      button.classList.toggle('active', button.dataset.densityChoice === settings.density);
      button.addEventListener('click', () => {
        settings.density = button.dataset.densityChoice || 'normal';
        saveSettings();
        $$('[data-density-choice]').forEach(item => item.classList.toggle('active', item === button));
      });
    });
    $('[data-install-app]')?.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        updateInstallButtons();
      } else {
        toast('Use your browser menu and choose Add to Home screen');
      }
    });
    saveSettings();
    updateInstallButtons();
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    if (['article','saved','sources'].includes(PAGE)) return;
    refreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (PAGE === 'briefing') loadBriefing(true);
      else if (PAGE === 'search') {
        const query = $('[data-search-input]')?.value.trim();
        if (query) runSearch(query);
      } else loadStandard(true);
    }, settings.refresh);
  }


  function setupMobileUtilities() {
    if (!$('.scroll-top')) {
      document.body.insertAdjacentHTML('beforeend', '<button class="scroll-top" type="button" aria-label="Back to top">↑</button>');
    }

    if (!$('.mobile-dock')) {
      const items = [
        ['home','index.html','⌂','Home'],
        ['briefing','briefing.html','◫','Briefing'],
        ['tech','tech.html','◇','Tech'],
        ['gaming','gaming.html','▣','Gaming'],
        ['saved','saved.html','☆','Saved']
      ];
      const activePage = PAGE === 'world' || PAGE === 'local' || PAGE === 'search' ? 'home' : PAGE;
      const markup = items.map(([key,href,icon,label]) =>
        '<a href="' + href + '" class="' + (activePage === key ? 'active' : '') + '"><span class="dock-icon">' + icon + '</span><span>' + label + '</span></a>'
      ).join('');
      document.body.insertAdjacentHTML('beforeend', '<nav class="mobile-dock" aria-label="Primary navigation">' + markup + '</nav>');
    }

    const header = $('.site-header');
    const topButton = $('.scroll-top');
    const update = () => {
      const scrolled = scrollY > 26;
      header?.classList.toggle('is-scrolled', scrolled);
      topButton?.classList.toggle('visible', scrollY > 520);
    };
    addEventListener('scroll', update, { passive: true });
    update();

    topButton?.addEventListener('click', () => {
      if (lenis?.scrollTo) lenis.scrollTo(0, { duration: 1.05 });
      else scrollTo({ top: 0, behavior: settings.motion ? 'smooth' : 'auto' });
    });
  }

  function setupGlobal() {
    requestAnimationFrame(() => document.body.classList.add('page-ready'));
    addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallButtons();
    });
    addEventListener('appinstalled', () => { deferredInstallPrompt = null; updateInstallButtons(); toast('PulsePress installed'); });
    const safe = fn => { try { fn(); } catch {} };
    safe(initMotionEngine);
    safe(setupMobileUtilities);
    safe(bindClicks);
    safe(bindTilt);
    safe(setupSettings);
    safe(setupSearchForm);
    safe(setupEditionControls);
    safe(updateClock);
    safe(updateSavedBadges);
    setInterval(updateClock, 30000);

    $('[data-manual-refresh-global]')?.addEventListener('click', () => {
      if (PAGE === 'briefing') loadBriefing(true);
      else if (!['article','saved','search'].includes(PAGE)) loadStandard(true);
    });
    document.addEventListener('click', event => {
      if (event.target.closest('[data-manual-refresh]')) {
        if (PAGE === 'briefing') loadBriefing(true); else loadStandard(true);
      }
    });

    addEventListener('online', () => {if(['home','world','local','tech','gaming'].includes(PAGE))loadStandard(true);});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&['home','world','local','tech','gaming'].includes(PAGE))loadStandard(true);});
    addEventListener('offline', () => setStatus('Offline', 'error'));
  }

  async function init() {
    setupGlobal();
    if (PAGE === 'sources') await loadSources();
    else if (PAGE === 'article') await loadArticle();
    else if (PAGE === 'briefing') await loadBriefing();
    else if (PAGE === 'saved') renderSavedPage();
    else if (PAGE === 'search') await loadSearch();
    else await loadStandard();
    scheduleRefresh();
    refreshMotion(document);
  }

  window.PulseEnhance = () => {
    try { initMotionEngine(); } catch {}
    try { if (articles.length) renderQuickPulse(articles); } catch {}
    try { refreshMotion(document); } catch {}
  };

  init().catch(() => {
    document.body.classList.add('page-ready');
    setStatus('Please refresh to try again', 'cached');
  });
})();
