# Liga CNA · plataforma de liga e historia

Aplicación de una sola liga: portal público, administración, resultados revisados, jugadores, temporadas y estadísticas acumuladas.

## Estado — 27 de septiembre de 2026

- Portal público: inicio, temporadas, tabla, partidos, jugadores, historial y perfiles.
- Administración: clubes, jugadores, cupos, reemplazos, plantillas, traspasos, calendario, reportes y carga histórica manual.
- Los reemplazos heredan puntos del cupo; el histórico atribuye los resultados al club que jugó.
- Aprobación de reportes en una transacción; las correcciones permanecen como borradores hasta aprobarse.
- Temporadas privadas hasta publicarlas. Carga por partidos o por totales, sin duplicar ambos modos.
- Tres migraciones CNA aplicadas; 14 pruebas automáticas pasan y compilación verificada.
- Lectura con Claude preparada, **desactivada y no desplegada**: pendiente autorización de envío de capturas a Anthropic, clave de API y prueba real.
- Ingesta de WhatsApp preparada en `cna-ingest`; Make todavía no tiene número ni credencial configurados. No se ha probado el recorrido con una captura real.
- Eliminatorias admiten resultados por fase; no hay generador automático de llaves, premios ni palmarés de campeones todavía.

Consulta [la guía de uso](docs/USO.md), [el plan](docs/PRODUCT-PLAN.md) y [las verificaciones](docs/VERIFICATION.md).

## Run locally

Requires Node.js 22.12 or later (Node 24 was used).

```sh
npm ci
# Copy .env.example to .env.local and supply the project's PUBLIC client configuration.
npm run dev
```

Open `http://127.0.0.1:5173/` for the public portal or `/admin` for administration. Sign in using the existing Supabase email/password account. The application provides no public registration or role-granting form.

`http://127.0.0.1:5173/preview` is a **development-only demonstration**, with clearly fictitious records, disabled original-download buttons, and no database writes. The demo cannot bypass authentication in the production build.

Environment variables:

| Name | Where | Purpose |
|---|---|---|
| VITE_SUPABASE_URL | Frontend build | Public project URL |
| VITE_SUPABASE_PUBLISHABLE_KEY | Frontend build | Public client key; RLS provides authorization |
| SUPABASE_URL | Edge runtime | Supabase automatically provides this |
| SUPABASE_SERVICE_ROLE_KEY | Edge runtime only | Supabase automatically provides this; never place in a VITE_ variable |

`.env.local`, `.local/`, `.vercel/`, build output, and dependencies are gitignored. Do not upload the entire working folder with its local configuration to a public repository.

## Project layout

```text
src/                         Public league portal, admin forms, private evidence inbox
src/database.types.ts        Types generated from the applied live schema
supabase/migrations/         Additive migrations, matching remote history
supabase/functions/cna-ingest/  Make prepare/finalize API and validation
tests/                       PostgreSQL permission/integrity and input tests
scripts/                     Credential provisioning and read-only live probes
docs/MAKE.md                 Exact Make request/upload contract
docs/VERIFICATION.md         Tests, verified behavior and outstanding checks
vercel.json                  SPA routes and production response headers
```

## Security and scope

- Only users explicitly listed in `cna_admins` can read submissions. Legacy profile roles and user-editable metadata do not confer access.
- Browser users cannot create submissions, change status, alter evidence references, delete evidence, or read integration credentials.
- Make uses an independent high-entropy credential whose SHA-256 digest is stored in the database. A credential is bound to one receiving WhatsApp Business phone-number ID and one competition.
- Preparation reserves a deterministic object path. Finalization checks existence, size, image signature and SHA-256 before creating the receipt and its audit event in one transaction.
- Unfinished uploads remain tracked as intents; they are not shown as successful submissions and are not automatically deleted.
- Evidence links expire after two minutes and are generated only through authorized Storage reads. Already issued links remain bearer links until expiry even if admin access is revoked.
- Application-level immutability does not prevent project owners or service-role credentials from changing Storage objects. Keep privileged credentials restricted.
- Originals mean the exact bytes received from WhatsApp. If WhatsApp compressed an ordinary photo before Make downloaded it, this app cannot restore the original device file. Test sending as an image document if exact device-byte preservation is required.

The new competition is `Liga CNA`; no season or phase is guessed. Configure those relational records when known, then set the integration's season/phase. An upload intent preserves the context it received even if a new season starts before retrying it.

Match processing uses the allowlisted cna_manage RPC. Reports are separate from immutable receipts. Approval validates club occupancy, player registration and scores before atomically updating official results.

### Existing project issues

The project-wide security advisor still flags legacy `liga_data` and `team_members` because row security is disabled, plus legacy privileged functions. These were not modified because changing their policies could break the old application. New evidence does not use those tables or permissions. Before retiring the old application, review and restrict its API surface deliberately. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verification

```sh
npm test
npm run build
# Optional, read-only, requires network access:
npm run test:live
```

The production build type-checks both the browser app and Edge Function. SQL tests execute the actual migration in an isolated PostgreSQL-compatible PGlite database with modeled Supabase roles/Auth/Storage tables; they are not a substitute for testing Supabase Storage's HTTP service.

## Database development

Use the Supabase CLI to create new migrations. The applied migration must not be edited retroactively. Do not run the legacy repository's destructive reset script. Do not push migrations against this shared project until local/remote migration history is reconciled—the project also has older migrations outside this new app's scope.

The CLI may require a writable `SUPABASE_HOME` for its configuration. Set that to a project-local working directory in restricted environments; it is not an application credential.

Generate updated TypeScript types after later migrations. The existing generated file includes the project's legacy schema, but this app only uses `cna_*` tables.

## Vercel production deployment

Deploy this folder as a Vite project, with `npm run build`, output `dist`, Node 22.12+ and both public VITE_ variables. `vercel.json` handles public and admin SPA routes and security headers. Never use a service-role key in the browser build. Verify direct-route refresh, login/logout, private image display, and headers on the final preview deployment before production promotion.

Public portal: https://ligacna-saas.vercel.app/

Admin: https://ligacna-saas.vercel.app/admin

Deployed September 27, 2026 to `mathiasmostajos-projects/ligacna-saas`, deployment `dpl_EbotRFkpezmnMxZC4jYmJG7WtK8d`. Build and browser checks passed; production routes and read-only anonymous RPCs return HTTP 200. The existing `intileagues.com` domain also follows this project.

The project still has root directory `saas`. CLI staging places this app there, excluding environment files and credentials. Only the public Supabase URL and publishable key were supplied as build variables. A draft GitHub PR carries the new source; until merged, the old main branch can still overwrite the CLI deployment on a future push. Do not resume deployments from the old branch without integrating the new app.

Development portal fixtures use `?demo=1` with a browser-local PGlite database and fictitious data. That code is excluded from the production bundle. For the evidence-only fixture, use `/preview` in development.

