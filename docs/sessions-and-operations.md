# Phase 15 — sessions and system operations

Updated 2026-10-01. Implementation and backend/build acceptance pass. Browser acceptance for Phases 13–15 remains pending because the saved browser permission block has not been confirmed cleared. The complete expansion and deployment are not finished.

## Implemented entry points

| Page | Access | Function |
| --- | --- | --- |
| `/profile/sessions` | Authenticated self; administrator account selection | Active device metadata, current session, sign out this/other sessions, administrator revoke-all/unlock |
| `/profile/report-schedules` | Authenticated owner; source permissions checked | Schedule saved configurations, pause/reschedule, run history and scoped snapshot viewing |
| `/system/health` | Administrator only | Database, storage, uptime/runtime/version/environment, persisted worker and managed backup state |
| `/system/backups` | Administrator only | Queue a managed backup, separate database/upload status, sizes/files/retention, file verification, confirmed offline restore plans |
| `/system/retention` | Administrator only | Versioned archival policy, eligible counts, manual confirmation and optional hourly archival |
| `/system/docs` | Administrator only | Browse/download protected OpenAPI 3.1 JSON |

Navigation and route guards match server access. Backend services remain authoritative. No new dependencies, TypeScript, inventory localStorage or mock frontend business data were added.

## Sessions and account security

`Session` stores only a SHA-256 refresh hash plus user/version, IP, bounded user agent, login/last-use/expiry/revocation metadata. Access/refresh JWTs carry session ID, auth version and explicit purpose and retain the existing distinct HS256 secrets. Access authentication checks the active account and live session on every request. Last activity updates at most once per five minutes; refresh updates it immediately. DTOs exclude credential hashes and auth version.

Refresh rotates one hash atomically inside a serializable transaction taking the account lock. Concurrent refresh allows one winner and rejects reuse. Logout identifies the same session even when the supplied cookie predates a rotation. Revocation, password change/admin reset and deactivation reject both access and refresh on the next request; reactivation does not revive old sessions. Administrator self-deactivation is rejected. New passwords are 10+ characters and no more than 72 UTF-8 bytes to avoid bcrypt truncation.

Old access tokens require refresh under the new session contract. A valid retained pre-Phase-15 refresh cookie converts once; its old row is revoked and a new session is created. No legacy bypass accepts unsigned/sessionless access. Normal frontend refresh handles conversion.

Five failed attempts create a 15-minute account lockout. Failed state commits before the generic 401 response. Attempts serialize per account, and successful login/explicit administrator unlock clears the count/lock. Unknown, inactive, locked and wrong-password responses do not identify account existence. Existing IP rate limiting now returns the consistent JSON error envelope. MFA is deliberately a separate future authentication extension.

API: `GET /api/sessions?page=1`, `POST /:id/revoke`, `POST /others/revoke`; administrator `GET /users/:userId`, `POST /users/:userId/revoke` with exact `REVOKE ALL SESSIONS`, and `POST /users/:userId/unlock`. Self lists are owner-only and paged at 20. All session responses use private/no-store.

### Public and connection IP addresses (2026-10-02)

The sessions page distinguishes **Public IP (device reported)** from **Connection IP (server observed)**. A localhost API sees `::1` or `127.0.0.1`; that address cannot reveal the browser's public internet address. The browser therefore calls [ipify's documented IPv4/IPv6 endpoint](https://www.ipify.org/) directly over HTTPS, omitting cookies, authorization and the referrer. This contacts an external IP lookup provider. VPNs, proxies and changes of network can change the result.

Login and refresh responses now include `sessionId`. Sign-in and initial session restore start an optional background lookup without delaying authentication. Opening Sessions updates the current device; Refresh retries detection. Lookup has a five-second timeout, shares simultaneous requests and reuses successful session reports for five minutes unless Refresh is requested. Failures leave any previously stored report intact and show a retry message on Sessions.

`PUT /api/sessions/current/public-ip` accepts the strict body `{ sessionId, ipAddress }`. The authenticated session must match `sessionId`; another account, session or revoked session cannot be updated. Public IPv4/IPv6 input is validated and the server records `reportedPublicIpAt`. `reportedPublicIp` is optional, unverified client metadata and never controls authorization, audit IP, proxy trust or rate limiting. The original `ipAddress` remains the server-observed sign-in address. Responses include both fields and the report timestamp, without credential hashes.

Migration `20261012_session_public_ip` adds two nullable columns, preserving existing records. Existing sessions have no historical public IP to recover; each device must reconnect to report it. With a hosted API, configure `TRUST_PROXY_HOPS` only for the actual trusted proxy topology to obtain the server-observed client address. Browser reporting does not replace that configuration.

## Backup, restore, storage and retention

See [deployment-operations.md](deployment-operations.md) for the full operational runbook, hosting requirements and configuration.

- Local storage adapter provides upload/read/delete/getUrl. Existing rows retain their provider and key. Private URLs point to the permission/scope/integrity-checked download API; unknown providers fail explicitly. Archive retains bytes; physical deletion remains limited to a failed upload's own uncommitted file. S3/Cloudinary are future adapters.
- Managed backup requests are bounded to one pending/running item and processed by the worker. Compatible MySQL tools create a real single-transaction SQL dump; private/archived attachments and public images are copied after the SQL snapshot. SHA-256/size manifest and attachment coverage checks gate COMPLETE. Database/upload failure states are explicit; interrupted runs fail after 25 minutes so the queue can recover.
- Backup retention dates are review targets, with no automatic artifact deletion. Defaults are manual backup scheduling; opt-in interval is 60–10080 minutes. These same-host artifacts still need hosting/offsite protection. Stop writes when an exact shared database/file cutoff is required.
- Restore plans belong to the approving administrator, expire after 30 minutes and require the exact backup/target phrase. HTTP records confirmation only. The offline CLI rechecks active administrator, backup hashes, new target availability and one-time claim. It restores into a **new** `techstock_restore_...` schema and new file directory, validates the copied file set, invalidates imported authentication and clears imported leases/in-progress operations. Failed partial targets are retained. Production cutover is an explicit operator action.
- Retention policy uses optimistic revisions and defaults without a GET insert. Old **read** notifications are marked archived and hidden from the active feed; activity entries remain searchable with an archive notice. Manual archival requires saved revision and `ARCHIVE HISTORY`; automatic archival is opt-in. Each batch caps at 1000 notifications and 1000 logs with supporting indexes. Rows/files remain, and the administrator restore API clears archive markers. Product/disposed asset/completed order/attachment history keeps its existing business workflow.
- Expired session cleanup preserves metadata and clears only old unusable hashes; expired/revoked legacy credential rows are removed after configured age. It never touches live credentials or business inventory.

Models: `BackupRun`, `RestorePlan`, `RetentionPolicy`, `JobLease`, `ReportSchedule`, `ScheduledReportRun`; nullable notification/activity archive markers and nullable expired session hash. Administrative operation IDs/actor/status metadata remain relational and do not contain credential values.

## Jobs and scheduled reports

Database leases use server UTC with 120-second expiry and 30-second heartbeat. A local running guard also prevents overlap. Sanitized run/success/failure state is persisted. API shutdown stops new ticks and waits for active work with a 30-second deadline. `JOBS_ENABLED=false` disables startup workers.

| Job | Default interval |
| --- | --- |
| Reservation expiry | 1 minute |
| Warranty/maintenance reminders | 15 minutes |
| Scoped low/out-of-stock alerts | 60 minutes |
| Saved report schedules | 1 minute |
| Expired credential cleanup | 60 minutes |
| Optional history archival | 60 minutes |
| Pending managed backups | 1 minute |
| Scheduled backups | Disabled by default |

Reminder recipients recheck active account, source grants, warehouse assignments, preferences and existing global switches. Stock jobs use real available quantity and daily user/source/type dedupe. Warranty reminder dedupe includes the actual coverage expiry. Existing transaction-based alerts remain.

Each report schedule belongs to the user and an owned saved configuration, with bounded 1–365 day interval, versioned enable/pause/reschedule and at most 50 schedules. Generation rechecks active user/configuration/native source/warehouse access and stores at most 100 first-page rows. Occurrence uniqueness plus transactional timestamp comparison prevents duplicate runs. Missed occurrences coalesce into a current snapshot. Failure stores sanitized status with no report rows.

Viewing old snapshot data rechecks ownership, current native source grants and the exact generation warehouse scope; loss of warehouse access blocks the snapshot, including previously broad administrator snapshots. Run metadata is paged at 20. No email delivery or all-record export is implied.

## Monitoring and API documentation

Generated `X-Request-ID`, structured JSON request/error/job/start/stop logs; no Authorization, refresh cookie, query, request body or raw exception text. Expected errors retain their actual 4xx classification. Public health remains basic readiness; detailed `/api/system/health` is administrator-only and excludes secrets/paths. Hosting alerting/log rotation/external metrics remain deployment work.

`/api/docs` returns the normal success envelope; `/api/docs/openapi.json` returns raw OpenAPI 3.1 for importing into Swagger/other tools. Both require administrator authentication in every environment. Core routes cover authentication, catalog, warehouses, stock, transfers, procurement/receipts, assets, reports, sessions and operations. Request schemas derive from current Zod contracts; source refinements remain backend rules. This is core documentation, not a claim that every advanced/legacy endpoint has been exhaustively modeled.

Production configuration validates explicit HTTP(S) origins, production HTTPS origins/secure cookies, bounded trusted proxy hops, Node >=22, worker booleans and backup intervals. `npm run deployment:check` verifies environment, DB connectivity, completed migration ledger, storage and backup configuration without fixtures. No deployment is performed.

## Migrations and retained data

- `20261010_sessions`: additive account security fields and Session. Legacy RefreshToken rows retained for one-time conversion.
- `20261011_operations`: additive operation/config/job/schedule tables and archive markers/indexes; expired hash made nullable. No physical stock rewrite, reset or permission reseed.
- Original `techstock_inventory` has **16 successful migrations**. Persistent UI `techstock_test_warehouse_munmaea8` received only inspected pending SQL and still has no ledger; never replay the full chain there.
- Initial Phase 15 snapshots: `techstock_backup_phase15_original_mup11jg8` (60 tables), `techstock_backup_phase15_ui_mup11jg8` (59).
- Before operations migration: `techstock_backup_phase15operations_original_mup2oqgm` (61), `techstock_backup_phase15operations_ui_mup2oqgm` (60).
- All **579 table fingerprints across ten retained Phase 13–15 snapshots match**. Original/persistent stock, movements, counters, exact serials, assets/custody/maintenance and procurement are unchanged across 24 explicitly checked business tables. All older baseline rows remain retained.
- Normal application/security activity was preserved: a legacy refresh row converted to an active session; jobs delivered 23 original and 10 isolated notifications from real stock/preferences/scope. Verification reused an existing original administrator session for read-only API requests, with no new test session or synthetic business fixture in original/persistent schemas.
- Original counts remain 16 products / 5 POs / 0 claims/plans/import batches / 1 existing attachment. No registered original backup or restore was executed during acceptance. Backup/restore/tamper drills used disposable schemas and ignored runtime directories only.

## Acceptance evidence

- Final full disposable MySQL suite: **266 tests / 27 files pass**. Includes real backup/restore/tamper checks, owner/admin/revocation/password/lockout/concurrent refresh, archive retention/restoration, storage path/provider limits, leased job overlap/recovery/errors, notification dedupe/preferences, scheduled report exact values/scope/revocation/idempotency and protected OpenAPI references.
- Separate unit run: **50 pass / 216 integration checks skipped**.
- Final production frontend build passes: **2504 modules**. Prisma validation/generation, both incremental deployments and diff whitespace checks pass. No Phase 15 dependencies added.
- **95 protected original API reads + both public health endpoints pass**, covering the new routes and all 23 report/export pages, retained feature lists/details and receipt destinations. Read JWT remained in memory and reused a real active session.
- Deployment configuration check passes: original connected, 16 migrations, LOCAL storage available, MySQL backup tools configured, scheduling manual-only, worker enabled. All seven default jobs recorded successful runs with no current error.
- Final local APIs: original 5000, isolated 5050; existing previews 5173/5176 preserved. Server processes are owned by this continuation but inspect current ownership before restarting; identifiers can change. Ignored evidence: `backend/.test-runtime/phase15-*` and `phase15operations-*`.
- Browser tools were not retried or bypassed. Pending desktop/mobile/keyboard/error/conflict/persistence/console checks for session controls, administrator health/backup/restore-plan/retention/docs and scheduled snapshot UI, plus all Phase 13/14 pending browser checks.

Next: Phase 16 / Priority 11 final release coverage and deployment acceptance. Verify the earlier browser backlog when permission is actually enabled, production-origin cookies/proxy, hosting backup/offsite configuration/recovery drill, dependency advisories and operational deployment checks. Preserve WIP and request an explicit destination/release before publishing. No commit, push, merge or deployment was performed; HEAD remains `a33a2fb`.
