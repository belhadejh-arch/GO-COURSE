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

## Run & Operate

- Managed frontend workflow: `artifacts/go-course: web`
- Managed API workflow: `artifacts/api-server: API Server`
- `pnpm run typecheck` — all package type checks
- `pnpm --filter @workspace/api-server test` — permission and domain-rule unit tests
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks and validation
- `pnpm --filter @workspace/db run push` — development schema updates only

## First administrator

Set the non-secret `OWNER_EMAIL` environment variable to the school owner's email.
The matching **verified** Clerk email receives the admin role at login.
Never grant the first arbitrary signup administrator rights. No default/shared passwords.
Development and production Clerk users are isolated; owner email configuration must also be available in production.
Other staff roles are assigned by an admin through Settings after those accounts have signed in.

## Stack & Sources

- React/Vite + Wouter + TanStack Query, Arabic localization and Changa.
- Express 5, Clerk cookie authentication, PostgreSQL/Drizzle.
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
- Preserve managed Clerk/App Storage in this preview; external deployments use `AUTH_MODE=external` and `FILE_STORAGE_PROVIDER=database`. **Why:** Render cannot use the Replit storage sidecar, and the existing preview should not be broken by external configuration.
- New production file bytes and metadata are stored in Neon; signed ten-minute direct Render transfers bypass the Vercel bridge body-size limits. Existing Replit files are not silently copied.
- Use a direct Neon connection for migrations; automatically derive it from known Neon pooled endpoint hosts without changing credentials/TLS, honoring optional `DATABASE_MIGRATION_URL`. Never rewrite arbitrary provider hosts. **Why:** session advisory locks require a stable database session, and rejecting a standard Neon pooled URL unnecessarily blocks Render startup.
- `docs/deployment.html`, `render.yaml`, `vercel.json`, and the `.env.*.example` files describe deployment; credentials must never be committed or sent to the frontend.

## Current acceptance boundary

The first build passes static checks and domain unit tests and the public homepage was viewed at desktop and phone widths.
Signed-in UI flows, real invitation delivery, cloud uploads, and payment-confirmation transactions have not yet been exercised end-to-end. Owner configuration is saved in this preview.
Electronic payments are not connected. No claim of full compliance with every acceptance item in the source requirements.
