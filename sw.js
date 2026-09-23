const SHELL='pulsepress-static-v6';
const FILES=['./','./index.html','./world.html','./local.html','./tech.html','./gaming.html','./briefing.html','./saved.html','./search.html','./article.html','./assets/css/styles.css','./assets/js/news.js','./assets/js/site.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||e.request.url.includes('api.gdeltproject.org'))return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(SHELL).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
