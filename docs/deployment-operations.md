# Deployment and recovery operations

**Repository split (2026-10-02):** The API now lives in the independent `inventory-cybence-backend` repository. Frontend source remains in `invetory-cybence-new`. Commands and paths below containing `backend/` describe the previous layout; run backend commands from the new backend root. Frontend client tests now live in frontend `tests/`. See [current repository setup](repository-separation.md).

Phase 15 prepares operational controls. Phase 16 automated release coverage passes; browser acceptance remains pending. Deployment work is deferred at the user's explicit request on 2026-10-01. This runbook is retained for a future requested deployment; no deployment or production restore is performed by development verification.

## Runtime and configuration

Use Node.js 22 or newer; development acceptance uses Node 24.14.0. Keep the existing MySQL 8 and npm lockfiles. Install backend/frontend independently with `npm ci`. Secrets and uploaded files are not source artifacts.

Required backend configuration: `DATABASE_URL`, distinct random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` of at least 32 characters, `FRONTEND_URL` containing explicit origins, and `PORT`. In production set `NODE_ENV=production`, HTTPS frontend origins and HTTPS termination; secure cookies are enforced. Set `TRUST_PROXY_HOPS` only to the exact trusted reverse-proxy hop count (0 by default). Forward Authorization/Cookie headers and do not expose the API directly around a trusted proxy.

Frontend `VITE_API_URL` is a build-time public API URL. Prefer the same HTTPS origin for frontend and API; refresh cookies use SameSite=Lax. Cross-site hosting requires a separately reviewed cookie/CSRF configuration. Never put credentials in a VITE variable. Build with `npm run build`, serve `dist` with SPA fallback, and proxy `/api` and public product images `/uploads`. Private attachments are downloaded through authenticated `/api/attachments/files/:id`, never a static storage directory. Do not serve `.private-storage`, backups, runtime fixtures or `.env`.

Persistent writable paths: existing public `uploads`, `ATTACHMENT_STORAGE_DIR` for private attachments, and a separate `BACKUP_STORAGE_DIR`. Use restrictive directory permissions/Windows ACLs, durable volumes and encrypted host/offsite backups. POSIX file modes alone do not set Windows ACLs. Run the API with a least-privilege OS account.

The local storage provider is `ATTACHMENT_STORAGE_PROVIDER=LOCAL`. Unknown providers fail explicitly; S3/Cloudinary are future adapters. Authorization remains in attachment services and storage never publishes a private filesystem URL.

## Deployment sequence

1. Preserve a verified database + file backup and the existing application version.
2. Stop writes for migration/cutover. Inspect pending SQL and current migration ledger. Never use `migrate reset` or replay the full chain against the persistent development UI schema without a ledger.
3. From the `inventory-cybence-backend` repository root, run `npm ci`, `npm run prisma:generate`, and `npx prisma migrate deploy`. On a new database, configure SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before running `npm run prisma:seed` to bootstrap one administrator and the system role/permission definitions. The seed creates no demo business data and does not reset an existing administrator password.
4. Configure production environment, durable directories and a service manager. Run `npm run deployment:check` against the selected target to verify configuration, connectivity and migration completion. It performs no synthetic business mutations.
5. Build/serve the frontend and start `npm start` for the backend behind TLS. Confirm public `/api/health`, authenticated administrator system health and a scoped real read. Verify session cookie behavior through the deployed origin.
6. Start workers on the intended API instances (`JOBS_ENABLED=true`); database leases coordinate overlapping runs. Set false on instances where workers are unwanted. Monitor structured request/job logs, disk capacity and backup status. Run external uptime/alerting and copy backups off the host.

Rollback code only when compatible with the additive database schema. Recovery/cutover into a verified restored schema is operator-controlled; do not run destructive down migrations over historical inventory.

## Backup administration

Administrator `/system/backups` tracks managed backup requests, database/upload status, byte counts, retention targets and verified manifests. Earlier development safety schemas are preserved but are not registered as hosting backups.

The local adapter requires compatible MySQL 8 `mysqldump` and `mysql` executables. Configure absolute `MYSQLDUMP_PATH`/`MYSQL_PATH`, or use the detected Windows MySQL 8.0 installation / `/usr/bin` / `/usr/local/bin` on Unix. MariaDB command-line tools are not the accepted MySQL adapter. Backup scheduling defaults to **0 (manual only)**; optional `BACKUP_INTERVAL_MINUTES` accepts 60–10080. The API queues a backup; the enabled worker processes it. With workers disabled, no queued backup executes until a worker runs.

Backups contain a single-transaction MySQL SQL dump (schema/data/routines/triggers/events), private attachments including archived bytes, public uploaded images, and a SHA-256/size manifest. The adapter checks all current attachment rows against copied bytes before reporting success. Files are copied after the SQL snapshot; immutable extra uploads may be included. Pause writes for a deployment/recovery backup requiring an exact shared database/file cutoff. Concurrent file changes fail coverage/integrity checks; a failed backup is never advertised as complete.

These are same-host backups. File integrity is not proof of restore readiness or protection from host loss. Hosting must supply offsite encryption/copies, database tool compatibility, capacity monitoring, and a recovery drill. Retention is a minimum review target; automatic backup deletion is disabled and old artifacts remain.

## Confirmed restore

1. Choose a COMPLETE backup and verify its manifest/files.
2. Create a plan with a **new** `techstock_restore_...` schema. Existing database targets, including the original schema, are rejected.
3. Type the exact `RESTORE <backup-id> INTO <target-schema>` phrase from the plan. Plans belong to the requesting administrator and expire 30 minutes after creation.
4. Execute the returned `npm run backup:restore -- --plan <plan-id>` command from the backend repository root on the host. HTTP only records confirmation; it never runs the SQL import. The command claims the plan once and imports into the new schema and a new private `restored-<plan-id>` directory.
5. Verify relational counts, migrations, stock, references and copied file hashes, then perform the final release acceptance in the restored environment. Imported sessions/refresh cookies are invalidated and leases cleared. Review scheduled jobs, database events/routines, and restored configuration before starting the recovered API.
6. Explicitly set `DATABASE_URL` and upload directory mounts to the verified restored targets at maintenance cutover. Retain the previous target for rollback.

A failed import retains its partial new schema/files for investigation. The original database and uploaded bytes are not overwritten. No restore was executed against the original or persistent UI schemas during acceptance.

## Retention and worker behavior

Policies are revisioned. Defaults: read notification archive after 365 days, activity annotation after 730, backup target 30, expired credential cleanup 30; automatic history archival is disabled until enabled. Manual archival requires preview/revision and an explicit confirmation. Each batch caps at 1000 notifications and 1000 activity entries; repeat or let later hourly runs process the backlog. Activity logs remain searchable; read notifications are hidden from the active feed. Rows and upload bytes are retained, and archive restoration is an administrator API action. Product archival, disposed assets, completed procurement and attachment archival keep their existing business history. There is no automatic disposal, stock rewrite, document deletion or attachment-byte purge.

Jobs: reservation expiry each minute, reminders every 15 minutes, stock alerts hourly with daily recipient/source/type dedupe, report schedules each minute, expired credential cleanup hourly, history archival hourly, pending backups each minute, optional scheduled backups. Stable occurrence keys/transaction guards prevent duplicate reservations, notifications and report snapshots. Database leases use server UTC time with a 120-second expiry and 30-second heartbeat. Jobs may retry after a failed run; they record sanitized failures and require healthy database/storage. A process-local active guard also prevents overlap. Keep host/database clocks synchronized.

Scheduled reports belong to the user, refer to a saved configuration and retain a maximum 100-row first-page snapshot. Generation rechecks active account/current grants. Reading a snapshot rechecks current native source grants and its generation warehouse scope; loss of access blocks old snapshots too. Missed occurrences are coalesced into one current run. No email or unbounded full export is implied.

Credential cleanup revokes expired sessions and clears old unusable refresh hashes while retaining session metadata. Old expired/revoked legacy token rows are removed. Password change/reset, deactivation, logout and session revocation invalidate existing access on the next request. Account lockout is five failed attempts for 15 minutes; administrators can clear it. MFA remains a separate future authentication extension.

## Monitoring and API contracts

Public `/api/health` returns basic API/database readiness, HTTP 503 when MySQL is unavailable. Administrator `/api/system/health` adds uptime, runtime/app version, environment, storage, managed backup state and persisted worker run/failure state. This is local operational visibility; external metrics/alert routing is hosting work.

Requests receive a generated `X-Request-ID`. Structured JSON logs contain timestamp, event, request ID, method, matched route pattern, status, duration and sanitized error codes. They omit Authorization/cookies, query strings, payloads and raw exception text. Retain/rotate logs through the host service manager.

Administrator `/api/docs` returns the specification in the normal envelope; `/api/docs/openapi.json` returns raw OpenAPI 3.1 JSON suitable for Swagger/other clients. `/system/docs` provides a protected browser and download. Documentation covers implemented core authentication, catalog, warehouse, stock, procurement, transfer, asset, report/session/operation contracts. Advanced workflow detail remains in the feature docs; the spec does not claim every legacy endpoint has been exhaustively modeled.
