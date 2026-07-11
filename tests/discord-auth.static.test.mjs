import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const moduleText = readFileSync(new URL('../assets/discord-auth.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sendHtml = readFileSync(new URL('../send.html', import.meta.url), 'utf8');
const inboxHtml = readFileSync(new URL('../inbox.html', import.meta.url), 'utf8');
const completeHtml = readFileSync(new URL('../discord-oauth-complete.html', import.meta.url), 'utf8');

function includes(haystack, needle, message) { assert.ok(haystack.includes(needle), message); }

includes(moduleText, 'const API_BASE_URL = "https://setfeed-integrations-ocsbsvnzsa-nw.a.run.app";', 'Discord OAuth uses configured integrations backend base URL');
includes(moduleText, 'const bytes = new Uint8Array(32);', 'PKCE verifier uses exactly 32 random bytes');
includes(moduleText, 'crypto.getRandomValues(bytes);', 'PKCE verifier uses cryptographically secure randomness');
includes(moduleText, 'const VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43}$/;', 'PKCE verifier is exactly 43 unpadded base64url characters');
includes(moduleText, 'crypto.subtle.digest("SHA-256", data)', 'PKCE challenge uses SHA-256');
includes(moduleText, 'sessionStorage.setItem(VERIFIER_KEY, verifier);', 'PKCE verifier is stored in sessionStorage');
includes(moduleText, 'sessionStorage.setItem(STARTED_KEY, String(Date.now()));', 'initiation timestamp is stored separately');
assert.doesNotMatch(moduleText, /localStorage|document\.cookie|BroadcastChannel|addEventListener\("storage"|indexedDB/i, 'Discord OAuth state is not deliberately shared across tabs or persistent storage');
includes(moduleText, 'Date.now() - startedMs > STATE_TTL_MS', 'stale verifier is rejected');
includes(moduleText, 'clearState(); return { ok:false, code:"malformed_verifier" };', 'malformed verifier clears state');
includes(moduleText, 'ALLOWED_DESTINATIONS', 'pending destinations are allowlisted');
includes(moduleText, 'url.origin !== window.location.origin', 'external destinations are rejected');
includes(moduleText, 'raw.startsWith("//")', 'protocol-relative destinations are rejected');
includes(moduleText, 'decodeURIComponent(raw)', 'encoded external redirects are inspected');
includes(moduleText, '/v1/auth/discord/start', 'start endpoint is called');
includes(moduleText, '/v1/auth/discord/exchange', 'exchange endpoint is called');
assert.doesNotMatch(moduleText, /\/v1\/auth\/discord\/callback/, 'website never calls callback endpoint');
includes(moduleText, 'headers.Authorization = `Bearer ${token}`;', 'Firebase Authorization header is optional when a user exists');
includes(moduleText, 'sessionStorage.getItem(IN_FLIGHT_KEY) === "1"', 'exchange has in-flight protection');
assert.doesNotMatch(moduleText, /console\.(log|warn|error|info|debug)/, 'sensitive OAuth values are not written to console output');

for (const needle of ['url.protocol !== "https:"', 'url.hostname !== "discord.com"', 'url.pathname !== "/oauth2/authorize"', 'url.username || url.password || url.hash', 'url.searchParams.getAll(key)', 'url.searchParams.get("response_type") !== "code"', '.includes("identify")']) {
  includes(moduleText, needle, `authorization URL validation includes ${needle}`);
}
for (const code of ['access_denied', 'invalid_or_expired_state', 'discord_exchange_failed', 'discord_profile_failed', 'discord_not_linked', 'firebase_account_mismatch', 'firebase_user_unavailable', 'rate_limited', 'invalid_firebase_token', 'internal_error', 'malformed_json_response', 'invalid_authorization_url', 'firebase_custom_token_sign_in_failed', 'ambiguous_exchange_outcome']) {
  includes(moduleText, code, `safe error mapping includes ${code}`);
}
includes(moduleText, 'Your Discord account is not linked to Setfeed yet. Run /setfeed link in Discord, then try again.', 'discord_not_linked guidance is exact');
includes(moduleText, 'response.headers.get("Retry-After")', 'Retry-After is read only when exposed to browser JavaScript');

for (const [name, html] of [['index', indexHtml], ['send', sendHtml], ['inbox', inboxHtml], ['complete', completeHtml]]) {
  includes(html, './assets/discord-auth.js', `${name} uses shared Discord OAuth module`);
}
for (const [name, html] of [['index', indexHtml], ['send', sendHtml], ['inbox', inboxHtml]]) {
  includes(html, 'Continue with Discord', `${name} exposes Continue with Discord`);
  includes(html, 'Continue with Google', `${name} preserves Google sign-in`);
  const inlineOnly = html.replace(/<script src=\"\.\/assets\/discord-auth\.js\"><\/script>/g, '');
  assert.doesNotMatch(inlineOnly, /codeChallenge|signInWithCustomToken|\/v1\/auth\/discord\/exchange/, `${name} does not duplicate PKCE or exchange logic`);
}
includes(indexHtml, 'sendSignInLinkToEmail', 'homepage preserves email-link sign-in');
includes(sendHtml, 'sendSignInLinkToEmail', 'Send preserves email-link sign-in');
includes(completeHtml, 'parseResultFragment(window.location.hash)', 'completion page reads OAuth fragment only');
includes(completeHtml, 'history.replaceState(null, "", window.location.pathname + window.location.search);', 'completion page removes fragment immediately');
includes(completeHtml, 'signInWithCustomToken(exchanged.firebaseCustomToken)', 'completion page signs in to Firebase with custom token');
assert.doesNotMatch(completeHtml, /searchParams\.get\(["']discord_/, 'completion page ignores OAuth query parameters');

console.log('discord-auth static checks passed');
