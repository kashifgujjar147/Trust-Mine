# TRUST MINE — Full-Stack Project / Frontend-First Upgrade

TRUST MINE is a premium black/gold dashboard application with a React + TypeScript frontend and Node/Express + MongoDB backend architecture. This upgrade preserves the existing project and adds a backend-ready frontend service layer, mock adapter, complete user workspace, package/deposit/withdrawal flows, referral/rewards/promo UI and an admin control center.

> **Financial safety:** demo figures are illustrative configuration. The browser never authoritatively credits income, confirms payments, changes balances or approves withdrawals. Real payment verification, ledger writes and financial calculations must happen on the backend/provider side and require applicable legal/compliance review.

## Audit summary

### Already present and preserved
- React/Vite/TypeScript frontend
- Node/Express/TypeScript backend
- MongoDB/Mongoose models
- JWT/bcrypt authentication foundation
- Dynamic package model and seed values
- Deposit → verification → automatic package activation architecture
- configurable cycle-interval scheduler architecture
- Payment-method abstractions
- Referral, reward, promo and ledger services
- Protected user/admin routes
- Black/gold visual foundation

### Improved in this phase
- Expanded service layer with mock/API adapter boundary
- Typed domain interfaces
- Complete user navigation and data-driven pages
- Package search and details
- Deposit flow with selected-package preservation and proof UI
- Deposit and withdrawal history
- Backend-ready withdrawal preview using centralized settings
- Full transaction ledger UI with filters/search structure
- Referral/team dashboard and configurable commission display
- Reward tier/progress UI
- Promo validation UI
- Profile, settings, notifications, activity and support
- Admin control center with dashboard, users, packages, deposits, withdrawals, transactions, payment methods, promos, rewards and platform settings tabs
- Loading, error and empty states
- Responsive mobile drawer, tables and cards
- API contract documentation

## Project structure

```text
trust-mine/
  client/
    src/
      components/      reusable UI
      context/         auth/session state
      layouts/         application shell
      pages/           user/admin screens
      routes/          protected routing
      services/        API + mock adapters
      types/           domain contracts
      styles.css
  server/
    src/
      config/
      controllers/
      jobs/
      middleware/
      models/
      routes/
      services/
      validators/
  API_CONTRACT.md
  .env.example
  README.md
```

## Frontend setup

Requirements: Node.js 20+.

```bash
npm install
cp client/.env.example client/.env
npm run dev -w client
```

On Windows PowerShell, copy the file manually if `cp` is unavailable.

### Mock mode

`VITE_MOCK_MODE=true` uses `client/src/services/mock.ts`. Pages still call service functions such as `packageService.getPackages()` and `depositService.createDeposit()`; mock records are never embedded directly in components.

Demo credentials:
- Admin: `admin@trustmine.demo` / `Admin@12345`
- User: `user@trustmine.demo` / `User@12345`

### Real backend mode

Set:

```env
VITE_MOCK_MODE=false
VITE_API_URL=http://localhost:5000/api
```

Then the same service functions route to the REST API. The backend must remain the source of truth for financial state.

## Backend setup

```bash
npm install
npm run seed
npm run dev -w server
```

Configure MongoDB and JWT in `.env`. See `.env.example`.

## Build / QA

```bash
npm test
npm run build
```

The source is intended to be verified with the exact package scripts after dependencies are installed. The packaging environment may not have registry access, so a local package-install failure must not be interpreted as a passing build.

## Package flow

1. User selects a dynamic package.
2. `Deposit & Activate` carries the package ID into the deposit page.
3. User selects a dynamic payment method and submits details.
4. Deposit remains pending until server/provider verification.
5. Backend creates the package purchase and activates it after verification.
6. Backend owns cycle processing; frontend timers are presentation only.

## Payment configuration

The UI supports Easypaisa, BEP20, Bank and an admin-configurable custom method. Manual mode is intentionally conservative. Never mark a payment complete merely because a user clicked a button or supplied a transaction hash. Production integrations must verify provider/webhook/blockchain evidence server-side.

## API contract

See `API_CONTRACT.md` for expected endpoints and payload boundaries. The service layer is the integration seam; page components should not need redesign when the REST backend is connected.

## Production checklist

Before real-money deployment: configure legitimate payment providers, webhook signature verification, BEP20/token verification, proof storage, password-reset delivery, secure token/cookie strategy, authorization tests, audit logging, monitoring, backups, rate limits, financial reconciliation and legal/compliance controls.
