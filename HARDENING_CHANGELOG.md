# TRUST MINE — Hardening Changelog

## Applied in this build

- Fixed completed-deposit recovery so a reconstructed DEPOSIT ledger entry is the single wallet-crediting operation; removed the extra direct wallet credit that could double-credit a recovered deposit.
- Added an idempotency-key consistency guard so an existing key cannot be reused for a different user/type/status/amount transaction.
- Restored/fixed the Admin Promo create/edit payload to match the actual PromoCode backend schema.
- Added promo expiry editing to the Admin UI.
- Added environment-driven CORS origins using `CLIENT_URL` + `ALLOWED_ORIGINS`.
- Added production startup enforcement requiring MongoDB transaction-capable deployment when `MONGODB_TRANSACTIONS_REQUIRED=true`.
- Made `withMongoTransaction` use its existing fallback only when transactions are unsupported and transaction requirement is disabled.
- Added safer production API error responses and reduced sensitive registration/login logging.
- Added graceful MongoDB shutdown handling for SIGINT/SIGTERM.
- Added secure password-reset token storage, expiration, one-time atomic token consumption, reset endpoints, and client reset screens. Delivery is supported through an optional server-side reset webhook; no fake email delivery is claimed.
- Added stricter authentication/password-reset rate limiting.
- Added a regression test for recovery of a completed deposit with a missing ledger entry.
- Added PasswordResetToken collection/index setup to the financial test harness.

## Verification

- TypeScript source parsing across `server/src`, `server/tests`, and `client/src`: PASS (zero parser diagnostics).
- Full dependency installation was attempted twice but timed out in the execution environment.
- Because dependencies could not be fully installed, full Vitest, client typecheck, and production build could not be truthfully marked PASS in this environment.


## Zero-regression fix pass — 2026-09-10

### FIXED

- FIN-001: Wallet rebuild now keeps `PENDING`, `APPROVED`, and `PROCESSING` withdrawals reserved.
- FIN-002: Completed-deposit recovery no longer performs a second direct wallet credit.
- FIN-003: Destructive seed execution is refused in production before database connection/deletion.
- FIN-004: Financial transaction helpers no longer silently downgrade unsupported MongoDB transactions to non-atomic fallback paths.
- SEC-001: Protected requests now validate current user status, current role, and `tokenVersion`; password reset increments `tokenVersion`.
- FIN-005: New package activations snapshot daily income and cycle duration; cycle processing uses snapshots when present.
- UI-001: Package retry clears stale error state and package pages use configured cycle/currency values.
- OPS-001: Maintenance mode is centrally enforced for protected user/admin API routes while health/auth remain available and admins retain access.
- UI-002: Dashboard, deposit, withdrawal, admin and module money displays use backend-configured currency.
- UI-003: Transaction search now ignores stale out-of-order responses.
- DOC-001: Withdrawal API documentation explicitly includes `accountHolderName`.

### NOT CHANGED

React Router, existing UI layout/styles, AuthContext, ledger/wallet architecture, referral/reward/promo/Telegram/manual-payment systems, existing financial state machine, and existing API route names were preserved.
