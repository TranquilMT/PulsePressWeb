(() => {
  'use strict';
  const QUERIES = {world:'world', local:'local', tech:'tech', gaming:'gaming'};
  const COUNTRIES = {uk:'United Kingdom',france:'France',malta:'Malta',usa:'United States',germany:'Germany',italy:'Italy',spain:'Spain',ireland:'Ireland',australia:'Australia',canada:'Canada',india:'India',japan:'Japan',ukraine:'Ukraine',china:'China','south-africa':'South Africa'};
  const memory = new Map();
  const pending = new Map();
  let lastMeta = {};
  const safeURL = u => {try {const p=new URL(u);return /^https?:$/.test(p.protocol)?p.href:'';}catch{return '';}};
  function normalize(r) {return {...r,url:safeURL(r.url),image:safeURL(r.image),summary:r.summary || '',country:r.country || '',lane:r.lane || 'World'};}
  function dedupe(items) {const seen=new Set();return items.filter(r=>{const k=r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ');if(seen.has(k))return false;seen.add(k);return true;});}
  function sortNewest(items) {return [...items].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));}
  function sortTop(items) {return [...items].sort((a,b)=>(b.topScore||0)-(a.topScore||0)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));}
  async function snapshot(name, force=false) {
    if (!/^(all|weekly-gaming|home|world|local|tech|gaming|country-[a-z-]+)$/.test(name)) throw new Error('Unknown edition');
    const cached=memory.get(name);
    if(!force && cached && Date.now()-cached.at<60000){lastMeta=cached.data;return cached.data;}
    if(pending.has(name)) return pending.get(name);
    const task=(async()=>{
      const control=new AbortController(), timer=setTimeout(()=>control.abort(),12000);
      try {
        const response=await fetch(`data/${name}.json?t=${Math.floor(Date.now()/60000)}`,{cache:'no-store',signal:control.signal});
        if(!response.ok) throw new Error('Edition unavailable');
        const data=await response.json();
        if(!Array.isArray(data.articles)) throw new Error('Invalid edition');
        data.articles=data.articles.map(normalize).filter(r=>r.url&&r.title);
        memory.set(name,{at:Date.now(),data});lastMeta=data;
        try{localStorage.setItem('pulsepress:edition:'+name,JSON.stringify(data));}catch{}
        return data;
      } catch(error) {
        let stored=cached?.data;
        try{stored=stored||JSON.parse(localStorage.getItem('pulsepress:edition:'+name));}catch{}
        if(stored?.articles?.length){lastMeta={...stored,stale:true,offline:true};return lastMeta;}
        throw error;
      } finally {clearTimeout(timer);pending.delete(name);}
    })();
    pending.set(name,task);return task;
  }
  async function fetchArticles(query,options={}) {
    const name=QUERIES[query] || (COUNTRIES[options.country]?'country-'+options.country:null);
    if(name) return (await snapshot(name,options.force)).articles.slice(0,options.maxrecords||300);
    const rows=(await snapshot('all',options.force)).articles;
    const words=String(query).toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r=>words.every(w=>(r.title+' '+r.summary+' '+r.publisher+' '+r.country).toLowerCase().includes(w))).slice(0,options.maxrecords||300);
  }
  async function fetchHome(force=false){return (await snapshot('home',force)).articles;}
  async function fetchBriefing(force=false){return fetchHome(force);}
  const words = text => new Set(String(text).toLowerCase().match(/[a-z]{4,}/g)?.filter(w=>!['with','from','this','that','says','after','have','will','about','their','news'].includes(w))||[]);
  async function fetchRelated(article,maxrecords=12){
    try{
      const rows=(await snapshot('all')).articles, tokens=words(article.title);
      return rows.map(r=>({r,n:[...words(r.title)].filter(w=>tokens.has(w)).length})).filter(x=>x.r.url!==article.url&&x.n>=3).sort((a,b)=>b.n-a.n).slice(0,maxrecords).map(x=>x.r);
    }catch{return [];}
  }
  async function fetchContext(article){return article.summary?[{title:article.title,snippet:article.summary,url:article.url,domain:article.publisher||article.domain,publishedAt:article.publishedAt}]:[];}
  async function findArticle(id,edition='home') {const rows=(await snapshot(edition)).articles;return rows.find(r=>r.id===id) || (await snapshot('all')).articles.find(r=>r.id===id);}
  window.PulseNews={QUERIES,COUNTRIES,fetchAll:async(force=false)=>(await snapshot('all',force)).articles,fetchWeekly:()=>snapshot('weekly-gaming'),fetchSources:async()=>{const r=await fetch('data/sources.json',{cache:'no-store'});if(!r.ok)throw new Error('Sources unavailable');return r.json();},fetchArticles,fetchHome,fetchBriefing,fetchRelated,fetchContext,findArticle,dedupe,sortNewest,sortTop,keywordQuery:t=>[...words(t)].slice(0,4).join(' '),getMeta:()=>lastMeta};
})();
