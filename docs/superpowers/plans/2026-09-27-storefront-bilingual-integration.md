# Storefront Bilingual Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate S2's bilingual Artisan Profile and Custom Order work with S3's full Chinese storefront and WeChat Pay commit so every localized storefront surface switches consistently between English and Simplified Chinese.

**Architecture:** Fast-forward to S3's `a16a887` using a path-scoped stash,
then restore S2 work and resolve conflicts with S3 business logic as the
baseline. A typed central dictionary serves server components through a
cookie-aware server helper and client components through a root locale
provider. The work ships in four tested fast-forward pushes; a rollout
constant keeps the storefront fully Chinese until the final phase enables the
language switcher.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Medusa v2, pnpm 11, Node.js 22, Jest, static Node regression scripts, WeChat Pay API v3 module.

**Spec:** `docs/superpowers/specs/2026-09-27-storefront-bilingual-integration-design.md`

## Global Constraints

- Supported locales are exactly `en` and `zh-CN`.
- Locale cookie name is exactly `storefront_locale`; after Phase 4 activation,
  missing or invalid values fall back to `en`.
- `[countryCode]` remains a Medusa market/region selector and must never select the UI language.
- Dynamic merchant/customer content is displayed as stored and is not machine-translated.
- S3 WeChat Pay, Resend, region, dependency, and backend behavior from `a16a887` must be preserved.
- Backend local mock settings are `WECHAT_PAY_ENABLED=true`, `WECHAT_PAY_MODE=mock`, and `WECHAT_PAY_SANDBOX=true`.
- `.env`, `.env.local`, merchant credentials, database URLs, personal documents, installers, launch scripts, and `.tmp-config` must never be staged.
- Do not run seed or WeChat setup scripts against the shared Railway database.
- Deliver exactly four stable integration checkpoints; each checkpoint must
  pass its specified tests and remote-synchronization gate before commit/push.
- During Phases 1-3 the rollout constant keeps switching disabled and the
  effective locale fixed to `zh-CN`.
- Never force push shared `development`.

## Review Focus

1. **Invalid locale cookie:** an unsupported value must render English and must not crash server or client components; covered in Task 2 localization regression tests.
2. **Region/language independence:** switching language on `/cn`, `/sg`, or `/dk` must retain the full URL and region-backed currency; covered in Task 3 switcher tests and Task 9 browser checks.
3. **Stable backend values:** localized category/status/payment labels must submit original API values; covered in Tasks 6 and 8 contract tests.
4. **WeChat unavailable or disabled:** ordinary checkout methods must still render and work without leaking configuration details; covered in Task 7 unit/build checks and Task 9 browser checks.
5. **Mixed server/client render:** first render and post-switch refresh must use the same locale without hydration warnings; covered in Task 2 provider tests and Task 9 console inspection.

## Delivery Checkpoints

| Phase | Tasks | Commit message | Public behavior |
| --- | --- | --- | --- |
| 1 | Tasks 1-2 plus restored S2 Artisan/Custom Order localization | `feat(storefront): integrate s2 localization foundation` | Complete Chinese storefront; switch hidden |
| 2 | Tasks 3-5 | `feat(storefront): localize browsing and account surfaces` | Complete Chinese storefront; switch hidden |
| 3 | Tasks 6-8 | `feat(storefront): localize checkout and order flows` | Complete Chinese storefront; switch hidden |
| 4 | Task 9 | `feat(storefront): enable bilingual language switching` | Full English/Chinese switch enabled |

At every checkpoint: run the phase test gate, fetch remote, integrate and retest
if remote advanced, show the user the test results and exact proposed paths,
and wait for approval. Then stage only reviewed paths, scan for secrets,
commit, fetch again, and push normally. A rejected push stops the checkpoint;
synchronize, retest, and retry without `--force`.

---

### Task 1: Protect Local Work and Synchronize `development`

**Files:**
- Preserve: `fyp-storefront/**` current tracked/untracked S2 changes
- Preserve: `docs/superpowers/specs/2026-09-27-storefront-bilingual-integration-design.md`
- Preserve: `docs/superpowers/plans/2026-09-27-storefront-bilingual-integration.md`
- Update from remote: all files changed by `a16a887`
- Local-only: `fyp-backend/.env`

**Interfaces:**
- Consumes: local `development` at `72e3ad0`, remote `origin/development` at or after `a16a887`
- Produces: dirty local `development` based on current `origin/development`, with S2 changes restored and no personal/secret files included

- [ ] **Step 1: Record the pre-integration state**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
git rev-parse origin/development
git stash list
```

Expected: local branch is `development`; local S2 changes are visible; personal files remain untracked.

- [ ] **Step 2: Create a named, path-scoped stash**

Run a stash limited to `fyp-storefront` and `docs/superpowers`, including untracked files under only those paths. Do not use an unscoped `git stash -u`.

Expected: S2 code and the two planning documents appear in one named stash; root personal files and backend ignored environment files remain untouched.

- [ ] **Step 3: Verify the stash boundary before synchronization**

Run:

```powershell
git status --short
git stash show --stat stash@{0}
```

Expected: no storefront/design work remains in the working tree; personal root files may remain untracked; stash contains no `.env`, document, installer, launch script, or `.tmp-config` path.

- [ ] **Step 4: Fast-forward local development**

Run:

```powershell
git merge --ff-only origin/development
```

Expected: `HEAD` advances to the fetched remote commit without a merge commit.

- [ ] **Step 5: Install the synchronized dependency sets**

Run `pnpm install --frozen-lockfile` separately in `fyp-backend` and `fyp-storefront`.

Expected: S3's QR-code and backend dependency graph installs without rewriting either lockfile.

- [ ] **Step 6: Configure local WeChat mock mode**

Ensure local `fyp-backend/.env` contains exactly these non-secret test settings:

```env
WECHAT_PAY_ENABLED=true
WECHAT_PAY_MODE=mock
WECHAT_PAY_SANDBOX=true
```

Expected: `git status --short --ignored` confirms the environment file remains ignored.

- [ ] **Step 7: Restore the scoped stash without dropping it**

Apply the named stash first rather than popping it. Keep the stash until all restored paths and conflicts have been verified.

Expected: overlapping files enter conflict state or merge cleanly; new dictionary, switcher, tests, spec, and plan are restored.

- [ ] **Step 8: Resolve mechanical conflicts only**

For each conflict, retain S3's dependencies and behavior, then restore S2's locale wiring. Do not refactor untranslated S3 components yet.

Expected: `git diff --name-only --diff-filter=U` returns no files; no file contains conflict markers.

- [ ] **Step 9: Verify restoration and remove the temporary stash**

Compare the applied files with `git stash show -p`; drop the stash only after the restored work is present and readable.

Expected: working tree contains remote S3 code plus uncommitted S2 code; stash
is removed; no integration commit has been created yet.

---

### Task 2: Establish the Typed Localization Runtime

**Files:**
- Modify: `fyp-storefront/src/lib/i18n/storefront.ts`
- Modify: `fyp-storefront/src/lib/i18n/storefront-server.ts`
- Create: `fyp-storefront/src/lib/i18n/storefront-context.tsx`
- Modify: `fyp-storefront/src/lib/constants.tsx`
- Modify: `fyp-storefront/src/app/layout.tsx`
- Modify: `fyp-storefront/src/modules/layout/components/language-switcher/index.tsx`
- Modify: `fyp-storefront/scripts/test-s2-localization.js`
- Modify: `fyp-storefront/package.json`

**Interfaces:**
- Produces: `StorefrontLocale = "en" | "zh-CN"`
- Produces: `StorefrontDictionary`, `getStorefrontDictionary(locale)`, `isStorefrontLocale(value)`
- Produces: `getStorefrontLocale(): Promise<StorefrontLocale>` for server components
- Produces: `StorefrontLocaleProvider` and `useStorefrontI18n(): { locale, t }` for client components
- Produces: `LanguageSwitcher` that writes `storefront_locale` and calls `router.refresh()`
- Produces: `STOREFRONT_LANGUAGE_SWITCH_ENABLED` rollout constant, initially `false`

- [ ] **Step 1: Expand the localization regression test first**

Add assertions that require the typed locale context, root provider,
rollout constant, disabled-state `zh-CN` behavior, future invalid-cookie
fallback, language switcher refresh, and dictionary feature groups from the
spec. Add an explicit temporary file allowlist for the S3 UI files scheduled in
Tasks 3-8; the scan must fail for any non-allowlisted Chinese UI literal outside
the dictionary. Each later task removes its migrated files from this allowlist.

- [ ] **Step 2: Run the localization test and verify it fails**

Run:

```powershell
pnpm test:s2-localization
```

Expected: FAIL because the locale provider and full dictionary groups do not yet exist.

- [ ] **Step 3: Implement the typed dictionary contract**

Define the English dictionary as the structural source type and require the `zh-CN` dictionary to satisfy the same keys and value shapes. Keep API values out of translated labels.

- [ ] **Step 4: Implement server and client locale access**

Keep cookie parsing in the server-only helper. Add the provider/hook for client
components and mount it in the root layout. While the rollout constant is
`false`, force the effective locale and `<html lang>` to `zh-CN`; retain the
validated cookie fallback path for Phase 4.

- [ ] **Step 5: Finalize the switcher behavior**

Use a segmented `中文 / EN` control with `aria-pressed`, write a one-year
path-wide cookie, and refresh without navigating or changing query parameters.
Do not mount the control while the rollout constant is `false`.

- [ ] **Step 6: Run the focused test**

Run `pnpm test:s2-localization`.

Expected: PASS with only the explicit Tasks 3-8 migration allowlist remaining.

- [ ] **Step 7: Verify the Phase 1 feature gate and S2 flows**

Run `pnpm test:s2-localization`, `pnpm test:artisan-profile`, and
`pnpm test:custom-order`. Inspect the rendered navigation source to confirm the
switcher is not mounted while the constant is `false`.

Expected: all focused tests pass; the effective UI locale remains `zh-CN`.

- [ ] **Step 8: Deliver Phase 1**

Fetch `origin/development`. If it advanced, use the same path-scoped stash,
fast-forward, restore, resolve, and rerun Step 7. Review the staging boundary,
show the proposed Phase 1 diff, and wait for user approval. Then commit as
`feat(storefront): integrate s2 localization foundation` and push normally to
`development`.

Expected: push succeeds as a fast-forward; no secret/personal file is present.

---

### Task 3: Localize Navigation, Home, Footer, and Shared Shell

**Files:**
- Modify: `fyp-storefront/src/modules/layout/templates/nav/index.tsx`
- Modify: `fyp-storefront/src/modules/layout/templates/footer/index.tsx`
- Modify: `fyp-storefront/src/modules/layout/components/side-menu/index.tsx`
- Modify: `fyp-storefront/src/modules/home/components/hero/index.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/not-found.tsx`
- Modify: `fyp-storefront/src/lib/i18n/storefront.ts`
- Test: `fyp-storefront/scripts/test-s2-localization.js`

**Interfaces:**
- Consumes: `useStorefrontI18n()` in client shell components and server dictionary access where required
- Produces: bilingual site identity, navigation, home actions, footer, and not-found copy

- [ ] **Step 1: Add failing shell coverage**

Require English and Chinese keys for menu, account, cart fallback, seller
action, footer links, and not-found actions. Require the switcher component to
remain absent from the rendered navigation while the rollout constant is
disabled.

- [ ] **Step 2: Run the localization test and verify shell failures**

Run `pnpm test:s2-localization`.

Expected: FAIL listing shell files or missing keys.

- [ ] **Step 3: Replace S3 hard-coded Chinese shell copy**

Migrate shell strings to the dictionary while preserving S3 link destinations and responsive behavior.

- [ ] **Step 4: Run the localization test**

Expected: shell coverage passes and switching language does not alter the route.

---

### Task 4: Localize Authentication and Account Surfaces

**Files:**
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/account/@dashboard/addresses/page.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/account/@dashboard/page.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/account/@login/page.tsx`
- Modify: `fyp-storefront/src/modules/account/components/account-nav/index.tsx`
- Modify: `fyp-storefront/src/modules/account/components/login/index.tsx`
- Modify: `fyp-storefront/src/modules/account/components/overview/index.tsx`
- Modify: `fyp-storefront/src/modules/account/components/register/index.tsx`
- Modify: `fyp-storefront/src/modules/account/templates/account-layout.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/account/layout.tsx`
- Modify: `fyp-storefront/src/lib/i18n/storefront.ts`
- Test: `fyp-storefront/scripts/test-s2-localization.js`

**Interfaces:**
- Consumes: server dictionary access in account pages and `useStorefrontI18n()` in client forms/navigation
- Produces: bilingual login, registration, account navigation, overview, addresses heading, help text, and custom-order account entry

- [ ] **Step 1: Add failing account coverage**

Require labels, placeholders, validation help, navigation, empty states, and account metadata in both languages.

- [ ] **Step 2: Run the localization test and verify account failures**

- [ ] **Step 3: Migrate account copy without changing form names or actions**

Keep field names, server actions, routes, test IDs, and customer API payloads unchanged.

- [ ] **Step 4: Run localization and TypeScript checks**

Run `pnpm test:s2-localization`, then run the storefront TypeScript compiler.

Expected: localization passes and no new TypeScript error originates from an
account file modified in this task.

---

### Task 5: Localize Store, Product, and Artisan Surfaces

**Files:**
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/store/page.tsx`
- Modify: `fyp-storefront/src/modules/store/components/refinement-list/sort-products/index.tsx`
- Modify: `fyp-storefront/src/modules/store/templates/index.tsx`
- Modify: `fyp-storefront/src/modules/products/components/product-actions/index.tsx`
- Modify: `fyp-storefront/src/modules/products/components/product-actions/mobile-actions.tsx`
- Modify: `fyp-storefront/src/modules/products/components/product-tabs/index.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/artisans/[id]/page.tsx`
- Modify: `fyp-storefront/src/modules/artisans/components/artisan-hero/index.tsx`
- Modify: `fyp-storefront/src/modules/artisans/components/artisan-story/index.tsx`
- Modify: `fyp-storefront/src/modules/artisans/components/artisan-media-feed/index.tsx`
- Modify: `fyp-storefront/src/modules/artisans/templates/index.tsx`
- Modify: `fyp-storefront/src/lib/i18n/storefront.ts`
- Test: `fyp-storefront/scripts/test-s2-localization.js`
- Test: `fyp-storefront/scripts/check-artisan-profile-mvp.js`

**Interfaces:**
- Consumes: localized store/product/artisan dictionary groups
- Produces: bilingual product browsing and complete S2 Artisan Profile UI while preserving product/store/artisan IDs and data

- [ ] **Step 1: Add failing store/product/artisan coverage**

Cover sorting, product information tabs, stock/action states, artisan links, profile fallbacks, story, media, and product sections.

- [ ] **Step 2: Run localization and Artisan Profile tests to verify the new assertions fail**

- [ ] **Step 3: Migrate S3 and S2 copy to dictionary lookups**

Do not translate product titles, descriptions, store names, artisan-authored biographies, specialties, or media captions.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm test:s2-localization
pnpm test:artisan-profile
```

Expected: both pass.

- [ ] **Step 5: Run the Phase 2 gate**

Run `pnpm test:s2-localization`, `pnpm test:artisan-profile`, and
`pnpm test:custom-order`, followed by the storefront TypeScript check. Confirm
the untranslated-file allowlist no longer contains shell, account,
store/product, or artisan files.

Expected: focused tests pass; no new TypeScript error originates from Phase 2
files; the effective UI locale remains `zh-CN` and the switch stays hidden.

- [ ] **Step 6: Deliver Phase 2**

Fetch and compare `origin/development`. Integrate and rerun Step 5 if it
advanced. Show the Phase 2 test results and proposed paths, wait for user
approval, then review/stage only Phase 2 files, commit as
`feat(storefront): localize browsing and account surfaces`, fetch once more,
and push normally.

Expected: fast-forward push succeeds with no environment or personal file.

---

### Task 6: Localize Cart and Checkout Input Surfaces

**Files:**
- Modify: `fyp-storefront/src/modules/cart/components/empty-cart-message/index.tsx`
- Modify: `fyp-storefront/src/modules/cart/components/sign-in-prompt/index.tsx`
- Modify: `fyp-storefront/src/modules/cart/templates/items.tsx`
- Modify: `fyp-storefront/src/modules/checkout/components/addresses/index.tsx`
- Modify: `fyp-storefront/src/modules/checkout/components/billing_address/index.tsx`
- Modify: `fyp-storefront/src/modules/checkout/components/review/index.tsx`
- Modify: `fyp-storefront/src/modules/checkout/components/shipping-address/index.tsx`
- Modify: `fyp-storefront/src/modules/checkout/components/shipping/index.tsx`
- Modify: `fyp-storefront/src/modules/checkout/templates/checkout-summary/index.tsx`
- Modify: `fyp-storefront/src/lib/i18n/storefront.ts`
- Test: `fyp-storefront/scripts/test-s2-localization.js`

**Interfaces:**
- Consumes: cart and checkout dictionary groups
- Produces: bilingual cart states, address fields, shipping flow, review copy, and summary labels without changing checkout payload keys

- [ ] **Step 1: Add failing cart/checkout coverage**

Cover empty state, sign-in prompt, quantity actions, address labels, shipping labels, review action, and checkout summary.

- [ ] **Step 2: Run the localization test and verify failures**

- [ ] **Step 3: Replace hard-coded UI strings**

Keep form field names, country/region option values, shipping-option IDs, cart mutations, and monetary values unchanged.

- [ ] **Step 4: Run localization and type checks for modified files**

Expected: UI-copy checks pass; no new TypeScript errors originate from Task 6 files.

---

### Task 7: Preserve and Localize WeChat Pay Presentation

**Files:**
- Modify: `fyp-storefront/src/modules/checkout/components/payment/index.tsx`
- Modify: `fyp-storefront/src/modules/checkout/components/payment-button/index.tsx`
- Modify: `fyp-storefront/src/modules/checkout/components/wechat-qr-code/index.tsx`
- Preserve: `fyp-storefront/src/modules/common/icons/wechat-pay.tsx`
- Modify: `fyp-storefront/src/lib/i18n/storefront.ts`
- Preserve: `fyp-backend/src/modules/wechat-pay/**`
- Preserve: `fyp-backend/src/scripts/setup-wechat-pay.ts`
- Test: `fyp-storefront/scripts/test-s2-localization.js`
- Test: `fyp-backend/src/modules/wechat-pay/__tests__/*.unit.spec.ts`

**Interfaces:**
- Consumes: S3 payment-provider IDs, QR result shape, mock mode, and existing payment mutations
- Produces: bilingual WeChat Pay labels, instructions, pending/error states, and ordinary payment labels with unchanged provider behavior

- [ ] **Step 1: Add failing payment-copy coverage**

Assert both dictionaries include ordinary payment and WeChat QR copy. Assert components retain S3 provider IDs and do not expose merchant configuration.

- [ ] **Step 2: Run storefront localization and backend WeChat tests**

Expected: localization assertions fail before migration; existing backend WeChat tests establish the behavior baseline.

- [ ] **Step 3: Migrate payment presentation only**

Move labels and instructions into the dictionary. Do not alter API signing, QR generation, status polling, cancellation, refunds, provider IDs, or payment-session flow.

- [ ] **Step 4: Run focused verification**

Run `pnpm test:s2-localization` in storefront and `pnpm test:unit` in backend.

Expected: localization passes and all WeChat tests remain green.

---

### Task 8: Localize Standard Orders and Custom Orders

**Files:**
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/order/[id]/confirmed/page.tsx`
- Modify: `fyp-storefront/src/modules/order/components/order-details/index.tsx`
- Modify: `fyp-storefront/src/modules/order/components/order-summary/index.tsx`
- Modify: `fyp-storefront/src/modules/order/components/payment-details/index.tsx`
- Modify: `fyp-storefront/src/modules/order/components/shipping-details/index.tsx`
- Modify: `fyp-storefront/src/modules/order/templates/order-review-template.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/custom-orders/new/page.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/account/@dashboard/custom-orders/page.tsx`
- Modify: `fyp-storefront/src/app/[countryCode]/(main)/account/@dashboard/custom-orders/[id]/page.tsx`
- Modify: `fyp-storefront/src/lib/util/custom-order-status.ts`
- Modify: `fyp-storefront/src/modules/custom-orders/components/custom-order-card/index.tsx`
- Modify: `fyp-storefront/src/modules/custom-orders/components/custom-order-overview/index.tsx`
- Modify: `fyp-storefront/src/modules/custom-orders/components/request-form/index.tsx`
- Modify: `fyp-storefront/src/modules/custom-orders/components/status-timeline/index.tsx`
- Modify: `fyp-storefront/src/modules/custom-orders/templates/detail-template.tsx`
- Modify: `fyp-storefront/src/modules/custom-orders/templates/request-template.tsx`
- Modify: `fyp-storefront/src/lib/i18n/storefront.ts`
- Test: `fyp-storefront/scripts/test-custom-order-request.js`
- Test: `fyp-storefront/scripts/test-s2-localization.js`

**Interfaces:**
- Consumes: stable backend custom-order statuses and payment statuses
- Produces: bilingual standard-order details and complete bilingual custom-order flow with unchanged API payload/status values

- [ ] **Step 1: Add failing order coverage**

Require standard-order summary/detail keys plus every custom-order request, category label, status label, timeline, quote, payment, cancellation, and TalkJS degraded-state key.

- [ ] **Step 2: Extend contract assertions before implementation**

Assert localized category options submit English backend category values and localized status labels map from the unchanged backend status set.

- [ ] **Step 3: Run focused tests and verify the new assertions fail**

Run `pnpm test:s2-localization` and `pnpm test:custom-order`.

- [ ] **Step 4: Resolve S2/S3 custom-order conflicts and migrate order copy**

Preserve S3's updated custom-order status mapping and S2's timeline/request behavior. Keep status strings, payload field names, category values, money minor-unit conversion, and TalkJS session behavior unchanged.

- [ ] **Step 5: Run focused tests**

Expected: localization test passes and all Custom Order contract tests pass.

- [ ] **Step 6: Run the Phase 3 gate**

Run all storefront localization, Artisan Profile, and Custom Order scripts;
run backend `pnpm test:unit`; run the storefront TypeScript check. Confirm the
untranslated-file allowlist is empty and the rollout constant is still
`false`.

Expected: focused storefront and backend tests pass; no new TypeScript error
originates from Phase 3 files; storefront remains consistently Chinese.

- [ ] **Step 7: Deliver Phase 3**

Fetch and compare `origin/development`. Integrate and rerun Step 6 if it
advanced. Show the Phase 3 test results and proposed paths, wait for user
approval, then review/stage only Phase 3 files, commit as
`feat(storefront): localize checkout and order flows`, fetch once more, and
push normally.

Expected: fast-forward push succeeds; WeChat backend behavior remains covered
by its tests and no secret is staged.

---

### Task 9: Full Verification, Browser QA, and Security Review

**Files:**
- Verify: all modified integration files
- Verify ignored: `fyp-backend/.env`, `fyp-storefront/.env.local`
- Verify untracked exclusions: personal documents, installer, launch script, `.tmp-config`
- Update if needed: `docs/superpowers/specs/2026-09-27-storefront-bilingual-integration-design.md`
- Update if needed: `docs/superpowers/plans/2026-09-27-storefront-bilingual-integration.md`

**Interfaces:**
- Consumes: integrated storefront and unchanged S3 backend behavior
- Produces: verified Phase 4 tree with full bilingual switching ready for the
  final phased commit

- [ ] **Step 1: Enable the rollout constant with a failing expectation first**

Update the localization regression test to require
`STOREFRONT_LANGUAGE_SWITCH_ENABLED = true`, English fallback for missing or
invalid cookies, and a rendered language switcher.

- [ ] **Step 2: Run the localization test and verify it fails**

Expected: FAIL while the rollout constant remains `false`.

- [ ] **Step 3: Enable bilingual switching**

Set the rollout constant to `true`. Confirm the server helper now uses the
validated cookie and defaults to `en`, while explicit `zh-CN` remains
persistent.

- [ ] **Step 4: Run the complete focused storefront suite**

Run:

```powershell
pnpm test:s2-localization
pnpm test:artisan-profile
pnpm test:custom-order
```

Expected: all commands exit 0; Custom Order reports zero failed tests.

- [ ] **Step 5: Run backend unit tests**

Run `pnpm test:unit` in `fyp-backend`.

Expected: all backend unit tests, including WeChat Pay tests, pass.

- [ ] **Step 6: Run TypeScript/build verification**

Run the storefront TypeScript check and production build. Record every failure. Fix any failure introduced by the integration; report separately any reproducible pre-existing baseline failure that remains outside scope.

- [ ] **Step 7: Start local backend and storefront**

Use the local `.env` mock settings. Do not run seed or `setup:wechat-pay`. Confirm backend port 9000 and storefront port 8080 are ready.

- [ ] **Step 8: Verify English and Chinese browser paths**

Check the shell, store/product, authentication/account, cart/checkout, order, Artisan Profile, and Custom Order screens at desktop and narrow widths. On each representative flow, switch languages, refresh, and navigate while confirming the country code remains unchanged.

- [ ] **Step 9: Verify WeChat presentation without shared-data mutation**

Confirm the mock WeChat option and localized QR/instruction states render when a suitable existing cart/session is available. Do not finalize a test purchase or create shared Railway records without separate user authorization. Rely on unit tests for payment lifecycle behavior otherwise.

- [ ] **Step 10: Inspect browser and server errors**

Expected: no hydration warnings, missing-key errors, runtime exceptions, or new failed API calls caused by locale switching.

- [ ] **Step 11: Run formatting and diff checks**

Run Prettier on changed source/docs, `git diff --check`, and a conflict-marker scan.

Expected: no formatting errors, whitespace errors, or conflict markers.

- [ ] **Step 12: Perform the secret and staging-boundary review**

Review `git status`, changed paths, ignored environment files, and diff content for credential-like names/values. Confirm no `.env`, merchant key, database URL, personal document, MSI, CMD script, or `.tmp-config` is staged.

- [ ] **Step 13: Present the verified Phase 4 diff before committing**

Report test results, remaining baseline issues, manual QA coverage, and the
exact files proposed for staging. Wait for user approval before the Phase 4
commit/push.

- [ ] **Step 14: Deliver Phase 4**

After approval, fetch and compare `origin/development`. Integrate and rerun the
complete Phase 4 gate if it advanced. Commit as
`feat(storefront): enable bilingual language switching`, fetch once more, and
push normally.

Expected: fast-forward push succeeds; both languages are publicly available;
no force push or secret/personal file is involved.
