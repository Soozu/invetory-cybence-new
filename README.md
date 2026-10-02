# TechStock Inventory Frontend

For application workflows and daily operation, see the [complete system user guide](docs/system-user-guide.md).

Current expansion status and verification: [Phase 16 release checks](docs/release-verification.md), [unfinished work handoff](docs/unfinished-work-context.md). The frontend is hosted on Vercel and the backend on Railway. Production acceptance, Phase 13–15 browser acceptance and dependency maintenance remain pending; older phase notes describe historical local verification.

TechStock is an IT inventory, procurement, and asset management system. The existing responsive React interface now uses an Express API, Prisma, and MySQL. Product, stock, order, asset, user, and audit records are stored in MySQL. Browser storage is used only for the visual theme.

## Repositories

This repository contains the React/Vite frontend. The Express/Prisma/MySQL API is maintained independently in [Soozu/inventory-cybence-backend](https://github.com/Soozu/inventory-cybence-backend).

Local layout:

```text
Inventory-Cybence/
  invetory-cybence-new/        # React frontend (existing folder spelling)
  inventory-cybence-backend/  # Express API, Prisma, migrations and backend tests
```

See [repository separation](docs/repository-separation.md) for preserved local configuration/files and the current setup. There is no nested `backend` directory in this checkout.

## Requirements

- Node.js 22 or newer and npm
- A running TechStock API; MySQL and JWT secrets are configured in the backend repository

## Start the backend

Follow the [backend setup instructions](https://github.com/Soozu/inventory-cybence-backend/blob/main/README.md). From the sibling `inventory-cybence-backend` directory, after configuring its private `.env`:

```bash
npm ci
npm run prisma:generate
npm run dev
```

For a fresh database, review and apply the backend migrations and initialize its administrator as described there. Existing databases do not need a reset or reseed after separating repositories. The API defaults to `http://localhost:5000/api`.

## Start the frontend

From this repository root:

```bash
npm ci
npm run dev
```

The frontend uses `http://localhost:5000/api` by default. To change it, copy `.env.example` to `.env` and set `VITE_API_URL`. This is a public build setting; never put database credentials or JWT secrets in a `VITE_` variable. Set the Vite origin in the backend's `FRONTEND_URL`, open the URL printed by Vite and sign in with your configured account.

### Production domains

The frontend address is `https://inventory.cybenceitsolutions.com`. The tracked `.env.production` sets `VITE_API_URL=https://techapi.cybenceitsolutions.com/api` for `npm run build`. Local `npm run dev` retains the localhost API setting. Hosting environment variables take priority over Vite env files; remove or update any old `VITE_API_URL` override when building. Rebuild after changing an API URL. See [Vite environment modes](https://vite.dev/guide/env-and-mode).

The backend production configuration allows `https://inventory.cybenceitsolutions.com` in `FRONTEND_URL` and uses secure cookies. See the backend `.env.production.example`. Railway supplies private variables at runtime; follow the backend's [Railway backup and container setup](https://github.com/Soozu/inventory-cybence-backend/blob/main/docs/railway-backups.md). `npm run start:production` is for hosts with a private `.env.production` file, which is excluded from the deployment image.

### Vercel page refresh and direct links

The root `vercel.json` rewrites frontend routes to `/index.html`, allowing React's `BrowserRouter` to render pages such as `/system/backups` or `/assets/warranty-claims` when opened directly or refreshed. This follows [Vercel's Vite SPA configuration](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas).

Deploy a revision containing this file to the Vercel project serving `inventory.cybenceitsolutions.com`. Use the frontend repository as the project root, the Vite framework preset, build command `npm run build`, and output directory `dist`. Redeploy after adding the configuration; an older deployment keeps returning a hosting 404 on nested routes. Existing static files are served normally, and API requests continue using the separate Railway API origin.

## Common workflows

1. Add categories, brands, suppliers, warehouses, and products.
2. Record stock through adjustments or receive an approved purchase order. Serialized products require one unique serial number per unit.
3. Submit and approve a warehouse transfer, ship it, then receive it at the destination. Shipping and receiving create separate stock movements.
4. Register a company asset from available warehouse stock, assign it to a person, and record its return or maintenance.
5. Generate reports from API data and export the preview to Excel or PDF.

Every warehouse balance change is recorded through the inventory service with a stock movement and audit entry. Product stock is derived from warehouse balances. Purchase receipts, assignments, and movements retain their history.

## API and authentication

All API responses use `{ "success": true, "message": "...", "data": ... }` or `{ "success": false, "message": "...", "errors": [] }`. Large list endpoints include a `pagination` object and accept `page`, `limit`, `search`, `sortBy`, and `sortOrder` where applicable.

Sign in with `POST /api/auth/login`. Send the returned access token as `Authorization: Bearer <token>`. The refresh token is held in an HTTP-only cookie; `POST /api/auth/refresh` rotates it. Routes enforce role permissions on the server. The frontend loads its initial workspace data through the authenticated `/api/bootstrap` projection and sends writes to the dedicated REST endpoints.

The API covers authentication, catalog records, warehouse stock, serials, adjustments, transfers, purchasing and receiving, assets and maintenance, monitoring, dashboard, reports, notifications, activity logs, users, roles, and settings. There is no POS or checkout feature.

Warehouse access is enforced by the backend. Administrators can access every warehouse; other users can access only their `UserWarehouse` assignments. Administrators can manage multiple assignments and a default from **Users → Manage warehouse access**. An unassigned non-administrator has no warehouse access. Catalog metadata remains shared according to module permissions, while stock, orders, assets, reports, and warehouse history are scoped. See [advanced feature progress](docs/advanced-features.md) for migration behavior, transfer action rules, and the next phases.

## Tests and build

Run from this frontend repository:

```bash
npm test
npm run test:transport
npm run build
```

Frontend tests cover the centralized API client and empty dashboard responses. Backend unit/integration tests run independently from `inventory-cybence-backend`; see its README for commands and disposable database requirements. Neither suite was rerun during the repository split. The production frontend build was compiled after separation.

## Backups and deployment

Use MySQL backup tools for the database and include `uploads/products` from the backend repository in file backups. For example, `mysqldump -u YOUR_USER -p techstock_inventory > techstock.sql`. The Settings screen shows the same guidance. A JSON export of visible UI records is not a database backup.

Configure the backend with distinct production JWT secrets, an HTTPS frontend URL in `FRONTEND_URL`, `NODE_ENV=production`, and a secure MySQL connection. Review pending migrations before applying `npx prisma migrate deploy`; do not reset the existing database. Keep attachments, backup output and public product images on appropriate persistent storage. Change any temporary administrator credentials through the account password workflow. The product upload directory is behind an Express static URL and can later be replaced by object storage.
