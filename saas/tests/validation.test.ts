import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrepare, validateIntent, verifyImage, sha256, readJson, MAX_IMAGE_BYTES } from '../supabase/functions/cna-ingest/validation.ts';

const sample = { whatsapp_message_id:'wamid.TEST/+==', whatsapp_phone_number_id:'1234567890', whatsapp_media_id:'987654321', sender_phone:'15145550100', received_at:'2026-09-15T01:00:00-04:00', original_mime_type:'image/png', evidence_bytes:68 };
test('normalizes event timezone and preserves the exact message ID',()=>{
  const p=validatePrepare(sample); assert.equal(p.received_at,'2026-09-15T05:00:00.000Z'); assert.equal(p.whatsapp_message_id,sample.whatsapp_message_id); assert.equal(p.original_filename,null);
});
test('rejects invalid external fields and attempts to assign status or competition',()=>{
  for(const bad of [null,[],{...sample,status:'approved'},{...sample,competition_id:'other'},{...sample,original_mime_type:'image/svg+xml'},{...sample,evidence_bytes:MAX_IMAGE_BYTES+1},{...sample,evidence_bytes:2.2},{...sample,sender_phone:'<script>'},{...sample,original_filename:'../test.png'},{...sample,received_at:'2026-09-15'},{...sample,received_at:'2035-01-01T00:00:00Z'},{...sample,raw_metadata:{token:'SECRET'}},{...sample,whatsapp_message_id:'x\nheader'},{...sample,expected_sha256:'wrong'}]) assert.throws(()=>validatePrepare(bad));
});
test('checks file size, signature and hash without changing bytes',async()=>{
  const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6G98AAAAASUVORK5CYII=','base64'));
  const before=Buffer.from(png); verifyImage(png,'image/png',png.length); assert.deepEqual(Buffer.from(png),before);
  assert.throws(()=>verifyImage(png,'image/jpeg',png.length)); assert.throws(()=>verifyImage(png,'image/png',png.length+1)); assert.throws(()=>verifyImage(new TextEncoder().encode('<svg/>'),'image/png',6));
  assert.equal((await sha256(png)).length,64); assert.equal(await sha256(png),await sha256(before));
});
test('bounds JSON bodies and rejects malformed input',async()=>{
  await assert.rejects(()=>readJson(new Request('https://local',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(17000)})));
  await assert.rejects(()=>readJson(new Request('https://local',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'})));
  assert.throws(()=>validateIntent('../private')); assert.equal(validateIntent('11111111-1111-4111-8111-111111111111'),'11111111-1111-4111-8111-111111111111');
});

