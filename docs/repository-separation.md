# Frontend and backend repositories

Completed locally on 2026-10-02 (Asia/Manila).

| Application | Local directory | GitHub repository |
| --- | --- | --- |
| React/Vite frontend | `C:\Users\kingp\Desktop\Codes\Inventory-Cybence\invetory-cybence-new` | [Soozu/invetory-cybence-new](https://github.com/Soozu/invetory-cybence-new) |
| Express/Prisma/MySQL backend | `C:\Users\kingp\Desktop\Codes\Inventory-Cybence\inventory-cybence-backend` | [Soozu/inventory-cybence-backend](https://github.com/Soozu/inventory-cybence-backend) |

The existing frontend folder spelling is retained. The backend directory is now a separate Git repository at the same parent directory, not a submodule or a nested folder in the frontend. Backend-only commits were extracted with `git subtree split`; the original monorepo history remains available in the frontend history for reference and rollback.

## Development

Start the backend from `inventory-cybence-backend`:

```bash
npm ci
npm run prisma:generate
npm run dev
```

For a fresh checkout, first copy `.env.example` to `.env` and configure the intended database, JWT secrets and frontend origins. Review pending migrations before `npx prisma migrate deploy`. Do not seed/reset an existing database as part of this split.

Start the frontend from `invetory-cybence-new`:

```bash
npm ci
npm run dev
```

The frontend defaults to `http://localhost:5000/api`; its optional `.env` can set `VITE_API_URL`. The backend's existing local `.env` still uses port 5000 and permits localhost ports 5173/5174. If Vite chooses a different port, add its exact origin to backend `FRONTEND_URL` and restart the API. No database destination or authentication secrets were changed.

Each repository owns its package manifest, lockfile and `node_modules`. API communication remains HTTP; neither application imports the other repository's source. Backend migrations, seed, workers, scripts and backend tests moved to the backend root. The existing frontend API transport and dashboard client tests moved to frontend `tests/`, with Vitest 3.2.7 and independent `npm test` / `npm run test:transport` commands. The split did not run the test suites.

## Preserved private runtime files

The backend's existing `.env`, uploads, private attachments/backups, logs, installed modules and local runtime evidence moved into the new backend directory. They remain ignored by the backend `.gitignore`. Relative storage paths resolve from the new backend root. There are no new database migrations for the split and no inventory data operations.

## Documentation and release status

Existing feature/acceptance documentation is retained in both repositories as historical system context. Paths prefixed with `backend/` in those records now refer to the backend repository root; the two frontend test files are the exception noted above. The backend README and this document are the current setup instructions.

The browser public IP fix is included in both applications. Public IP remains optional browser-reported session metadata; the server-observed IP remains separate. Browser acceptance, dependency maintenance, missing imported serial reconciliation and production deployment remain pending. Deployment is still deferred.
