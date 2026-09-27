# Make → Liga CNA: exact integration contract

The API is deployed, but no Make credential or phone-number binding has been created. This guide defines the website/database side; it is not a claim that a Make scenario is configured.

## Provision the integration

Obtain the **WhatsApp Business phone-number ID** from Meta/Make (a numeric platform ID, not the phone number people dial). Then run locally:

```sh
node scripts/create-ingestion-credential.mjs YOUR_PHONE_NUMBER_ID
```

The script writes a token and provisioning SQL under gitignored `.local/`. It refuses to overwrite existing files. Execute the generated SQL through a privileged Supabase connection; confirm it returns exactly one client row. Store the token only in Make's secure credential storage. Do not paste it in chat, commit it, or put it in the website. The SQL contains only its hash.

The integration initially binds to the `liga-cna` competition, with season and phase unassigned. Set these through a privileged update only after creating the relevant season/phase records. Existing intents preserve their original context. Disable a credential by setting its row's `active=false`; rotation must explicitly replace its digest. A new phone-number ID requires a separate binding.

## Scenario sequence

1. WhatsApp Business Cloud — Watch Events. Process actual incoming media messages, not delivery/read receipts. Validate the connector's webhook verification and Meta signature handling.
2. Download Media. Accept JPEG/PNG image messages or image documents. Preserve the downloaded binary exactly. Limit is 10 MiB; unsupported/oversize media must fail visibly instead of being compressed.
3. HTTP — POST prepare (below).
4. If `upload_required=true`, HTTP — PUT the original binary to `upload_url`.
5. HTTP — POST finalize with `upload_intent_id`.

## Prepare

`POST https://wrgexwyjivfxijivdbqa.supabase.co/functions/v1/cna-ingest/prepare`

Headers:

```text
Authorization: Bearer <your cna_ integration token>
Content-Type: application/json
```

Example body (map values from the event/download; these are placeholders):

```json
{
  "whatsapp_message_id": "wamid.EXACT_MESSAGE_ID",
  "whatsapp_phone_number_id": "123456789012345",
  "whatsapp_media_id": "987654321012345",
  "sender_phone": "15145550100",
  "received_at": "2026-09-18T04:00:00.000Z",
  "original_mime_type": "image/png",
  "original_filename": null,
  "evidence_bytes": 123456,
  "expected_sha256": null,
  "raw_metadata": {
    "message_type": "image",
    "source": "whatsapp"
  }
}
```

Rules:

- Message IDs are preserved exactly. Do not sanitize, truncate, or replace them with a Make execution ID.
- `received_at` is the WhatsApp message timestamp converted to ISO 8601 with timezone, not Make's retry time.
- `evidence_bytes` must match the downloaded binary's byte length.
- `expected_sha256` is optional, lowercase hexadecimal. Use a trusted SHA-256 of downloaded media if available; normalize a provider's base64 digest before mapping. Finalization always calculates and stores the actual digest even if no expected hash was supplied.
- Preserve a filename only if WhatsApp supplied one. Otherwise use null.
- Metadata allows only `message_type`, `source`, and optional `caption`; never forward entire webhook bundles or authorization headers. Captions are currently limited to 1,500 characters without control characters.
- Do not send status, competition/season/phase IDs, official scores, or player data. The server assigns context from the integration binding and creates only pending receipts.

Successful response includes:

```json
{
  "upload_intent_id": "uuid",
  "bucket": "match-evidence",
  "path": "incoming/2026/09/PHONE_ID/MESSAGE_SHA256.png",
  "upload_required": true,
  "upload_url": "https://.../storage/v1/object/upload/sign/...?token=...",
  "upload_token": "temporary-token",
  "upload_method": "PUT",
  "content_type": "image/png",
  "expires_in": 7200
}
```

Signed upload links last two hours. Treat them as temporary credentials and keep them out of shared logs. Repeating prepare with the exact same normalized body returns the same intent/path and can refresh an expired upload authorization. A completed message returns `upload_required=false`, `duplicate=true`, and the existing submission's ID/status; stop there.

## Upload

HTTP `PUT` to the exact returned `upload_url`.

```text
Content-Type: <returned content_type>
x-upsert: false
```

The request body is the downloaded binary, **not JSON, a base64 string, or a URL**. Do not send the integration token to Storage; the signed URL supplies upload authorization. Do not forward Meta's media-download token.

If an upload reports the object already exists, do not overwrite it. Continue to finalization, which verifies the existing object. If the upload response is ambiguous, finalize first; if the object is absent, retry upload with the same path.

## Finalize

`POST https://wrgexwyjivfxijivdbqa.supabase.co/functions/v1/cna-ingest/finalize`

Use the same integration Authorization and JSON headers as prepare:

```json
{"upload_intent_id":"UUID_FROM_PREPARE"}
```

First success: HTTP 201, `{"id":"submission-uuid","status":"pending","duplicate":false}`.

Repeated success: HTTP 200, same ID with `duplicate:true`.

Finalization downloads the stored bytes and verifies their size, signature and hash. The database then creates the submission and audit event atomically. File upload and database insert are separate operations; intents make interrupted runs recoverable.

## Errors and retries

| Status | Meaning | Action |
|---|---|---|
| 401 | Missing, disabled, invalid, or wrong-number credential | Fix credential/binding; do not retry forever |
| 404 | Invalid endpoint or unknown intent | Check mapping |
| 409 / EVIDENCE_UNAVAILABLE | Object not uploaded/available yet | Retry original upload/finalization at the same path |
| 409 / CONFLICT or EVIDENCE_HASH_MISMATCH | Message replay changed or wrong bytes | Stop for investigation; never overwrite evidence |
| 422 | Invalid fields, content, or size | Correct input; no compression fallback |
| 429 | More than 300 new intents per client per hour | Back off and retain failed execution |
| 503 / network failure | Temporary service issue | Bounded exponential backoff; retain the same event payload and intent |

The limit applies to new upload intents, not every authenticated request. Make should also limit retries and concurrency to avoid repeatedly downloading a failed object. Enable incomplete-execution retention/error visibility in Make; do not mark an execution successful without a submission ID.

## Acceptance test before declaring Milestone 1 complete

1. Send one real screenshot through WhatsApp using the chosen send mode.
2. Confirm the exact downloaded original exists in private Storage.
3. Compare the original downloaded hash and stored hash, and confirm byte size.
4. Sign in to `/admin/submissions` as the configured admin and open/download it.
5. Reprocess the same event: still one object, one submission, one receipt audit event.
6. Retry after upload succeeded but before finalize: finalization recovers without a new object.
7. Try anonymous/non-admin access and confirm denial.
8. Confirm official matches/statistics are unchanged.

The workflow accepts evidence from senders on the configured WhatsApp channel; it does not yet authenticate captain roster membership. Receipt does not imply acceptance of a match result.

