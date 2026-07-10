import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../discord-link.html', import.meta.url), 'utf8');

function assertIncludes(value, description) {
  assert.ok(html.includes(value), description);
}

assertIncludes('const INTEGRATION_API_BASE_URL = "https://setfeed-integrations-ocsbsvnzsa-nw.a.run.app";', 'integration API base URL must match the supplied Cloud Run URL');
assertIncludes('const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;', 'token validation must be exactly 43 base64url characters');
assertIncludes('<meta name="referrer" content="no-referrer" />', 'page must use no-referrer policy');
assertIncludes('<meta name="robots" content="noindex,nofollow" />', 'page must remain noindex,nofollow');

const referrerIndex = html.indexOf('<meta name="referrer" content="no-referrer" />');
const firstExternalResourceIndex = Math.min(
  ...['<link rel="icon"', '<link rel="stylesheet"', '<script src='].map((needle) => html.indexOf(needle)).filter((index) => index >= 0)
);
assert.ok(referrerIndex > -1 && referrerIndex < firstExternalResourceIndex, 'no-referrer policy must appear before external resources');

const earlyScriptIndex = html.indexOf('const queryToken = url.searchParams.get("token") || "";');
assert.ok(earlyScriptIndex > -1 && earlyScriptIndex < firstExternalResourceIndex, 'token extraction must run before external resources are requested');
assertIncludes('url.searchParams.delete("token");', 'early script must remove token query parameter');
assertIncludes('history.replaceState(null, "", url.pathname + url.search + url.hash);', 'early script must preserve other query parameters and fragments while removing token');
assertIncludes('if (TOKEN_PATTERN.test(queryToken)) sessionStorage.setItem(TOKEN_SESSION_KEY, queryToken);', 'only correctly formatted tokens may be stored in sessionStorage');
assertIncludes('else sessionStorage.removeItem(TOKEN_SESSION_KEY);', 'malformed query tokens must clear stale sessionStorage tokens');
assertIncludes('sessionStorage.removeItem(TOKEN_SESSION_KEY); } catch (_) {} linkToken = null;', 'token must be cleared after successful completion');

assert.doesNotMatch(html, /localStorage\.setItem\([^\n]*(TOKEN_SESSION_KEY|linkToken|queryToken|sourceToken|storedToken|sf_discord_link_token_v1)/, 'Discord link token must not be stored in localStorage');

const emailActionMatch = html.match(/sendSignInLinkToEmail\(email, \{ url: ([^,]+), handleCodeInApp: true \}\)/);
assert.ok(emailActionMatch, 'email sign-in action URL must be present');
assert.doesNotMatch(emailActionMatch[1], /token|TOKEN_SESSION_KEY|linkToken|queryToken|sessionStorage/i, 'email action URL must not include the Discord token');
assertIncludes('if (completedEmailLink && tokenResult.result === "missing")', 'tokenless email-link tabs must complete sign-in without attempting link completion');
assertIncludes('Return to your original Discord linking tab to finish linking.', 'tokenless email-link tabs must show return-to-original-tab guidance');

assertIncludes('body && body.error && typeof body.error.code === "string" ? body.error.code : ""', 'backend errors must be read from nested body.error.code');
for (const code of [
  'expired_token',
  'consumed_token',
  'invalidated_token',
  'inactive_token',
  'invalid_token',
  'conflicting_discord_account',
  'conflicting_firebase_uid',
  'invalid_firebase_token',
  'missing_auth',
  'anonymous_firebase_user',
  'rate_limited',
  'wrong_origin',
  'malformed_body',
  'invalid_consent_version',
  'unsupported_media_type',
  'body_too_large',
  'temporary_service_error'
]) {
  assertIncludes(code, `backend error code ${code} must be handled`);
}
assert.doesNotMatch(html, /already_used_token|account_conflict|unauthenticated|invalid_request/, 'removed/nonexistent backend error codes must not be mapped');

assertIncludes('const payload = {\n          token: linkToken,\n          receivingEnabled: receivingEnabled.checked\n        };', 'payload must include token and receivingEnabled');
assertIncludes('if (receivingEnabled.checked) {\n          payload.consentVersion = CONSENT_VERSION;\n        }', 'consentVersion must be added only when receiving is enabled');
assertIncludes('typeof body.receivingEnabled === "boolean" ? body.receivingEnabled : false', 'success message must use server receivingEnabled boolean');
assertIncludes('getIdToken(true)', 'completion must use a fresh Firebase ID token');
assertIncludes('method: "POST"', 'completion request must be POST');
assertIncludes('base.protocol !== "https:"', 'integration API must enforce HTTPS');

const payloadToFetch = html.slice(html.indexOf('const payload = {'), html.indexOf('let body = null;'));
assert.doesNotMatch(payloadToFetch, /discord(User)?Id|discord_user_id|discord_id|firebaseUid|firebase_uid|uid\b/, 'completion request must not include Discord user ID or Firebase UID');
assertIncludes('if (pendingSubmit || !auth.currentUser || !linkToken) return;', 'repeat submission guard must exist');
assertIncludes('btnLink.disabled = true;', 'link button must be disabled while pending');
assertIncludes('btnSignout.disabled = true;', 'signout button must be disabled while pending');

console.log('discord-link static checks passed');
