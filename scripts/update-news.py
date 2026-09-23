"""Fetch attributed publisher headlines, short excerpts and publisher image URLs."""
import concurrent.futures as cf
import datetime as dt
import email.utils
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET

OUT = Path('data')
NOW = dt.datetime.now(dt.timezone.utc)
COUNTRIES = {'uk':'United Kingdom','france':'France','malta':'Malta','usa':'United States','germany':'Germany','italy':'Italy','spain':'Spain','ireland':'Ireland','australia':'Australia','canada':'Canada','india':'India','japan':'Japan','ukraine':'Ukraine','china':'China','south-africa':'South Africa'}
# Country feeds concern that country, not merely the publisher's headquarters.
SOURCES = [
 ('BBC World','https://feeds.bbci.co.uk/news/world/rss.xml','world',''),
 ('Guardian World','https://www.theguardian.com/world/rss','world',''),
 ('France 24','https://www.france24.com/en/rss','world',''),
 ('BBC UK','https://feeds.bbci.co.uk/news/uk/rss.xml','world','uk'),
 ('Sky News','https://feeds.skynews.com/feeds/rss/uk.xml','world','uk'),
 ('France 24 France','https://www.france24.com/en/france/rss','world','france'),
 ('Times of Malta','https://timesofmalta.com/rss','local','malta'),
 ('MaltaToday','https://www.maltatoday.com.mt/rss/','local','malta'),
 ('Polygon','https://www.polygon.com/feed/','gaming',''),
 ('GameSpot','https://www.gamespot.com/feeds/news/','gaming',''),
 ('Rock Paper Shotgun','https://www.rockpapershotgun.com/feed','gaming',''),
 ('Gematsu','https://www.gematsu.com/feed','gaming',''),
 ('Push Square','https://www.pushsquare.com/feeds/news','gaming',''),
 ('BBC Science','https://feeds.bbci.co.uk/news/science_and_environment/rss.xml','tech',''),
 ('Al Jazeera','https://www.aljazeera.com/xml/rss/all.xml','world',''),
 ('DW','https://rss.dw.com/rdf/rss-en-all','world',''),
 ('BBC Technology','https://feeds.bbci.co.uk/news/technology/rss.xml','tech',''),
 ('Ars Technica','https://feeds.arstechnica.com/arstechnica/index','tech',''),
 ('The Verge','https://www.theverge.com/rss/index.xml','tech',''),
 ('TechCrunch','https://techcrunch.com/feed/','tech',''),
 ('Wired','https://www.wired.com/feed/rss','tech',''),
 ('Engadget','https://www.engadget.com/rss.xml','tech',''),
 ('BleepingComputer','https://www.bleepingcomputer.com/feed/','tech',''),
 ('Tom\'s Hardware','https://www.tomshardware.com/feeds/all','tech',''),
 ('Android Authority','https://www.androidauthority.com/feed/','tech',''),
 ('Eurogamer','https://www.eurogamer.net/feed/news','gaming',''),
 ('PC Gamer','https://www.pcgamer.com/rss/','gaming',''),
 ('IGN','https://feeds.feedburner.com/ign/all','gaming',''),
 ('Nintendo Life','https://www.nintendolife.com/feeds/news','gaming',''),
 ('PlayStation Blog','https://blog.playstation.com/feed/','gaming',''),
 ('Xbox Wire','https://news.xbox.com/en-us/feed/','gaming',''),
 ('VGC','https://www.videogameschronicle.com/feed/','gaming',''),
 ('GamesRadar+','https://www.gamesradar.com/rss/','gaming',''),
 ('Kotaku','https://kotaku.com/rss','gaming',''),
 ('VG247','https://www.vg247.com/feed','gaming',''),
 ('9to5Google','https://9to5google.com/feed/','tech',''),
 ('MacRumors','https://feeds.macrumors.com/MacRumors-All','tech',''),
]
for key, section in {'uk':'uk-news','france':'world/france','usa':'us-news','germany':'world/germany','italy':'world/italy','spain':'world/spain','ireland':'world/ireland','australia':'australia-news','canada':'world/canada','india':'world/india','japan':'world/japan','ukraine':'world/ukraine','china':'world/china','south-africa':'world/southafrica'}.items():
 SOURCES.append(('The Guardian',f'https://www.theguardian.com/{section}/rss','world',key))

class Text(HTMLParser):
 def __init__(self): super().__init__(); self.parts=[]; self.images=[]; self.meta={}; self.skip=0
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ('script','style'): self.skip+=1
  if tag=='img':
   for key in ('src','data-src','data-lazy-src','data-original'):
    if a.get(key): self.images.append(a[key])
   if a.get('srcset'):
    choices=[]
    for bit in a['srcset'].split(','):
     part=bit.strip().split()
     if part: choices.append(part[0])
    self.images.extend(reversed(choices))
  if tag=='source' and a.get('srcset'):
   for bit in a['srcset'].split(','):
    part=bit.strip().split()
    if part: self.images.append(part[0])
  if tag=='meta':
   key=(a.get('property') or a.get('name') or '').strip().lower()
   if key: self.meta[key]=a.get('content','')
 def handle_endtag(self,tag):
  if tag in ('script','style'): self.skip=max(0,self.skip-1)
 def handle_data(self,data):
  if not self.skip: self.parts.append(data)

def clean(value,limit=55):
 p=Text(); p.feed(html.unescape(value or ''))
 words=' '.join(p.parts).split()
 return ' '.join(words[:limit])+('…' if len(words)>limit else '')
def safe_url(value,base=''):
 try:
  u=urllib.parse.urljoin(base,html.unescape(value or ''))
  p=urllib.parse.urlparse(u)
  return u if p.scheme in ('http','https') and p.hostname and not re.match(r'^(localhost|127\.|10\.|192\.168\.|169\.254\.)',p.hostname) else ''
 except ValueError: return ''
def name(e): return e.tag.split('}')[-1].lower()
def field(e,*names):
 return next((''.join(x.itertext()).strip() for x in e if name(x) in names),'')
def date(value):
 try:
  try: t=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
  except ValueError: t=email.utils.parsedate_to_datetime(value)
  if not t.tzinfo: t=t.replace(tzinfo=dt.timezone.utc)
  return t.astimezone(dt.timezone.utc).isoformat()
 except (ValueError,TypeError,AttributeError,OverflowError): return None

def get(url,limit=2500000):
 req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; PulsePress/10; news feed reader)','Accept':'application/rss+xml,application/atom+xml,text/html;q=0.8,*/*;q=0.5'})
 with urllib.request.urlopen(req,timeout=14) as r:
  return r.read(limit).decode('utf-8',errors='replace')

def parse(xml,source):
 publisher,feed,lane,country=source
 root=ET.fromstring(xml)
 items=[]
 for rank,e in enumerate(x for x in root.iter() if name(x) in ('item','entry')):
  title=clean(field(e,'title'),70)
  links=[x for x in e if name(x)=='link']
  link=next((x.attrib.get('href') or x.text or '' for x in links if x.attrib.get('rel','alternate')=='alternate'),'')
  link=safe_url(link,feed)
  published=date(field(e,'pubdate','published','date','updated'))
  if not title or not link or not published: continue
  age=(NOW-dt.datetime.fromisoformat(published)).total_seconds()/3600
  if age < -1 or age > 24*10: continue
  desc=field(e,'description','summary','encoded','content')
  images=[]
  for x in e.iter():
   if name(x) in ('thumbnail','content','enclosure') and x.attrib.get('url'):
    u=safe_url(x.attrib['url'],link)
    if u and (name(x)=='thumbnail' or x.attrib.get('medium')=='image' or x.attrib.get('type','').startswith('image/') or re.search(r'\.(jpe?g|png|webp)(\?|$)',u,re.I)):
     images.append((int(x.attrib.get('width','0') or 0),u))
  p=Text(); p.feed(desc)
  image=max(images,default=(0,''))[1] or next((safe_url(u,link) for u in p.images if safe_url(u,link)),'')
  items.append({'id':hashlib.sha256(link.encode()).hexdigest()[:20],'title':title,'url':link,'image':image,'summary':clean(desc),'domain':urllib.parse.urlparse(link).hostname.removeprefix('www.'),'publisher':publisher,'sourceId':source_id(publisher,feed),'country':COUNTRIES.get(country,''),'countryCode':country,'language':'English','publishedAt':published,'lane':{'world':'World','local':'Local','tech':'Tech','gaming':'Gaming'}[lane],'feedRank':rank+1,'feedUrl':feed})
 return items[:65]

def source_id(publisher,feed):
 if publisher.startswith('BBC'): return 'bbc.com'
 if publisher.startswith('Guardian') or publisher=='The Guardian': return 'theguardian.com'
 if publisher.startswith('France 24'): return 'france24.com'
 return {'Sky News':'news.sky.com','Times of Malta':'timesofmalta.com','Ars Technica':'arstechnica.com','IGN':'ign.com','DW':'dw.com'}.get(publisher,urllib.parse.urlparse(feed).hostname.removeprefix('www.'))

def fetch_source(source):
 try:
  rows=parse(get(source[1]),source)
  if not rows: raise ValueError('No recent valid articles')
  return source,rows,None
 except Exception as e:
  if source[0]=='Times of Malta':
   # Public news index fallback when the publisher RSS service is unavailable.
   try:
    url='https://news.google.com/rss/search?q=site%3Atimesofmalta.com+when%3A7d&hl=en-GB&gl=GB&ceid=GB%3Aen'
    rows=parse(get(url),source)
    for row in rows:
     row['summary']=''; row['title']=re.sub(r' - Times of Malta$','',row['title']); row['viaIndex']=True
    if rows:return source,rows,None
   except Exception: pass
  return source,[],str(e)[:300]

def dedupe(rows):
 found={}
 for row in rows:
  key=re.sub(r'[^\w]+',' ',row['title'].lower()).strip()
  if key not in found: found[key]=row
  elif not found[key].get('image') and row.get('image'): found[key]['image']=row['image']
 return list(found.values())

def rank(rows):
 stop=set('about after before from have this that with will says said news live latest into over more their they than what when'.split())
 tokens=[set(re.findall(r'[a-z]{4,}',r['title'].lower()))-stop for r in rows]
 for i,r in enumerate(rows):
  related=set()
  for j,s in enumerate(rows):
   if i==j or r['domain']==s['domain']: continue
   common=len(tokens[i]&tokens[j])
   if common>=3 and common/max(1,min(len(tokens[i]),len(tokens[j])))>=.55: related.add(s['domain'])
  age=max(0,(NOW-dt.datetime.fromisoformat(r['publishedAt'])).total_seconds()/3600)
  r['coverageSources']=1+len(related)
  prominence=20/(1+r.get('feedRank',50)/5)
  freshness=80/(1+age/12)
  coverage=min(42,len(related)*12)
  r['topScore']=round(freshness+coverage+prominence,2)
  text=(r.get('title','')+' '+r.get('summary','')).lower()
  serious=bool(re.search(r'\b(earthquake|tsunami|wildfire|evacuat|explosion|shooting|mass casualty|landslide|hurricane|typhoon|tornado|major flood|terror attack|missile strike|air strike|drone strike|building collapse|train crash|plane crash|emergency declared|state of emergency)\b',text,re.I))
  severe=bool(re.search(r'\b(killed|dead|deaths|fatal|casualties|missing|injured|hospitali[sz]ed|destroyed|collapsed)\b',text,re.I))
  r['alertLevel']='breaking' if age<=6 and serious and (r['coverageSources']>=2 or severe) else ('developing' if age<=18 and serious else '')
  r['trendScore']=round(r['topScore']+min(55,r['coverageSources']*11)+max(0,28-age*1.8)+(14 if r['alertLevel']=='breaking' else 6 if r['alertLevel']=='developing' else 0),2)
 return sorted(rows,key=lambda r:r['topScore'],reverse=True)

def enrich(row):
 if row.get('image') and row.get('summary'): return
 try:
  p=Text(); p.feed(get(row['url'],600000))
  if not row.get('image'):
   row['image']=safe_url(p.meta.get('og:image:secure_url') or p.meta.get('og:image') or p.meta.get('twitter:image') or p.meta.get('twitter:image:src'),row['url'])
   if not row['image']:
    row['image']=next((safe_url(u,row['url']) for u in p.images if safe_url(u,row['url'])), '')
  if not row.get('summary'): row['summary']=clean(p.meta.get('og:description') or p.meta.get('twitter:description') or p.meta.get('description'))
 except Exception: pass

def main():
 OUT.mkdir(exist_ok=True)
 statuses=[]; buckets={key:[] for key in ['world','local','tech','gaming',*['country-'+k for k in COUNTRIES]]}
 with cf.ThreadPoolExecutor(max_workers=10) as pool:
  for source,rows,error in pool.map(fetch_source,SOURCES):
   publisher,url,lane,country=source
   print(publisher,country or lane,len(rows),error or '',flush=True)
   statuses.append({'sourceId':source_id(publisher,url),'publisher':publisher,'url':url,'countryCode':country,'desk':lane,'articles':len(rows),'ok':not error,'checkedAt':NOW.isoformat()})
   buckets[lane].extend(rows)
   if country: buckets['country-'+country].extend(rows)
 if not any(buckets.values()): raise RuntimeError('Every publisher failed; retaining last successful edition')
 # Keep prior country/desk data on individual publisher outages, without changing its success timestamp.
 old={}
 for key in buckets:
  try: old[key]=json.loads((OUT/(key+'.json')).read_text())
  except (OSError,ValueError): pass
  retained=[r for r in old.get(key,{}).get('articles',[]) if r.get('sourceId') and r.get('publishedAt') and (NOW-dt.datetime.fromisoformat(r['publishedAt'])).total_seconds()<7*86400]
  buckets[key]=dedupe(buckets[key]+retained)
 all_rows=rank(dedupe([r for rows in buckets.values() for r in rows]))
 lookup={r['url']:r for r in all_rows}
 # Metadata enrichment is bounded; feed images remain the preferred source.
 candidates=[r for r in all_rows if (not r.get('image') or not r.get('summary')) and not r.get('viaIndex')][:140]
 with cf.ThreadPoolExecutor(max_workers=12) as pool: list(pool.map(enrich,candidates))
 for key,rows in buckets.items():
  rows=rank(dedupe([{**lookup.get(r['url'],r),'country':r.get('country',''),'countryCode':r.get('countryCode','')} for r in rows]))[:300]
  relevant=[s for s in statuses if ('country-'+s['countryCode']==key if key.startswith('country-') else s['desk']==key)]
  fresh=any(s['ok'] for s in relevant)
  updated=NOW.isoformat() if fresh else old.get(key,{}).get('updatedAt')
  payload={'updatedAt':updated,'checkedAt':NOW.isoformat(),'desk':key,'partial':any(not s['ok'] for s in relevant),'stale':not fresh,'sources':relevant,'articles':rows}
  (OUT/(key+'.json')).write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
 # Search and following use the full retained index, not only front-page stories.
 (OUT/'all.json').write_text(json.dumps({'updatedAt':NOW.isoformat(),'desk':'all','articles':all_rows},ensure_ascii=False,separators=(',',':'))+'\n')
 directory={}
 for status in statuses:
  key=status['sourceId']; category={'world':'World & countries','tech':'Technology','gaming':'Gaming','local':'Malta'}[status['desk']]
  if key not in directory:
   directory[key]={'id':key,'name':{'bbc.com':'BBC News','theguardian.com':'The Guardian','france24.com':'France 24'}.get(key,status['publisher']),'category':category,'url':'https://'+key,'description':('Official game announcements and updates.' if key in ['blog.playstation.com','news.xbox.com'] else category+' reporting, headlines and publisher excerpts.'),'count':0,'available':False}
  directory[key]['available'] |= status['ok']
 for key,row in directory.items(): row['count']=sum(r.get('sourceId')==key for r in all_rows)
 (OUT/'sources.json').write_text(json.dumps(sorted(directory.values(),key=lambda r:r['name']),ensure_ascii=False))
 weekly=[r for r in all_rows if r['lane']=='Gaming' and (NOW-dt.datetime.fromisoformat(r['publishedAt'])).total_seconds()<=7*86400]
 weekly.sort(key=lambda r:r.get('coverageSources',1)*20+40/(1+r.get('feedRank',50)/5)+(12 if re.search(r'release|launch|patch|update|reveal|announce|expansion',r['title'],re.I) else 0),reverse=True)
 highlights=[]; counts={}
 for r in weekly:
  key=r.get('sourceId',r['domain'])
  if counts.get(key,0)>=2: continue
  terms=set(re.findall(r'[a-z]{4,}',r['title'].lower()))-set('with from this that says after have will about their news'.split())
  duplicate=False
  for chosen in highlights:
   other=set(re.findall(r'[a-z]{4,}',chosen['title'].lower()))-set('with from this that says after have will about their news'.split())
   if len(terms & other)>=3 and len(terms & other)/max(1,min(len(terms),len(other)))>=.42: duplicate=True
   if 'xbox' in terms and 'xbox' in other and re.search(r'layoff|jobs|job cuts|cut.*staff',r['title'],re.I) and re.search(r'layoff|jobs|job cuts|cut.*staff',chosen['title'],re.I): duplicate=True
  if duplicate:continue
  counts[key]=counts.get(key,0)+1;highlights.append(r)
  if len(highlights)==12:break
 (OUT/'weekly-gaming.json').write_text(json.dumps({'updatedAt':NOW.isoformat(),'periodStart':(NOW-dt.timedelta(days=7)).isoformat(),'periodEnd':NOW.isoformat(),'periodLabel':(NOW-dt.timedelta(days=6)).strftime('%d %b')+' – '+NOW.strftime('%d %b %Y'),'articles':highlights},ensure_ascii=False,separators=(',',':'))+'\n')
 # Home includes each desk and each country, then fills with ranked reporting.
 selected=[]
 for key in buckets:
  selected.extend(rank(dedupe([lookup.get(r['url'],r) for r in buckets[key]]))[:(22 if not key.startswith('country-') else 5)])
 selected=rank(dedupe(selected+all_rows[:100]))[:220]
 (OUT/'home.json').write_text(json.dumps({'updatedAt':NOW.isoformat(),'desk':'home','partial':any(not s['ok'] for s in statuses),'sources':statuses,'articles':selected},ensure_ascii=False,separators=(',',':'))+'\n')
 (OUT/'countries.json').write_text(json.dumps([{'code':code,'name':label,'count':len(buckets['country-'+code])} for code,label in COUNTRIES.items()]))
 print('Published',len(all_rows),'unique stories;',sum(bool(r.get('image')) for r in all_rows),'publisher images')

if __name__=='__main__': main()
