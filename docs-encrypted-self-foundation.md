# Website encrypted-text foundation

## Repository discovery
- Framework/rendering: static HTML pages with browser scripts; no SPA framework or server rendering.
- Package manager/runtime: no `package.json`; tests are Node `.mjs` scripts.
- TypeScript: no TypeScript config exists, so strict runtime validators and documented structural types are used.
- Router: file-based static pages.
- Firebase Auth: Firebase compat SDK initialized per page; reusable clients consume Firebase Auth objects through one authenticated boundary.
- API conventions: browser `fetch` modules with explicit backend base URL, JSON parsing, no raw payload logging, and safe backend error codes.
- State/query/cache: no query library; account-bound in-memory state only. Compose retry metadata is UID-bound and contains no plaintext or raw keys.
- Service worker/offline cache: no service worker was found; encrypted API requests use `cache: "no-store"`.
- Analytics/crash/session replay: no analytics, crash reporting, or replay SDK was found. The technical page masks the encrypted-message DOM tree.
- Deployment/CSP: static hosting assets with `CNAME`; no CSP file was found.

## Safe static configuration and feature flags
`SetfeedEncryptedSelf.CONFIG` is the single browser-safe static configuration object. API base URL, backend capability states, UI visibility, rollout flags, and source-specific schedule limits are separate. UI and rollout flags remain false by default, and backend capability is not hard-coded as supported merely because JavaScript exists.

## Two send paths
### Receive-code Inbox
- Signed-in mobile or browser transport using the existing Secure/Personal receive-code model.
- Supports text and the existing encrypted image attachment/session flow.
- UI maximum schedule is seven days; the backend must independently enforce the same source-specific limit.
- Uses existing receive-code encryption and Firebase callable functions: `getReceiveCodes`, `sendSignedCiphertext`, `createSignedAttachmentUpload`, and existing signed attachment/session calls.
- “Send to my Inbox” retrieves the current non-anonymous Firebase account’s Secure receive code only, never puts it in a URL, never logs it, never sends it to analytics, and does not persist it after the send flow.
- “Send to another receive code” remains manually entered by a signed-in sender and must not expose recipient account details.

### Website private self-message
- Text only; encrypted images are deferred and no website_self image API or UI is implemented.
- Uses the encrypted website_self backend and account-key encryption.
- UI maximum schedule is 365 days; the backend must independently enforce the same source-specific limit.
- The first release uses same-browser device-local account-key recovery only. Clearing browser storage may make messages unreadable. Another device should use the receive-code “Send to my Inbox” path. No cross-device account-key recovery or support recovery is claimed.

## Backend API mapping
`EncryptedSelfClient` uses the exact current website_self routes: `GET/POST /v1/crypto/account-key`, `POST /v1/self-message-drafts`, `POST /v1/self-message-drafts/:draftId/finalize`, `GET /v1/self-messages`, `GET /v1/self-messages/:messageId`, `POST /v1/self-messages/:messageId/awaiting`, `POST /v1/self-messages/:messageId/restore-upcoming`, `POST /v1/self-messages/:messageId/cancel`, `POST /v1/self-messages/:messageId/restore`, `PATCH /v1/self-messages/:messageId/placement`, and `GET/PUT /v1/notification-preferences/release-email` with body `{ "releaseEmailEnabled": boolean }`.

## Authentication behavior
The authenticated boundary rejects signed-out and anonymous accounts, obtains Firebase ID tokens without persisting them outside Firebase, supports AbortSignal and bounded timeouts, cancels tracked requests on logout/account switch, and keeps account-bound data from being reused across UIDs.

## Account-key lifecycle and same-browser recovery
Account-key creation generates a random 32-byte root key locally, wraps it with a non-extractable AES-KW device wrapping key stored in IndexedDB by structured clone and bound to the authenticated Firebase UID, and sends only `cryptoVersion`, `keyWrapAlgorithm`, `recoveryWrappedRootKey`, and a body `idempotencyKey` to the backend. The server assigns `accountKeyId`; the browser never generates it.

## Cryptography and exact AAD
The module uses Web Crypto only. Content is encrypted with AES-GCM (`A256GCM`), 12-byte IVs, 128-bit tags, and content keys wrapped with AES-KW (`A256KW`). Base64url is canonical and unpadded. The exact AAD bytes are UTF-8 for `setfeed:v1:key:${accountKeyId}:message:${messageId}:part:text`; draft ID, release time, UID, JSON, and length prefixes are intentionally excluded.

## Envelope and parsing policy
Account-key responses and encrypted-text envelopes use exact-key validation and reject unknown fields, padded or noncanonical base64url, wrong IV or wrapped-key lengths, unsupported versions/algorithms, mismatched `accountKeyId`, ciphertext below 17 bytes, and ciphertext above the server-returned draft limit.

## Compose/finalization flow
The explicit state list is: idle, key_loading, key_setup_required, recovery_required, draft_reserving, draft_reserved, encrypting, ready_to_finalize, finalizing, scheduled, failed_recoverable, failed_terminal, cancelled. Draft reservation sends `{ deliverAt, hasText: true, hasImage: false, idempotencyKey }`. Finalization sends `{ expectedDraftVersion: 1, encryptedText, finalizedAssetId: null, idempotencyKey }`. Idempotency keys are body fields, not `Idempotency-Key` headers.

## Awaiting and release-email capability
Website_self Awaiting uses `POST /v1/self-messages/:messageId/awaiting` and restore-upcoming uses `POST /v1/self-messages/:messageId/restore-upcoming`. Canonical non-website_self Inbox Awaiting uses `PUT /v1/messages/:messageId/awaiting` and `DELETE /v1/messages/:messageId/awaiting`. Awaiting is recipient-controlled. Release-email preference is recipient-owned and disabled by default. Awaiting release email for receive-code messages is `backend_bridge_required` until an integration test proves the legacy message ID is represented in the release-email backend’s canonical scheduled-delivery model.

## Persistence, cache, and privacy policy
Raw keys and plaintext are never stored in localStorage, sessionStorage, cookies, URLs, logs, analytics, crash metadata, or replay captures. IndexedDB stores only the non-extractable device wrapping CryptoKey with UID binding and non-secret metadata. Decrypted text remains in narrow in-memory results and must be cleared on close, logout, and account switch. Encrypted API responses use `no-store`.

## Supported browsers and limitations
Supported browsers must provide IndexedDB structured cloning for CryptoKey, `crypto.subtle`, AES-GCM, AES-KW, `TextEncoder`, `TextDecoder`, AbortController, and Fetch. Production feature flags remain disabled. Final polished UI is outside this foundation task.
