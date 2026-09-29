const CACHE='calc209-v2-netfirst-1';
const OFFLINE='/calc209-v2/';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([OFFLINE,'/calc209-v2/calc209-manifest.webmanifest'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('calc209-v2-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin || !u.pathname.startsWith('/calc209-v2/')) return;
  e.respondWith(
    fetch(e.request,{cache:'no-store'}).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request,copy));
      return res;
    }).catch(()=>caches.match(e.request).then(r=>r||caches.match(OFFLINE)))
  );
});