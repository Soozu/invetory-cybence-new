# TechStock Inventory

Current expansion status and verification: [Phase 16 release checks](docs/release-verification.md), [unfinished work handoff](docs/unfinished-work-context.md). Deployment is deferred at the user's request; Phase 13–15 browser acceptance and dependency maintenance remain pending.

TechStock is an IT inventory, procurement, and asset management system. The existing responsive React interface now uses an Express API, Prisma, and MySQL. Product, stock, order, asset, user, and audit records are stored in MySQL. Browser storage is used only for the visual theme.

## Requirements

- Node.js 22 or newer and npm
- MySQL 8.0 or newer
- A MySQL user with permission to create tables and indexes in the TechStock database

## 1. Create the database

Create a database in MySQL:

```sql
CREATE DATABASE techstock_inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Set up a dedicated MySQL user for local development if you prefer. Give it schema migration and data access permissions for this database. `prisma migrate dev` may also need permission to create a shadow database. A restricted user can run the checked in migration with `npx prisma migrate deploy` instead.

## 2. Configure the backend

From the `backend` directory:

```bash
npm install
```

Copy `backend/.env.example` to `backend/.env` and set these values:

```env
DATABASE_URL="mysql://YOUR_USER:YOUR_PASSWORD@localhost:3306/techstock_inventory"
JWT_ACCESS_SECRET=YOUR_OWN_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JWT_REFRESH_SECRET=A_DIFFERENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
FRONTEND_URL=http://localhost:5173,http://localhost:5174
```

Generate each secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. URL encode special characters in the database password. Keep `.env` private; it is ignored by Git.

Run the schema migration and administrator-only seed:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

The migration is also checked in at `backend/prisma/migrations/20260929_initial/migration.sql`. If using a database account without shadow database privileges, run `npx prisma migrate deploy` instead of `npm run prisma:migrate`.

The seed creates only one administrator account plus the system role/permission definitions. It does not create other users, products, categories, brands, warehouses, suppliers, stock, serials, orders, assets, history, notifications or demo settings. The default account is `admin@techstock.local` with password `Admin123!` unless `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set **before the first seed**. Set your own credentials when creating a real database. Running the seed again preserves the existing administrator password and all existing business data; it does not remove previously seeded demo records.

The API runs at `http://localhost:5000`. Check `http://localhost:5000/api/health` for database connectivity.

## 3. Start the frontend

In another terminal, from the project root:

```bash
npm install
npm run dev
```

The frontend uses `http://localhost:5000/api` by default. To change it, copy the root `.env.example` to `.env` and set `VITE_API_URL`. Open the Vite URL shown in the terminal and sign in with the seeded account.

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

From `backend`:

```bash
npm test
```

For live warehouse authorization and legacy assignment migration checks, run `npm run test:warehouse-access` from `backend`. It creates and removes a disposable MySQL schema and never resets the configured development database. The local database account needs permission to create and drop those test schemas.

The Vitest suite covers authentication, permissions, stock rules, serialized inventory, purchase receiving, transfers, and asset assignment/return with isolated service fixtures. From the project root, run `npm run build` to verify the frontend bundle. These tests do not replace a live MySQL workflow check after configuring the database.

## Backups and deployment

Use MySQL backup tools for the database and include `backend/uploads/products` in file backups. For example, `mysqldump -u YOUR_USER -p techstock_inventory > techstock.sql`. The Settings screen shows the same guidance. A JSON export of visible UI records is not a database backup.

For deployment, set distinct production JWT secrets, an HTTPS frontend URL in `FRONTEND_URL`, `NODE_ENV=production`, and a secure MySQL connection. Run `npx prisma migrate deploy`, keep uploads on persistent storage, and change the development admin credentials. The product upload directory is behind an Express static URL and can later be replaced by object storage.
