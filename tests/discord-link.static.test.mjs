import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../discord-link.html', import.meta.url), 'utf8');

assert.match(html, /const INTEGRATION_API_BASE_URL = "https:\/\//, 'integration API base URL must be HTTPS');
assert.match(html, /history\.replaceState\(null, "", url\.pathname \+ url\.search \+ url\.hash\)/, 'token must be removed from visible URL after reading');
assert.doesNotMatch(html, /localStorage\.setItem\([^\n]*token/i, 'link token must not be stored in localStorage');
assert.doesNotMatch(html, /discordUserId|discord_user_id|discordId|discord_id/, 'browser must not send a Discord user ID');
assert.match(html, /getIdToken\(true\)/, 'completion must use a fresh Firebase ID token');
assert.match(html, /POST/, 'completion request must be POST');
assert.match(html, /receivingEnabled: receivingEnabled\.checked/, 'completion payload must include receiving choice');
assert.match(html, /consentVersion: CONSENT_VERSION/, 'completion payload must include consent version');
assert.match(html, /pendingSubmit/, 'repeat submission guard must exist');
assert.match(html, /expired_token/, 'expired token backend error must be handled');
assert.match(html, /already_used_token/, 'replayed token backend error must be handled');
assert.match(html, /account_conflict/, 'account conflict backend error must be handled');
assert.match(html, /Your Setfeed account is linked to Discord\./, 'success copy must be present');

console.log('discord-link static checks passed');
