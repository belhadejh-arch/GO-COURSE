# GO COURSE

Arabic RTL language-school web platform with a public catalog and permission-scoped management, teacher, and student portals.

## User requirements

- The platform's name is **GO COURSE**.
- Use the supplied logo with a transparent background and the same blue, lavender, yellow, and pink colors.
- Support Arabic, RTL, mobile and desktop, using Changa.
- The full source requirements are preserved at `.local/conversation-workspace/files/attached_assets/Pasted--1--1792414862470_1792414862470.txt`.
- No fabricated business records, localStorage databases, silent fake integrations, destructive resets, or plaintext passwords.
- Weekly frequency is 2–7, independent of total lessons (16 by default).
- A student can have multiple academic enrollments; never model one language/level as the whole student's academic identity.
- Deployment target: backend on Render, frontend on Vercel, all platform data on Neon. The user will put DATABASE_URL and other secrets in Render.
- The user confirmed `https://go-course-ze56.onrender.com` as the production API. The Vercel bridge uses it by default, with `BACKEND_URL` taking precedence. **Why:** this public origin is safe to commit, and missing an optional Vercel setting must not disconnect the frontend from the already-running database-backed service.

## Run & Operate

- Managed frontend workflow: `artifacts/go-course: web`
- Managed API workflow: `artifacts/api-server: API Server`
- `pnpm run typecheck` — all package type checks
- `pnpm --filter @workspace/api-server test` — permission and domain-rule unit tests
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks and validation
- `pnpm --filter @workspace/db run push` — development schema updates only

## First administrator

Use internal Neon-backed authentication. The primary admin email is `gocourse1@gmail.com`; bootstrap the first password from the Render-only `ADMIN_INITIAL_PASSWORD` secret.
The administrator creates teacher/student accounts and temporary passwords; self-registration is not supported. Users must change temporary passwords on first login.

## Stack & Sources

- React/Vite + Wouter + TanStack Query, Arabic localization and Changa.
- Express 5, opaque HttpOnly cookie sessions and scrypt password hashes in PostgreSQL/Drizzle.
- `lib/api-spec/openapi.yaml`: public contract; generated client and Zod packages must be regenerated after changes.
- `lib/db/src/schema/school.ts`: domain-record graph, identity, file metadata, and teacher-specialty schema.
- `artifacts/api-server/src/lib/school-access.ts`: role, enrollment, and subscription access.
- `artifacts/api-server/src/lib/school-validation.ts`: domain validation.
- `artifacts/api-server/src/lib/school-service.ts`: atomic registration, scheduling, audit, and payment transitions.
- `artifacts/go-course/src/lib/school.ts`: frontend entity/form definitions.
- `artifacts/go-course/src/index.css`: visual tokens.
- `docs/implementation-report.html`: first-build implementation and verification report.
- `docs/operations.md`: setup, limitations, deployment boundaries, backups.

## Architecture decisions

- Domain documents use extensible JSONB content, with foreign-key-protected relationship edges and normalized teacher-language-level specialties. **Why:** varied education content can share CRUD without treating academic relationships as disconnected text.
- Payment confirmation is a transaction; unique business keys prevent duplicate subscriptions/invoices. Preserve financial and academic history.
- Serialize school writes with a PostgreSQL transaction advisory lock. **Why:** a timetable conflict checked from a stale request snapshot must not permit concurrent double booking.
- Only catalog configuration (15 languages × 6 levels) is seeded. **Why:** the requested platform must not represent invented students, courses, or revenue as real.
- Course schedule changes affect future sessions only. Completed/past sessions retain history.
- All environments use the same Neon-backed native accounts; Render uses `FILE_STORAGE_PROVIDER=database`. **Why:** the school requires one login URL and administrator-provisioned accounts, independent of preview hostname or an external identity provider.
- New production file bytes and metadata are stored in Neon; signed ten-minute direct Render transfers bypass the Vercel bridge body-size limits. Existing Replit files are not silently copied.
- Use a direct Neon connection for migrations; automatically derive it from known Neon pooled endpoint hosts without changing credentials/TLS, honoring optional `DATABASE_MIGRATION_URL`. Runtime prefers `DATABASE_URL` but falls back to `DATABASE_MIGRATION_URL` with a warning. Never rewrite arbitrary provider hosts. **Why:** migration locks require a stable session; fallback lets an environment configured with only its direct migration URL start, while the pooled runtime URL remains the preferred setup.
- Normalize deployment origins consistently for CORS and signed file links: accept bare domains as HTTPS and remove trailing slashes, but reject credentials and non-root paths. **Why:** deployment origins are used for browser access and signed file URLs, not external invitation workflows.
- Keep Web API and Node environment types available to the root Vercel function compiler, and explicitly check the API bridge during frontend deployment builds. **Why:** a successful Vite build does not check root serverless functions, and the workspace base config intentionally excludes ambient types.
- Public pages must render independently of auth readiness; private routes and API authorization must not be bypassed. Vercel forwards same-origin API requests to Render, where Neon-backed sessions and role checks are enforced. **Why:** a failing or stale backend must not silently grant access or hide the public landing page.
- `docs/deployment.html`, `render.yaml`, `vercel.json`, and the `.env.*.example` files describe deployment; credentials must never be committed or sent to the frontend.

## Current acceptance boundary

The first build passes static checks and domain unit tests and the public homepage was viewed at desktop and phone widths.
Signed-in UI flows, real invitation delivery, cloud uploads, and payment-confirmation transactions have not yet been exercised end-to-end. Owner configuration is saved in this preview.
Electronic payments are not connected. No claim of full compliance with every acceptance item in the source requirements.
