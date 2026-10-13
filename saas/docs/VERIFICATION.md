# Verification record — updated September 27, 2026

## League platform release

- Production deployment `dpl_EbotRFkpezmnMxZC4jYmJG7WtK8d` built successfully and was promoted on September 27. Public portal and admin login verified in the browser before promotion.
- League migrations `20260927041430` and `20260927042233` applied to the existing Supabase project. Generated types reflect the live schema.
- 14 automated tests pass. The league tests cover atomic approval, idempotency, invalid corrections, inherited season points versus actual-club history, player transfers, unpublished data privacy, mutation authorization, summary mode and unknown metrics.
- Browser local fixture: saved a match draft, reviewed and approved it, observed updated standings; created a historical-summary season; registered a club. No fixture records were sent to Supabase.
- Desktop/mobile layout inspected; at 390px, document width stayed within viewport while tables scroll internally.
- Production bundle excludes the PGlite fixture and demo auth. `VITE_AI_ENABLED` is off.
- Claude extraction source is type-checked only. Deployment was blocked by automatic review pending explicit authorization to transmit private WhatsApp screenshots to Anthropic; no screenshot was sent. Provider key and real extraction verification are also pending.
- Manual league management is available. Automatic WhatsApp delivery, model accuracy, and a real signed-in production approval were not verified. Advanced playoff bracket generation and champion/award management are not implemented.

The new security-definer public read RPCs intentionally expose curated published league data. `cna_manage` is callable by authenticated users but checks the administrator allowlist before all mutations; anonymous execution is revoked. Each function fixes its search path. Advisor execution warnings for these functions are intentional, not an absence of authorization checks. See [definer RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

- After promotion: `/`, `/tabla`, `/historial`, `/jugadores`, `/admin`, `/admin/submissions` return HTTP 200; CSP present, admin pages use no-store. Both anonymous league RPCs return HTTP 200, admin=false, zero published records. Browser console reported no application errors.

## Earlier evidence-inbox checks

- September 26: Vercel deployment `dpl_DvLLW7aEF3Qbwwci4HkQ2HgfrPrK` built successfully and was promoted to production in `mathiasmostajos-projects/ligacna-saas`.
- Production `/` and `/admin/submissions` return HTTP 200 with the new Liga CNA title. Admin route has `Cache-Control: no-store`, CSP and `X-Frame-Options: DENY`. Existing `intileagues.com/admin/submissions` also serves the new app.
- Browser verified the deployed login form and visual layout on `https://ligacna-saas.vercel.app/admin/submissions`; no application console errors observed. A preceding Vercel sign-in page emitted an unrelated Google sign-in error.

- TypeScript browser and Edge Function checks; production Vite build.
- Ten automated tests: RLS/privilege denial; no self-promotion; duplicate preparation; conflicting replay; missing-object rejection; idempotent finalization/audit count; Storage policy isolation even under a broad legacy policy; receipt/audit immutability; revoked administrator denial; cross-competition foreign keys; malformed input; binary size/signature/hash validation; bounded JSON bodies. Some tests contain multiple assertions.
- Migration applied successfully to the connected Liga CNA project. Remote migration version: `20260918043653`.
- Edge Function `cna-ingest` deployed ACTIVE, version 1.
- Live database role checks: configured admin sees its own allowlist row and competition, cannot update submissions or invoke ingestion RPCs; a non-admin sees no competitions/submissions, cannot insert admin rows, read ingestion clients, or invoke finalization.
- Desktop/mobile browser inspection of development demo, filter empty-state, evidence selection, disabled original actions in demo; mobile at 390px had no horizontal page overflow and no console errors during the checked interaction.
- Real `/admin/submissions` route displayed login with no signed-in session. Final live checks confirmed the bucket is private, anonymous roles lack table/RPC access, and there are zero real receipts.
- Legacy data remained present after project restoration and additive migration.

## Not yet verified / externally blocked

- Real WhatsApp → Make → Storage → dashboard: no Make phone-number binding, integration token, or live captain screenshot yet.
- Actual authenticated admin browser session and real image download: account access is provisioned, but the owner must sign in with their existing credentials. No password was requested or reset.
- Storage signed-upload HTTP behavior and deployed POST handler: local direct-network test was unavailable under current shell permissions. The read-only live-check script is provided for a permitted environment.

The isolated SQL tests use PostgreSQL-compatible PGlite with mocked Supabase Auth and Storage tables. This validates the migration, transactions and policies, but not the complete Supabase Storage service or Make connector.

## Advisor findings

No ERROR findings were reported on the new `cna_*` tables. The two server-only tables (`cna_ingestion_clients`, `cna_upload_intents`) deliberately have RLS enabled with no browser policies and no browser grants; the advisor reports this as informational.

The shared project still has legacy ERROR findings for RLS disabled on `liga_data` and `team_members`, and warnings on legacy privileged functions and Auth leaked-password protection. These were not silently changed. See [RLS remediation guidance](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).

Do not describe the full milestone as complete or the entire legacy project as production-hardened until the outstanding checks are done.

