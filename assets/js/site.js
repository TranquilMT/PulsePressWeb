(() => {
  'use strict';

  const PAGE = document.body.dataset.page || 'home';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHTML = value => String(value || '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
  const STORAGE_SAVED = 'pulsepress:saved';
  const STORAGE_CURRENT = 'pulsepress:current';
  const STORAGE_SETTINGS = 'pulsepress:settings';
  const SETTINGS_DEFAULT = { refresh: 120000, motion: true, density: 'normal', readerScale: 1, readerWide: false };

  let articles = [];
  let refreshTimer = 0;
  let deckIndex = 0;
  let quickSwiper = null;
  let lenis = null;
  let speechUtterance = null;
  let settings = loadSettings();

  function loadSettings() {
    try {
      return { ...SETTINGS_DEFAULT, ...JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || '{}') };
    } catch {
      return { ...SETTINGS_DEFAULT };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings));
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off';
    document.documentElement.dataset.density = settings.density;
  }

  function getSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_SAVED) || '[]'); }
    catch { return []; }
  }

  function setSaved(items) {
    localStorage.setItem(STORAGE_SAVED, JSON.stringify(items));
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
    const pulse = Math.max(18, 100 - Math.floor((Date.now() - new Date(article.publishedAt).getTime()) / 3600000) * 5);
    return `<article class="news-card reveal ${compact ? 'news-card-compact' : ''}" data-url="${escapeHTML(article.url)}" style="--delay:${Math.min(index,8) * 45}ms">
      ${imageMarkup(article)}
      <div class="news-card-body">
        <div class="meta-line">
          <span class="source-logo">${escapeHTML(sourceInitials(article.domain))}</span>
          <span>${escapeHTML(article.domain)}</span>
          <span>•</span>
          <time>${escapeHTML(relativeTime(article.publishedAt))}</time>
        </div>
        <h3>${escapeHTML(article.title)}</h3>
        <div class="card-footer">
          <span class="pulse-score"><i style="--pulse:${pulse}%"></i> Pulse ${pulse}</span>
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
    const content = items.slice(0, 10).map(item => `<button type="button" data-url="${escapeHTML(item.url)}">${escapeHTML(item.title)} <b>◆</b></button>`).join('');
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
                <p>Open the story for current context, related reporting and a clearer view of how coverage is developing.</p>
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

  function renderGrid(items) {
    const grid = $('[data-news-grid]');
    if (!grid) return;
    grid.innerHTML = items.map((item, index) => card(item, index)).join('');
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
    localStorage.setItem(STORAGE_CURRENT, JSON.stringify(article));
    document.body.classList.add('page-leaving');
    setTimeout(() => { window.location.href = 'article.html'; }, settings.motion ? 180 : 0);
  }

  function bindClicks() {
    document.addEventListener('click', event => {
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
    renderSkeleton();
    setStatus('Connecting…', 'loading');
    try {
      if (PAGE === 'home') articles = await PulseNews.fetchHome(force);
      else if (PAGE === 'world') articles = await PulseNews.fetchArticles(PulseNews.QUERIES.world, { maxrecords: 48, timespan: '2d', force });
      else if (PAGE === 'local') articles = await PulseNews.fetchArticles(PulseNews.QUERIES.local, { maxrecords: 48, timespan: '7d', force, lane: 'Local' });
      else if (PAGE === 'tech') articles = await PulseNews.fetchArticles(PulseNews.QUERIES.tech, { maxrecords: 48, timespan: '3d', force, lane: 'Tech' });
      else if (PAGE === 'gaming') articles = await PulseNews.fetchArticles(PulseNews.QUERIES.gaming, { maxrecords: 48, timespan: '3d', force, lane: 'Gaming' });
      else return;

      if (!articles.length) throw new Error('No live stories returned');
      renderHero(articles);
      renderQuickPulse(articles);
      renderGrid(articles.slice(PAGE === 'home' ? 4 : 1));
      renderMetrics(articles);
      updateTicker(articles);
      refreshMotion(document);
      setStatus(`Live · ${relativeTime(new Date().toISOString())}`, 'live');
      $('[data-last-update]')?.replaceChildren(document.createTextNode(`Updated ${new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date())}`));
    } catch (error) {
      console.warn(error);
      setStatus('Live feed unavailable', 'error');
      const grid = $('[data-news-grid]');
      if (grid) grid.innerHTML = `<div class="feed-error"><h2>We couldn’t refresh the latest stories</h2><p>Check your connection and try again. Your saved stories are still available.</p><button data-manual-refresh type="button">Try again</button></div>`;
    }
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
      setStatus('Live briefing', 'live');
    } catch {
      setStatus('Briefing unavailable', 'error');
    }
  }

  function renderSavedPage() {
    articles = getSaved();
    const grid = $('[data-news-grid]');
    if (!grid) return;
    if (!articles.length) {
      grid.innerHTML = '<div class="empty-library"><span>☆</span><h2>No saved stories yet</h2><p>Save stories from any desk and they’ll appear here.</p><a href="index.html">Browse latest news</a></div>';
    } else {
      renderGrid(articles);
    }
    renderMetrics(articles);
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
      setStatus(`${articles.length} live results`, 'live');
    } catch {
      setStatus('Search unavailable', 'error');
    }
  }

  async function loadArticle() {
    let article = null;
    try { article = JSON.parse(localStorage.getItem(STORAGE_CURRENT) || 'null'); } catch {}
    const shell = $('[data-article-shell]');
    if (!article || !shell) {
      shell.innerHTML = '<div class="feed-error"><h2>No story selected</h2><p>Choose a story from one of the live desks.</p><a class="button-link" href="index.html">Go to latest news</a></div>';
      return;
    }
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
    $('[data-article-brief]').textContent = `Coverage from ${article.domain}${article.country ? ` in ${article.country}` : ''}, expanded with related reporting so you can see the wider picture without losing your place.`;

    setStatus('Expanding story context…', 'loading');
    const [related, contexts] = await Promise.all([
      PulseNews.fetchRelated(article, 18),
      PulseNews.fetchContext(article, 8),
    ]);
    articles = [article, ...related];

    if (contexts.length) {
      contextTarget.innerHTML = contexts.slice(0, 5).map(item => `<li class="context-item reveal"><p>${escapeHTML(item.snippet || item.title)}</p><span>${escapeHTML(item.domain)} · ${escapeHTML(relativeTime(item.publishedAt))}</span></li>`).join('');
    } else {
      contextTarget.innerHTML = related.slice(0, 4).map(item => `<li class="context-item reveal"><p>${escapeHTML(item.title)}</p><span>${escapeHTML(item.domain)} · ${escapeHTML(relativeTime(item.publishedAt))}</span></li>`).join('') || '<li class="context-item"><p>No additional sentence-level context is available yet.</p></li>';
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
    saveSettings();
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    if (['article','saved'].includes(PAGE)) return;
    refreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (PAGE === 'briefing') loadBriefing(true);
      else if (PAGE === 'search') {
        const query = $('[data-search-input]')?.value.trim();
        if (query) runSearch(query);
      } else loadStandard(true);
    }, settings.refresh);
  }

  function setupGlobal() {
    initMotionEngine();
    bindClicks();
    bindTilt();
    setupSettings();
    setupSearchForm();
    updateClock();
    updateSavedBadges();
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

    addEventListener('online', () => setStatus('Internet restored', 'live'));
    addEventListener('offline', () => setStatus('Offline', 'error'));
    requestAnimationFrame(() => document.body.classList.add('page-ready'));
  }

  async function init() {
    setupGlobal();
    if (PAGE === 'article') await loadArticle();
    else if (PAGE === 'briefing') await loadBriefing();
    else if (PAGE === 'saved') renderSavedPage();
    else if (PAGE === 'search') await loadSearch();
    else await loadStandard();
    scheduleRefresh();
    refreshMotion(document);
  }

  init();
})();
