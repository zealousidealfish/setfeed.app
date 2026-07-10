# Discord account linking manual test checklist

This page is intentionally not linked from primary navigation while Discord linking is in controlled rollout.

Use test Discord-link tokens issued by the integration backend. Never paste production user tokens into bug reports, analytics, screenshots, or shared logs.

## Preconditions

- Firebase project: `setfeed-fcd7a`.
- Page under test: `/discord-link.html?token=<test-token>`.
- Integration API base URL in `discord-link.html` uses HTTPS and points to the public Cloud Run integration service.
- Test with a desktop browser and a mobile viewport or device.

## Deterministic checks

1. Missing token: open `/discord-link.html`; verify the page shows an invalid-link state and no network request is made to `/v1/discord-links/complete`.
2. Malformed token: open `/discord-link.html?token=bad.token`; verify local rejection and no completion request.
3. Excessively long token: open with a token longer than 512 characters; verify local rejection and no completion request.
4. URL cleanup: open with a valid test token; verify the visible URL no longer contains `token=` after page initialization.
5. Signed-out state: sign out, open a valid test token, and verify Google and email-link Setfeed sign-in methods are available.
6. Popup recovery: use Google sign-in from the page; verify the token remains available after popup sign-in and the confirm panel appears.
7. Redirect recovery: block popups or use a browser that forces redirect; verify returning to `/discord-link.html` keeps the linking flow and does not expose the token in the URL.
8. Email-link recovery: request an email sign-in link from the page, open it on the same browser, and verify the confirm panel appears without requiring the token in the visible URL.
9. Accessibility: tab through controls, toggle the consent checkbox with the keyboard, activate Link account with Enter/Space, and verify focus moves to the success panel.
10. Repeat submission: click Link account repeatedly during a slow request; verify only one POST is sent while pending.
11. Refresh safety: refresh the confirm page; verify it does not submit automatically and still requires pressing Link account.
12. Successful link: complete a fresh token with receiving unchecked; verify success says the Setfeed account is linked and receiving is not enabled.
13. Successful link with consent: complete a fresh token with receiving checked; verify success says receiving through Discord is enabled.
14. Expired token: complete an expired token; verify the expired-token message asks for a new Discord link.
15. Replayed token: complete an already used token; verify the already-used message appears.
16. Account conflict: complete a token for a Discord account already linked elsewhere; verify the account-conflict message appears.
17. Unauthenticated backend response: force a stale/invalid Firebase ID token or sign out in another tab before submitting; verify the unauthenticated message appears.
18. Temporary service error: point a local test build at a backend that returns 503; verify the temporary-service-error message appears and the button is re-enabled.
19. Mobile layout: verify panels, buttons, checkbox label, and status messages fit at 320px width without horizontal scrolling.
20. Privacy check: verify browser requests never include a Discord user ID field and that the token is not written to localStorage.
