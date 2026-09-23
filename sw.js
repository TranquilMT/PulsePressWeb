const SHELL='pulsepress-static-v8';
const FILES=['./','./index.html','./world.html','./local.html','./tech.html','./gaming.html','./briefing.html','./saved.html','./search.html','./article.html','./assets/css/styles.css','./assets/js/news.js','./assets/js/site.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pulsepress-static-')&&k!==SHELL).map(k=>caches.delete(k))))]))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||e.request.url.includes('api.gdeltproject.org'))return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
    const copy=r.clone();
    caches.open(SHELL).then(c=>c.put(e.request,copy));
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
