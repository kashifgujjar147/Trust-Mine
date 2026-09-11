# Trust Mine API Contract

Base URL: `/api` (client default `http://localhost:5000/api`). JSON responses unless noted. JWT is sent as `Authorization: Bearer <token>`.

## Auth
- POST `/auth/register` — public. Body: `{fullName,username,email,phone?,password,referralCode?}`. Returns `{token,user}`. 400 validation, 409 duplicate.
- POST `/auth/login` — public. Body `{email,password}`. Returns `{token,user}`. 401/403 errors.
- GET `/auth/me` — JWT. Returns `{user}`.
- PATCH `/users/me` — JWT. Body `{fullName?,phone?}`. Returns `{user}`.

## User data
- GET `/users/dashboard` — JWT. Returns `balance`/`totalBalance`, `availableBalance`, `lockedWithdrawalAmount`, totals, active package purchases, recent transactions and settings. Available balance is computed server-side as total balance minus locked PENDING/APPROVED/PROCESSING withdrawals.
- GET `/packages` — JWT. Returns `{packages}` active packages.
- GET `/packages/:id` — JWT. Returns `{package}`.
- GET `/package-purchases` — JWT. Returns `{purchases}`.
- GET `/payment-methods` — JWT. Returns `{methods}` enabled methods.
- GET `/settings` — JWT. Returns centralized platform settings.

## Deposits
- POST `/deposits` — JWT. Body `{packageId,method,amount,reference,proofUrl?}`. Creates `PENDING` deposit and pending ledger record. Backend validates package/payment method/minimum.
- GET `/deposits` — JWT. Returns `{deposits}`.
- GET `/deposits/:id` — JWT. Returns `{deposit}`.

## Withdrawals
- POST `/withdrawals` — JWT. Body `{amount,method,account,accountHolderName}`. Optional `Idempotency-Key` header. Backend validates minimum/payment method and atomically reserves the requested amount against the user's wallet; fee/net are calculated server-side. Pending/processing requests reduce available balance.
- GET `/withdrawals` — JWT. Returns `{withdrawals}`.
- GET `/withdrawals/:id` — JWT. Returns `{withdrawal}`.

## Ledger
- GET `/transactions?type=&status=&q=&from=&to=&page=&limit=` — JWT. Returns `{transactions,pagination}`. Financial state is backend authoritative.

## Referral / rewards / promos
- GET `/team` — JWT. Returns `{members,referral}` with configured commission rates.
- GET `/rewards` — JWT. Returns `{rewards,tiers,eligible,qualifyingVolume,claimedRewardIds}`.
- POST `/rewards/:id/claim` — JWT. Backend checks eligibility/idempotency.
- GET `/promo` — JWT. Returns active promos.
- POST `/promo/validate` — JWT. Body `{code}`. Backend checks status, expiry and usage limits.
- POST `/promo/apply` — JWT. Body `{code}`. Optional `Idempotency-Key` header. Creates a promo ledger credit after backend validation and usage-limit enforcement. Only fixed-value promos are currently supported because no real percentage provider rule is configured.
- GET `/notifications` — JWT. Returns `{notifications}`.
- PATCH `/notifications/:id/read` — JWT.
- GET `/support` — JWT. Returns `{tickets}`.
- POST `/support` — JWT. Body `{subject,message}`.

## Admin
All admin routes require JWT + `role=ADMIN`.
- GET `/admin/dashboard`
- GET `/admin/users`
- GET `/admin/packages`
- POST `/admin/packages` — create package.
- PATCH `/admin/packages/:id` — update package.
- DELETE `/admin/packages/:id` — archive package.
- GET `/admin/deposits`
- POST `/admin/deposits/:id/verify` — verifies deposit and automatically activates its package purchase; idempotent.
- POST `/admin/deposits/:id/reject`
- GET `/admin/withdrawals`
- POST `/admin/withdrawals/:id/processing`
- POST `/admin/withdrawals/:id/approve` — PENDING → APPROVED; reservation remains locked and related withdrawal transactions become APPROVED.
- POST `/admin/withdrawals/:id/reject` — PENDING → REJECTED and releases reservation.
- POST `/admin/withdrawals/:id/processing` — APPROVED → PROCESSING; related withdrawal transactions become PROCESSING.
- POST `/admin/withdrawals/:id/complete` — PROCESSING → COMPLETED and finalizes the reserved deduction; related withdrawal transactions become COMPLETED.
- GET `/admin/transactions`
- GET `/admin/payment-methods`
- POST `/admin/payment-methods`
- PATCH `/admin/payment-methods/:id`
- GET `/admin/promo`
- POST `/admin/promo`
- PATCH `/admin/promo/:id`
- GET `/admin/rewards`
- POST `/admin/rewards`
- PATCH `/admin/rewards/:id`
- GET `/admin/settings`
- PATCH `/admin/settings`
- GET `/admin/audit-logs`
- GET `/admin/notifications`
- GET `/admin/support`

### Financial rules
Default settings: minimum deposit `$2`, minimum withdrawal `$1`, withdrawal fee `8%`, commission rates `[10,2,1,1]`, reward tiers `[50→2,100→5,200→10,500→25]`, cycle interval `24h`, package duration `365 days`. Package `cycleDays` represents the number of income cycles in the package lifetime; the recurring business cycle uses the centralized `cycleIntervalHours` setting. `PackagePurchase.cycleEnd` represents the full package lifetime, while `nextProcessAt` represents the next individual cycle. Settings are stored in MongoDB and can be changed through admin settings. Frontend values are display-only; the server validates and calculates all financial effects.

### Idempotency / safety
Package cycle processing uses the centralized `cycleIntervalHours` setting plus a unique idempotency key per purchase/cycle. Deposit verification and package activation are protected by a unique payment reference. Commission creation is protected by a unique source event/level constraint. Reward claims use a unique user/reward claim. Withdrawals use an atomic wallet reservation and idempotency key. Promo usage uses atomic global/per-user counters. Production payment providers should add provider-side webhook verification before marking deposits completed.
