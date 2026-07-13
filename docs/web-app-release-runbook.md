# Setfeed web app release runbook

This repository is a root-served static site. The authenticated web app is located under `/app/` and depends on the production integrations API configured in `app/assets/config.js`.

## Release gates

Do not merge PR #15 until all of these are true:

1. The latest **Static site tests** workflow passes on the exact PR head SHA.
2. The production hosting provider and source branch are confirmed outside this repository.
3. The host serves repository-root files without relocating them into another public directory.
4. Direct requests for `/app/`, `/app/index.html`, and every nested asset return successfully.
5. Firebase Authentication authorizes the production domain and all three sign-in methods are tested.
6. The browser acceptance test below passes with two real non-anonymous accounts.

The repository contains `CNAME` for `setfeed.app`, but it does not contain Firebase Hosting, Vercel, or Netlify configuration. Confirm the actual hosting control plane before merge; do not infer it from `CNAME` alone.

## Pre-deployment checks

Record the following values in the release ticket or PR comment:

- PR head SHA
- target branch SHA
- hosting provider
- hosting source branch and directory
- production domain
- API base URL from `app/assets/config.js`
- Firebase project ID from `app/assets/config.js`
- person performing the deployment

Confirm that the host publishes the repository root and preserves these paths:

- `/app/`
- `/app/send.html`
- `/app/upcoming.html`
- `/app/awaiting.html`
- `/app/inbox.html`
- `/app/feed.html`
- `/app/sent.html`
- `/app/settings.html`
- `/assets/discord-auth.js`
- `/discord-oauth-complete.html`
- `/open-setfeed.html`

## Browser acceptance test

Use a clean browser profile and two real accounts, Alice and Bob.

### Authentication and onboarding

1. Open `/app/` while signed out.
2. Complete Google sign-in and verify the profile bootstrap/onboarding form.
3. Sign out and complete email-link sign-in on the same device.
4. Sign out and complete Discord sign-in from `/app/feed.html`; verify the OAuth flow returns to `/app/feed.html`.
5. Complete onboarding with a valid username, display name, IANA time zone, and explicit receiving permission.
6. Refresh the page and verify the signed-in profile remains loaded.

### Person-to-person scheduling

1. Sign in as Alice and resolve Bob using Bob's exact Setfeed username.
2. Confirm unavailable or blocked usernames receive only the generic unavailable response.
3. Select Bob, choose a preset, write a message, and schedule it at least ten minutes ahead.
4. Confirm the success state appears once and the message appears in Sent.
5. Retry an intentionally interrupted submission and verify only one outbound message exists.

### Upcoming and Awaiting

1. Sign in as Bob and open Upcoming.
2. Verify the scheduled body is not visible anywhere in the page or browser UI.
3. Mark the message Awaiting and verify the capability text matches Bob's Discord link/receiving state.
4. Open Awaiting and remove it; verify it returns to Upcoming.
5. Mark it Awaiting again for release testing.

### Release, Inbox, and Feed

1. After the scheduled time, refresh Inbox.
2. Verify the released body is visible only after release.
3. Move the message to Feed and verify it disappears from Inbox and appears in Feed.
4. Move it back to Inbox, then hide it and verify it leaves the active view.
5. Verify Alice's Sent page shows release and Discord notification statuses without message body text.

### Discord behavior

1. Run `/setfeed status` and confirm the linked account state.
2. Run `/setfeed receiving enabled:true`.
3. Schedule another message and verify the initial Discord notice contains no private body.
4. Mark it Awaiting and verify the release notice arrives only after release.
5. Disable receiving before release and verify no release notice arrives while the message still releases in the web Inbox.

### Entry points and responsive behavior

1. On desktop, open `/open-setfeed.html` and verify it routes to `/app/`.
2. On Android, verify the page preserves the Google Play route.
3. On an Apple device, verify the existing Apple fallback remains intact.
4. Test app navigation at narrow and wide viewport sizes.
5. Use keyboard-only navigation through authentication, recipient selection, compose, message actions, and Settings.
6. Confirm visible focus, readable status messages, and no horizontal scrolling at 320 CSS pixels.

## Post-deployment smoke test

After deployment, use a signed-out private window to request every path listed under **Pre-deployment checks**. Verify successful status codes and correct content types for HTML, CSS, and JavaScript. Then perform one sign-in and one authenticated `GET /v1/profile` flow through the UI.

## Rollback

If the static deployment breaks navigation, authentication, or API access:

1. Restore the previous hosting revision or redeploy the previous `main` SHA.
2. Do not change or delete backend message records, scheduled deliveries, notification outbox records, or Firebase accounts.
3. Verify the legacy root pages still load.
4. Record the failed SHA, affected route, browser, console error, and network response.
5. Keep PR #15 draft until the failure is reproduced and corrected.
