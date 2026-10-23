# Storefront Bilingual Integration Design

## Context

The local `development` branch contains uncommitted S2 work that adds an
English/Simplified Chinese switcher and bilingual copy for Artisan Profile and
Custom Order pages. Remote commit `a16a887` adds S3's full-storefront Chinese
copy and WeChat Pay implementation, but its storefront translations are
hard-coded directly in components.

The two changes overlap in 11 tracked files. A direct pull or push would either
fail or produce an inconsistent storefront where the language switch affects
only S2 pages. This integration must preserve both teams' features and establish
one localization architecture for the entire storefront.

## Goals

- Preserve all S3 functionality from `a16a887`, including WeChat Pay, Chinese
  transactional email support, China-region behavior, and storefront copy.
- Preserve the S2 Artisan Profile and Custom Order functionality and tests.
- Make all user-facing storefront UI covered by the S3 localization commit
  switch consistently between English and Simplified Chinese.
- Persist the selected language across refreshes and navigation.
- Keep market/region selection independent from language selection.
- Deliver the integration through independently usable, tested checkpoints so
  the shared `development` branch never contains a half-migrated visible
  language experience.

## Non-goals

- Automatically translating merchant-entered or customer-entered database
  content such as product names, artisan biographies, specialties, order
  descriptions, or chat messages.
- Localizing the Medusa admin dashboard.
- Adding languages other than `en` and `zh-CN`.
- Changing WeChat Pay business rules, credentials, API calls, or webhook logic.
- Replacing the existing `[countryCode]` region routing system.

## Integration Strategy

The integration will not commit the current local work before synchronization.
Instead, it will:

1. Create a named, path-scoped Git stash containing only S2 source and test
   changes plus these design/plan documents.
2. Fast-forward local `development` to `origin/development`.
3. Restore the scoped stash and resolve overlapping files against S3's latest
   business logic.
4. Keep S3's implementation as the baseline in every conflict, then layer the
   shared localization API and S2 UI behavior on top.
5. Leave personal files, `.env` files, `.tmp-config`, installers, and launch
   scripts outside the stash and outside every integration commit.

The stash is temporary recovery state, not the final delivery mechanism. It is
dropped only after its contents have been restored successfully.

## Phased Delivery

The integration is delivered to `development` in four stable phases. Every
phase is formatted, tested, reviewed for secrets, synchronized with the latest
remote branch, committed, and pushed independently. Pushes are ordinary
fast-forward pushes; force push is never used.

### Phase 1: Synchronization and S2 localization foundation

- Fast-forward to S3's latest `development` state and restore S2 work.
- Resolve the 11 known overlapping files with S3 behavior as the baseline.
- Add the typed dictionary/runtime and integrate Artisan Profile and Custom
  Order copy.
- Keep the public switch disabled and force the effective locale to `zh-CN`,
  preserving S3's current Chinese storefront while migration is incomplete.

### Phase 2: Browsing and account surfaces

- Migrate navigation, home, footer, not-found, authentication, account, store,
  product, and remaining Artisan Profile surfaces.
- Keep the switch disabled and continue rendering `zh-CN` globally.

### Phase 3: Transaction surfaces

- Migrate cart, checkout, WeChat presentation, standard orders, and all
  remaining Custom Order surfaces.
- Keep the switch disabled until the untranslated-copy scan is empty.

### Phase 4: Enable bilingual switching

- Enable the `中文 / EN` control and validated cookie behavior.
- Run complete English and Chinese browser verification at desktop and narrow
  widths.
- Push only after all automated tests, security checks, and manual checks pass.

Before each phase commit, fetch `origin/development`. If the remote branch has
advanced, integrate the new commits and rerun that phase's tests. If a push is
rejected because another member pushed first, synchronize and retest; never
force push.

## Localization Architecture

### Locale model

The supported locale type is:

```ts
type StorefrontLocale = "en" | "zh-CN"
```

The selected value is stored in the `storefront_locale` cookie. During Phases
1-3, a checked-in rollout constant keeps the public switch disabled and forces
the effective locale to `zh-CN`, preserving the already-shipped S3 experience.
In Phase 4, the constant is enabled; missing, unsupported, or malformed cookie
values then fall back to `en`. The country code in paths such as `/cn`, `/sg`,
or `/dk` continues to select a Medusa region and never implicitly changes the
language.

### Dictionary

`fyp-storefront/src/lib/i18n/storefront.ts` is the only source of translatable
storefront copy. It contains structurally identical `en` and `zh-CN`
dictionaries grouped by feature:

- common and navigation
- home and footer
- authentication and account
- store, product, and artisan
- cart and checkout
- standard orders
- custom orders and status labels
- payment, including WeChat-specific display copy

Stable API values remain untranslated. Examples include custom-order status
values, payment-provider IDs, product-category values submitted to the backend,
and country codes. Components translate those values only when rendering them.

### Server access

`fyp-storefront/src/lib/i18n/storefront-server.ts` reads and validates the
cookie using `next/headers`. Server pages and templates use this helper to
select a dictionary. The root layout sets `<html lang>` to the selected locale.

Server components may pass a locale to a feature template when the template
already has a clear locale boundary. They should not read browser globals or
duplicate cookie parsing.

### Client access

A client-side locale provider is mounted by the root layout with the locale
resolved on the server. Client components use a small hook to access the
current locale and dictionary without threading a locale prop through every
form and checkout component.

The language switcher is a two-option segmented control labeled `中文` and
`EN`. It is not mounted while the rollout constant is disabled. Once enabled,
selecting a language updates the cookie and calls `router.refresh()` so server
and client components rerender from the same source of truth. No URL rewrite
or market change occurs.

### Copy migration

The English strings in the pre-S3 code and the Chinese strings introduced by
S3 form the initial dictionary pair. Hard-coded Chinese introduced by
`a16a887` is removed from storefront components as each feature is migrated.
Dynamic content is rendered exactly as stored.

## Feature Boundaries

### S3 features to preserve unchanged

- WeChat Pay provider registration and backend module
- WeChat Pay QR generation and checkout control flow
- CNY and China-region setup script
- Chinese Resend order email selection
- S3 package and lockfile dependency changes
- Region and payment-provider data handling

Only the display strings around these flows are moved into the storefront
dictionary.

### Local WeChat Pay environment

Local end-to-end testing uses S3's mock provider mode. The following values
must be added to the local backend `fyp-backend/.env` after synchronization:

```env
WECHAT_PAY_ENABLED=true
WECHAT_PAY_MODE=mock
WECHAT_PAY_SANDBOX=true
```

These settings enable deterministic local QR checkout without charging real
money. They do not authorize live WeChat transactions and do not require
merchant credentials. `fyp-backend/.env.template` may document the variable
names and safe mock defaults, but the local `.env` remains ignored by Git.

Live mode is outside this integration's acceptance test. It must not be
enabled unless the team separately supplies and validates the required app ID,
merchant ID, API v3 key, certificate serial number, private key, notification
URL, and platform public key configuration.

### S2 features to preserve

- Artisan Profile hero, story, media, and linked-product sections
- Custom Order request, success state, list, detail, timeline, and TalkJS
  degraded state
- Localized dates, money labels, categories, and custom-order statuses
- Existing Artisan Profile and Custom Order regression scripts
- The language switcher and persistent locale cookie

## Conflict Resolution Rules

For the 11 known overlapping files:

1. Preserve S3 imports, dependencies, WeChat behavior, and any updated API
   contract.
2. Preserve S2's component behavior and accessibility attributes where S3 only
   changed text.
3. Replace both hard-coded language variants with dictionary lookups.
4. Keep backend payload values unchanged even when option labels are localized.
5. Resolve `package.json` by retaining S3's QR-code dependencies and adding the
   localization test command.
6. Regenerate or accept S3's `pnpm-lock.yaml`; never hand-edit lockfile entries.

## Error Handling

- Invalid locale cookies fall back to English without throwing.
- Locale switching remains usable when backend data is unavailable because it
  does not call the backend.
- Missing dynamic content continues to use localized fallback text.
- TalkJS failure continues to degrade to localized status text without hiding
  the Custom Order detail page.
- WeChat Pay errors retain S3's control flow and use localized user-facing
  messages only where the frontend already presents an error.

## Security and Data Handling

- No `.env` file is staged or committed.
- WeChat merchant credentials, private keys, TalkJS secrets, database URLs, and
  Resend keys remain backend environment variables.
- The storefront receives no new secrets.
- The integration does not run seed scripts against the shared Railway
  database.
- Manual tests avoid creating orders or payments unless explicitly required.

## Testing Strategy

### Automated storefront checks

- Extend the localization regression script to verify:
  - both locale dictionaries expose the same keys;
  - the cookie and switcher are wired correctly;
  - each S3-localized storefront area uses the localization API;
  - hard-coded Chinese UI copy does not remain outside the dictionary, except
    explicitly allow-listed data fixtures or comments.
- Run `pnpm test:s2-localization`.
- Run `pnpm test:artisan-profile`.
- Run `pnpm test:custom-order` and require all contract tests to pass.
- Run storefront TypeScript/build checks and distinguish new failures from the
  repository's recorded baseline failures.

### Automated backend checks

- Install the remote dependency set without changing environment files.
- Run `pnpm test:unit`, including S3's WeChat Pay unit tests.
- Confirm the local backend environment contains
  `WECHAT_PAY_ENABLED=true`, `WECHAT_PAY_MODE=mock`, and
  `WECHAT_PAY_SANDBOX=true` before browser checkout verification.
- Do not run database-destructive seed/setup commands as part of verification.

### Manual browser checks

Verify both `en` and `zh-CN` on desktop and narrow viewports for:

- home/navigation/footer
- store and product detail
- login/register/account
- cart
- checkout and WeChat Pay presentation
- order confirmation/detail
- Artisan Profile
- Custom Order request/list/detail

The language selection must survive refresh and navigation, and switching
language must not change the country code or selected region.

## Acceptance Criteria

- Local `development` contains remote commit `a16a887` or its latest successor,
  plus the phased integration commits.
- Every pushed phase is independently runnable and retains a complete Chinese
  storefront; no pushed phase exposes a partial language switch.
- Every storefront area localized by S3 displays English under `en` and
  Simplified Chinese under `zh-CN`.
- Artisan Profile and Custom Order pages retain their S2 behavior in both
  languages.
- WeChat Pay and Chinese email backend logic are unchanged and their tests pass.
- Local browser verification uses WeChat Pay mock mode with no real charge or
  live merchant credential.
- No secret or personal file appears in the staged diff.
- Automated checks are documented before every phase commit; full manual
  bilingual checks are documented before Phase 4 is pushed.
