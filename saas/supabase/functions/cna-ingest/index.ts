import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { InputError, readJson, sha256, validateIntent, validatePrepare, verifyImage, MAX_IMAGE_BYTES } from './validation.ts';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
type Intent = {id:string; object_path:string; completed_at:string|null; payload:ReturnType<typeof validatePrepare>};

Deno.serve(async request => {
  if (request.method !== 'POST') return json({error:'METHOD_NOT_ALLOWED'},405);
  // No CORS: this is a server-to-server endpoint for Make, never a browser API.
  const token = request.headers.get('authorization')?.match(/^Bearer (cna_[a-zA-Z0-9_-]{43,100})$/)?.[1];
  if (!token) return json({error:'UNAUTHORIZED'},401);
  const apiUrl = Deno.env.get('SUPABASE_URL'); const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!apiUrl || !serviceKey) return json({error:'SERVICE_UNAVAILABLE'},503);
  const db = createClient(apiUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const {data:client,error:authError} = await db.from('cna_ingestion_clients').select('id,phone_number_id').eq('token_sha256',await sha256(token)).eq('active',true).maybeSingle();
    if (authError) return json({error:'SERVICE_UNAVAILABLE'},503);
    if (!client) return json({error:'UNAUTHORIZED'},401);
    const action = new URL(request.url).pathname.split('/').filter(Boolean).at(-1);
    if (action !== 'prepare' && action !== 'finalize') return json({error:'NOT_FOUND'},404);
    const body = await readJson(request);
    if (action === 'prepare') {
      const payload = validatePrepare(body);
      if (payload.whatsapp_phone_number_id !== client.phone_number_id) return json({error:'UNAUTHORIZED'},401);
      const {data,error} = await db.rpc('cna_prepare_upload',{p_client_id:client.id,p_payload:payload,p_message_hash:await sha256(payload.whatsapp_message_id)});
      if (error) throw error;
      const intent = data as Intent;
      if (intent.completed_at) {
        const {data:sub,error:subError} = await db.from('cna_submissions').select('id,status').eq('upload_intent_id',intent.id).single();
        if (subError) throw subError;
        return json({upload_intent_id:intent.id,submission:sub,duplicate:true,upload_required:false});
      }
      const {data:signed,error:signError} = await db.storage.from('match-evidence').createSignedUploadUrl(intent.object_path,{upsert:false});
      if (signError) throw signError;
      return json({upload_intent_id:intent.id,bucket:'match-evidence',path:intent.object_path,upload_required:true,upload_url:signed.signedUrl,upload_token:signed.token,upload_method:'PUT',content_type:payload.original_mime_type,expires_in:7200});
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k=>k!=='upload_intent_id')) throw new InputError('Expected upload_intent_id only');
    const id = validateIntent((body as Record<string,unknown>).upload_intent_id);
    const {data:intent,error:findError} = await db.from('cna_upload_intents').select('id,object_path,payload').eq('id',id).eq('client_id',client.id).maybeSingle();
    if (findError) throw findError;
    if (!intent) return json({error:'NOT_FOUND'},404);
    const payload = intent.payload as ReturnType<typeof validatePrepare>;
    const {data:file,error:downloadError} = await db.storage.from('match-evidence').download(intent.object_path);
    if (downloadError || !file) return json({error:'EVIDENCE_UNAVAILABLE',message:'Upload the original before finalizing. Retry finalization if the upload just completed.'},409);
    if (file.size > MAX_IMAGE_BYTES) return json({error:'INVALID_EVIDENCE'},422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    verifyImage(bytes,payload.original_mime_type,payload.evidence_bytes);
    const hash = await sha256(bytes);
    if (payload.expected_sha256 && payload.expected_sha256!==hash) return json({error:'EVIDENCE_HASH_MISMATCH'},409);
    const {data:result,error:finalizeError} = await db.rpc('cna_finalize_upload',{p_client_id:client.id,p_intent_id:id,p_sha256:hash,p_bytes:bytes.length});
    if (finalizeError) throw finalizeError;
    return json(result,result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof InputError) return json({error:'INVALID_INPUT',message:error.message},422);
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    if (message.includes('INGEST_CONFLICT')) return json({error:'CONFLICT',message:'This message was already received with different metadata or evidence.'},409);
    if (message.includes('INGEST_RATE_LIMIT')) return json({error:'RATE_LIMITED'},429);
    if (message.includes('INGEST_UNAUTHORIZED')) return json({error:'UNAUTHORIZED'},401);
    if (message.includes('INGEST_NOT_FOUND')) return json({error:'NOT_FOUND'},404);
    // Do not leak database errors, credentials, sender details or signed URLs into logs/responses.
    console.error('cna-ingest: request failed');
    return json({error:'SERVICE_UNAVAILABLE'},503);
  }
});

