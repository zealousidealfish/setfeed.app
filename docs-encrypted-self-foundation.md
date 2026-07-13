# Website encrypted-text foundation

## Repository discovery
- Framework/rendering: static HTML pages with browser scripts; no SPA framework or server rendering.
- Package manager/runtime: no `package.json`; tests are Node `.mjs` scripts using built-in `node:test`/`assert` style.
- TypeScript: no TypeScript config exists, so strict runtime validators and documented structural types are used in the browser module.
- Router: file-based static pages.
- Firebase Auth: Firebase compat SDK initialized per page; the foundation consumes `window.sfAuth`/Firebase Auth objects through a single authenticated boundary.
- API conventions: browser `fetch` modules with explicit backend base URLs, JSON parsing, and safe error codes.
- State/query/cache: no query library; account-bound in-memory caches only. Compose retry metadata is stored under UID-bound operation keys and contains no plaintext or raw keys.
- Service worker/offline cache: no service worker was found; encrypted detail requests still use `cache: "no-store"`.
- Analytics/crash/session replay: no analytics, crash reporting, or replay SDK was found. The technical page marks the sensitive tree with masking attributes.
- Deployment/CSP: static hosting assets with `CNAME`; no CSP file was found in the repository.

## Feature flags
`SetfeedEncryptedSelf.FLAGS` separates backend capability, UI visibility, and controlled rollout. Encrypted self-message viewing, encrypted self-message composition, and release-email settings are disabled by default.

## API mapping
The typed `ApiClient` attaches Firebase ID tokens, supports AbortSignal and bounded timeouts, retries once with token refresh only when safe, parses JSON success/error envelopes, maps backend error codes, and exposes operations for account keys, encrypted text draft reserve/finalize, Upcoming/Awaiting/Released/Feed/Cancelled lists, detail, Awaiting, cancel, restore, placement, and release-email preferences.

## Authentication behavior
`authBoundary` rejects signed-out and anonymous users, asks Firebase for ID tokens without persisting tokens itself, tracks sensitive request controllers, aborts them on logout/account switch, and prevents reuse of account-bound data by binding operation storage to UID.

## Account-key lifecycle and recovery contract
The browser creates a random 256-bit account root key with Web Crypto and validates account-key bundles for version, algorithms, IDs, and encoded material. The unwrapped root key is never sent to the backend and is held only in memory.

Confirmed recovery contract is intentionally narrow: the current website contract does not confirm what unwraps `recoveryWrappedRootKey`, how a new browser recovers it, whether a recovery code or credential is involved, what happens if recovery material is lost, whether key rotation exists, or how old content remains decryptable after rotation. Therefore `RecoveryKeyProvider` is the only extension point and the default provider returns `recovery_required`; the UI must show recovery unavailable. No password-derived recovery or support recovery claim is implemented.

## Cryptography and exact AAD
The module uses Web Crypto only. Text content is encrypted with AES-256-GCM using 12-byte IVs. Content keys are wrapped with AES-KW (`A256KW`). Base64url is canonical unpadded. Exact text AAD is UTF-8 bytes for length-prefixed fields joined by `|`: `setfeed.website_self.text.v1`, `accountKeyId`, `messageId`, `draftId`, and ISO release time. This avoids reliance on JSON property ordering.

## Compose/finalization flow
The explicit state list is: idle, key_loading, key_setup_required, recovery_required, draft_reserving, draft_reserved, encrypting, ready_to_finalize, finalizing, scheduled, failed_recoverable, failed_terminal, cancelled. Stable reserve/finalize idempotency keys are generated with secure randomness and persisted only as UID-bound non-secret operation metadata. Plaintext is not persisted and is never included in API payloads.

## Lists, detail, lifecycle, and preferences
List operations are metadata-only and cursor-based. Released encrypted detail is fetched only by explicit open/decrypt action and uses `no-store`. Lifecycle operations cover Awaiting, cancellation, restoration, and placement with idempotency keys. Release-email preferences are represented as enabled/disabled/unavailable/authentication-required/unsupported-account states by callers; the API does not expose or infer email addresses.

## Persistence, cache, and privacy policy
Raw keys, plaintext, Firebase tokens, ciphertext, IVs, wrapped keys, account-key bundles, recovery material, message IDs, draft IDs, account-key IDs, and email addresses must not be logged, sent to analytics, placed in URLs, or persisted in localStorage/sessionStorage/cookies. Decrypted text remains in narrow in-memory results and must be cleared when views close, logout occurs, or accounts switch. Encrypted-message API responses are requested with `no-store`; no service worker caches sensitive routes because none exists.

## Supported browsers and limitations
Supported browsers must provide `crypto.subtle`, AES-GCM, AES-KW, `TextEncoder`, `TextDecoder`, AbortController, and Fetch. Encrypted images are deferred; no image APIs, image upload, image selection, multiple attachments, audio, or video are implemented. Final polished product UI is outside this task. Production features remain disabled.
