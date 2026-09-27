import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validatePrepare} from '../supabase/functions/cna-ingest/validation.ts';

const db=new PGlite();
const admin='11111111-1111-4111-8111-111111111111';
const stranger='22222222-2222-4222-8222-222222222222';
let competition:string; let client:string; let intent:string;
const payload=validatePrepare({whatsapp_message_id:'wamid.test',whatsapp_phone_number_id:'123456789',whatsapp_media_id:'1234',sender_phone:'15145550100',received_at:'2026-09-15T00:00:00Z',original_mime_type:'image/png',evidence_bytes:68});
async function role<T>(who:string, user:string, run:()=>Promise<T>):Promise<T> {
  await db.exec(`begin; set local role ${who}; set local request.jwt.claim.sub='${user}';`);
  try {return await run();} finally {await db.exec('rollback');}
}
async function prepare(body=payload) {return (await db.query<{result:{id:string;object_path:string}}>('select public.cna_prepare_upload($1,$2::jsonb,$3) as result',[client,JSON.stringify(body),'a'.repeat(64)])).rows[0].result;}
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to public;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant all on storage.objects to anon,authenticated,service_role;
    create table public.matches(id integer primary key); insert into public.matches values(1);
    insert into auth.users values('${admin}'),('${stranger}');`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260918043653_cna_evidence_inbox.sql',import.meta.url),'utf8'));
  await db.query('insert into public.cna_admins(user_id) values($1)',[admin]);
  competition=(await db.query<{id:string}>('select id from cna_competitions')).rows[0].id;
  client=(await db.query<{id:string}>('insert into cna_ingestion_clients(name,token_sha256,phone_number_id,competition_id) values($1,$2,$3,$4) returning id',['test','b'.repeat(64),'123456789',competition])).rows[0].id;
});
after(async()=>{await db.close();});
test('anonymous and non-admin users cannot read, write, self-promote or execute ingestion',async()=>{
  await assert.rejects(role('anon','',()=>db.query('select * from cna_submissions')),/permission denied/);
  assert.equal((await role('authenticated',stranger,()=>db.query('select * from cna_competitions'))).rows.length,0);
  await assert.rejects(role('authenticated',stranger,()=>db.query('insert into cna_admins(user_id) values($1)',[stranger])),/permission denied/);
  await assert.rejects(role('authenticated',admin,()=>db.query('update cna_admins set active=false')),/permission denied/);
  await assert.rejects(role('authenticated',admin,()=>prepare()),/permission denied/);
});
test('prepare is duplicate-safe, snapshots context and rejects conflicting redelivery',async()=>{
  const first=await prepare(); intent=first.id;
  assert.match(first.object_path,/^incoming\/2026\/09\/123456789\/[a-f0-9]{64}\.png$/);
  assert.equal((await prepare()).id,first.id);
  await assert.rejects(prepare({...payload,sender_phone:'15145550200'}),/INGEST_CONFLICT/);
  assert.equal((await db.query('select * from cna_submissions')).rows.length,0);
});
test('finalization fails without an uploaded original, and retry creates one receipt and one audit event',async()=>{
  const finalize=()=>db.query<{result:{id:string;duplicate:boolean}}>('select cna_finalize_upload($1,$2,$3,$4) as result',[client,intent,'c'.repeat(64),68]);
  await assert.rejects(finalize(),/INGEST_MISSING_OBJECT/);
  const path=(await prepare()).object_path;
  await db.query("insert into storage.objects(bucket_id,name) values('match-evidence',$1)",[path]);
  const one=(await finalize()).rows[0].result; const two=(await finalize()).rows[0].result;
  assert.equal(one.id,two.id); assert.equal(one.duplicate,false); assert.equal(two.duplicate,true);
  assert.equal((await db.query('select * from cna_audit_events')).rows.length,1);
  assert.equal((await db.query('select * from matches')).rows.length,1);
  await assert.rejects(db.query('select cna_finalize_upload($1,$2,$3,$4)',[client,intent,'d'.repeat(64),68]),/INGEST_CONFLICT/);
});
test('admin reads evidence; non-admin and anonymous reads fail even with broad legacy storage policies',async()=>{
  await db.exec('create policy legacy_public on storage.objects for all to public using(true) with check(true);');
  assert.equal((await role('authenticated',admin,()=>db.query('select * from cna_submissions'))).rows.length,1);
  assert.equal((await role('authenticated',stranger,()=>db.query('select * from cna_submissions'))).rows.length,0);
  assert.equal((await role('authenticated',admin,()=>db.query('select * from storage.objects'))).rows.length,1);
  assert.equal((await role('authenticated',stranger,()=>db.query('select * from storage.objects'))).rows.length,0);
  assert.equal((await role('anon','',()=>db.query('select * from storage.objects'))).rows.length,0);
  await assert.rejects(role('authenticated',admin,()=>db.query("insert into storage.objects(bucket_id,name) values('match-evidence','new.png')")),/row-level security/);
  assert.equal((await role('authenticated',admin,()=>db.query("delete from storage.objects where bucket_id='match-evidence' returning id"))).rows.length,0);
  assert.equal((await role('authenticated',admin,()=>db.query("update storage.objects set name='overwrite' returning id"))).rows.length,0);
});
test('receipts and audit history cannot be edited or deleted; administrators can be revoked',async()=>{
  await assert.rejects(db.query("update cna_submissions set status='approved'"),/immutable/);
  await assert.rejects(db.query('delete from cna_submissions'),/immutable/);
  await assert.rejects(db.query('delete from cna_audit_events'),/immutable/);
  await db.query('update cna_admins set active=false where user_id=$1',[admin]);
  assert.equal((await role('authenticated',admin,()=>db.query('select * from cna_submissions'))).rows.length,0);
});
test('cross-competition season context is rejected by the database',async()=>{
  const other=(await db.query<{id:string}>("insert into cna_competitions(name,slug) values('Other','other') returning id")).rows[0].id;
  const s=(await db.query<{id:string}>("insert into cna_seasons(competition_id,name) values($1,'Season') returning id",[other])).rows[0].id;
  await assert.rejects(db.query('update cna_ingestion_clients set season_id=$1 where id=$2',[s,client]),/foreign key/);
});

