export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_JSON_BYTES = 16 * 1024;
export class InputError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value: unknown, name: string, max: number, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || (pattern && !pattern.test(value))) throw new InputError(`Invalid ${name}`);
  return value;
}
export function validateIntent(value: unknown): string { return text(value, 'upload_intent_id', 36, UUID); }
export function validatePrepare(input: unknown, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Expected JSON object');
  const v = input as Record<string, unknown>;
  const keys = ['whatsapp_message_id','whatsapp_phone_number_id','whatsapp_media_id','sender_phone','received_at','original_mime_type','original_filename','evidence_bytes','expected_sha256','raw_metadata'];
  if (Object.keys(v).some(k => !keys.includes(k))) throw new InputError('Unexpected field');
  const mime = text(v.original_mime_type, 'original_mime_type', 30);
  if (!['image/jpeg','image/png'].includes(mime)) throw new InputError('Only JPEG and PNG are accepted');
  const received = text(v.received_at, 'received_at', 40);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(received)) throw new InputError('received_at must include timezone');
  const time = Date.parse(received);
  if (!Number.isFinite(time) || time < Date.UTC(2020,0,1) || time > now + 300000) throw new InputError('Invalid event timestamp');
  const size = v.evidence_bytes;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > MAX_IMAGE_BYTES) throw new InputError('Invalid evidence size (maximum 10 MiB)');
  let metadata: Record<string,string> = {};
  if (v.raw_metadata !== undefined && v.raw_metadata !== null) {
    if (typeof v.raw_metadata !== 'object' || Array.isArray(v.raw_metadata)) throw new InputError('Invalid metadata');
    for (const [key,value] of Object.entries(v.raw_metadata)) {
      if (!['caption','message_type','source'].includes(key)) throw new InputError('Unsupported metadata field');
      metadata[key] = text(value, key, key === 'caption' ? 1500 : 40);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(metadata)).byteLength > 4096) throw new InputError('Metadata too large');
  return {
    whatsapp_message_id: text(v.whatsapp_message_id, 'whatsapp_message_id', 512),
    whatsapp_phone_number_id: text(v.whatsapp_phone_number_id, 'whatsapp_phone_number_id', 32, /^[0-9]{5,32}$/),
    whatsapp_media_id: text(v.whatsapp_media_id, 'whatsapp_media_id', 128, /^[0-9]{1,128}$/),
    sender_phone: text(v.sender_phone, 'sender_phone', 16, /^\+?[0-9]{7,15}$/),
    received_at: new Date(time).toISOString(),
    original_mime_type: mime,
    original_filename: v.original_filename == null ? null : text(v.original_filename, 'original_filename', 255, /^[^/\\]+$/),
    evidence_bytes: size,
    expected_sha256: v.expected_sha256 == null ? null : text(v.expected_sha256, 'expected_sha256', 64, /^[0-9a-f]{64}$/),
    raw_metadata: metadata,
  };
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}
export function verifyImage(bytes: Uint8Array, mime: string, expectedSize: number) {
  if (bytes.length !== expectedSize || bytes.length > MAX_IMAGE_BYTES) throw new InputError('Evidence size mismatch');
  const png = [137,80,78,71,13,10,26,10];
  const valid = mime === 'image/png' ? png.every((b,i) => bytes[i] === b) && bytes.length >= 33 :
    mime === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  if (!valid) throw new InputError('Evidence content does not match its image type');
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('Expected application/json');
  if (!request.body || Number(request.headers.get('content-length') || 0) > MAX_JSON_BYTES) throw new InputError('Request too large');
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > MAX_JSON_BYTES) { await reader.cancel(); throw new InputError('Request too large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError('Invalid JSON'); }
}

