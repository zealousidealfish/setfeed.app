import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const moduleText = readFileSync(new URL('../assets/discord-auth.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sendHtml = readFileSync(new URL('../send.html', import.meta.url), 'utf8');
const inboxHtml = readFileSync(new URL('../inbox.html', import.meta.url), 'utf8');
const completeHtml = readFileSync(new URL('../discord-oauth-complete.html', import.meta.url), 'utf8');
function includes(h,n,m){ assert.ok(h.includes(n), m); }

includes(moduleText, 'const API_BASE_URL = "https://setfeed-integrations-ocsbsvnzsa-nw.a.run.app";', 'backend base URL unchanged');
includes(moduleText, 'const INTENT_KEY = "sf_discord_oauth_intent_v1";', 'exact intent key exists');
includes(moduleText, '[VERIFIER_KEY, STARTED_KEY, DESTINATION_KEY, INTENT_KEY, IN_FLIGHT_KEY]', 'clearState removes INTENT_KEY');
includes(moduleText, 'async function startDiscordSignIn({ auth, destination, intent = "continue" } = {})', 'start supports default continue intent');
includes(moduleText, 'safeIntent === "create_account" ? { codeChallenge: challenge, intent: "create_account" } : { codeChallenge: challenge }', 'continue omits backend intent and create sends create_account');
includes(moduleText, 'headers.Authorization = `Bearer ${token}`;', 'Authorization header remains supported');
for (const code of ['invalid_intent','malformed_intent','already_signed_in','active_session_changed','discord_already_linked','firebase_uid_already_linked','firebase_provisioning_unavailable','provisioning_conflict','discord_not_linked']) includes(moduleText, code, `safe mapping includes ${code}`);
assert.doesNotMatch(moduleText, /console\.(log|warn|error|info|debug)/, 'no console output in shared module');
assert.doesNotMatch(moduleText, /localStorage|document\.cookie|BroadcastChannel|addEventListener\("storage"|indexedDB/i, 'shared module does not use persistent/cross-tab OAuth storage');

for (const needle of ['const bytes = new Uint8Array(32);','crypto.getRandomValues(bytes);','crypto.subtle.digest("SHA-256", data)','url.origin !== window.location.origin','raw.startsWith("//")','/v1/auth/discord/start','/v1/auth/discord/exchange','sessionStorage.getItem(IN_FLIGHT_KEY) === "1"']) includes(moduleText, needle, `security invariant: ${needle}`);
assert.doesNotMatch(moduleText, /\/v1\/auth\/discord\/callback/, 'no browser callback endpoint call');

for (const [name, html] of [['index', indexHtml], ['send', sendHtml], ['inbox', inboxHtml]]) {
  includes(html, './assets/discord-auth.js', `${name} uses shared module`);
  includes(html, 'id="btn-discord"', `${name} keeps continue button`);
  includes(html, 'id="btn-discord-create"', `${name} adds create button`);
  includes(html, 'Continue with Discord', `${name} keeps continue label`);
  includes(html, 'Create Setfeed account with Discord', `${name} has create label`);
  includes(html, 'Continue with Google', `${name} keeps Google`);
  includes(html, 'startDiscordSignIn', `${name} calls shared helper`);
  const inlineOnly = html.replace(/<script src="\.\/assets\/discord-auth\.js"><\/script>/g, '');
  assert.doesNotMatch(inlineOnly, /codeChallenge|\/v1\/auth\/discord\/exchange|signInWithCustomToken/, `${name} does not duplicate PKCE/exchange/custom-token logic`);
}
includes(indexHtml, 'sendSignInLinkToEmail', 'homepage keeps email-link');
includes(sendHtml, 'sendSignInLinkToEmail', 'send keeps email-link');
for (const needle of ['function getDiscordDestination()','return "/send.html";','return "/receive.html";','return "/inbox.html";']) includes(indexHtml, needle, 'homepage destination logic has Send/Receive/Inbox');
includes(sendHtml, 'destination: "/send.html#signin"', 'send uses /send.html#signin');
includes(inboxHtml, '"/inbox.html#hidden"', 'inbox supports hidden destination');
includes(inboxHtml, '"/inbox.html"', 'inbox supports visible destination');

for (const needle of ['id="restart"','id="create-account"','id="continue-discord"','Setfeed account created','Signed in','createAccount.addEventListener','parseResultFragment(window.location.hash)']) includes(completeHtml, needle, `completion contains ${needle}`);
assert.ok(completeHtml.indexOf('history.replaceState') < completeHtml.indexOf('exchangeDiscordResult'), 'fragment removal occurs before exchange invocation');
assert.doesNotMatch(completeHtml, /searchParams\.get\(["']discord_/, 'query-string Discord result parsing absent');
assert.doesNotMatch(completeHtml, /complete[\s\S]*startDiscordSignIn\([\s\S]*create_account[\s\S]*exchangeDiscordResult/, 'no automatic create-account in initial completion');
console.log('discord-auth static checks passed');
