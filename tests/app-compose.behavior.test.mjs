import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const coreSource = readFileSync(new URL('../app/assets/compose-core.js', import.meta.url), 'utf8');
const composeSource = readFileSync(new URL('../app/assets/compose.js', import.meta.url), 'utf8');
const sendHtml = readFileSync(new URL('../app/send.html', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../app/assets/shell.js', import.meta.url), 'utf8');

const context = {
  window: {},
  Intl,
  Date,
  Error,
  Uint8Array,
  JSON,
  Set,
  String,
  Number,
  Math,
  btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
  crypto: {
    randomUUID() { return '11111111-2222-4333-8444-555555555555'; },
    getRandomValues(bytes) { bytes.fill(7); return bytes; },
  },
};
context.window.window = context.window;
context.window.Intl = Intl;
context.window.Date = Date;
context.window.crypto = context.crypto;
vm.runInNewContext(coreSource, context, { filename: 'app/assets/compose-core.js' });
const core = context.window.SetfeedComposeCore;

assert.equal(
  core.localToInstant('2026-07-15', '12:30', 'Europe/London').toISOString(),
  '2026-07-15T11:30:00.000Z',
  'summer London time converts to UTC',
);
assert.throws(
  () => core.localToInstant('2026-03-29', '01:30', 'Europe/London'),
  (error) => error.code === 'nonexistent_local_time',
  'DST spring gap is rejected',
);
assert.throws(
  () => core.localToInstant('2026-10-25', '01:30', 'Europe/London'),
  (error) => error.code === 'ambiguous_local_time',
  'DST autumn overlap is rejected',
);
assert.equal(core.validateBody('  hello  '), 'hello');
assert.throws(() => core.validateBody('x'.repeat(2001)), (error) => error.code === 'message_too_long');
assert.throws(
  () => core.validateSchedule(new Date('2026-07-13T12:09:59Z'), new Date('2026-07-13T12:00:00Z')),
  (error) => error.code === 'delivery_too_soon',
);

const payload = core.buildPayload({
  recipient: { publicProfileId: 'prof_1234567890abcdef' },
  presetId: 'personal',
  body: 'A future message',
  date: '2026-07-15',
  time: '12:30',
  timeZone: 'Europe/London',
  now: new Date('2026-07-13T12:00:00Z'),
});
assert.deepEqual(Object.keys(payload), ['recipientPublicProfileId', 'body', 'presetId', 'deliverAt']);
assert.equal(payload.deliverAt, '2026-07-15T11:30:00.000Z');
assert.equal(core.createIdempotencyKey(context.crypto), 'web-person:11111111-2222-4333-8444-555555555555');
assert.equal(core.fingerprint(payload), core.fingerprint({ ...payload }));

for (const needle of [
  'app.request("/v1/message-presets", { method: "GET" })',
  'app.request("/v1/person-messages", {',
  'body: { ...payload, idempotencyKey }',
  'pendingAttempt = { fingerprint: value, key: core.createIdempotencyKey() }',
  '["network_timeout", "backend_unavailable", "request_cancelled"]',
  'Retry this unchanged draft to safely check the same request.',
  'pendingAttempt = null;',
]) assert.ok(composeSource.includes(needle), `compose source includes ${needle}`);

assert.doesNotMatch(composeSource, /localStorage|sessionStorage/, 'draft and idempotency state are not persisted');
assert.ok(sendHtml.includes('id="compose-form"'));
assert.ok(sendHtml.includes('id="compose-body"'));
assert.ok(sendHtml.includes('maxlength="2000"'));
assert.ok(sendHtml.includes('id="compose-timezone"'));
assert.ok(sendHtml.includes('id="compose-success"'));
assert.ok(shellSource.indexOf('./assets/recipients.js') < shellSource.indexOf('./assets/compose-core.js'));
assert.ok(shellSource.indexOf('./assets/compose-core.js') < shellSource.indexOf('./assets/compose.js'));

console.log('app compose behavior checks passed');
