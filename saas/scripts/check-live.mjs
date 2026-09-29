// Read-only probes. Does not create users, integrations, objects or submissions.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const env=Object.fromEntries((await readFile('.env.local','utf8')).trim().split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const url=env.VITE_SUPABASE_URL;
const key=env.VITE_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url&&key,'Configure .env.local first');
for(const [label,path,options,allowed] of [
  ['Ingestion denies anonymous requests','/functions/v1/cna-ingest/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'},[401]],
  ['Ingestion denies unregistered tokens','/functions/v1/cna-ingest/prepare',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer cna_${'A'.repeat(43)}`},body:'{}'},[401]],
  ['Anonymous table reads denied','/rest/v1/cna_submissions?select=id',{headers:{apikey:key}},[401,403]],
  ['Anonymous ingestion credentials denied','/rest/v1/cna_ingestion_clients?select=id',{headers:{apikey:key}},[401,403]],
]) {
  const response=await fetch(url+path,{...options,signal:AbortSignal.timeout(15000)});
  assert.ok(allowed.includes(response.status),`${label}: unexpected ${response.status}`);
  console.log(`PASS ${label} (${response.status})`);
}

