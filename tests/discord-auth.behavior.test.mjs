import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { TextEncoder } from 'node:util';

const source = readFileSync(new URL('../assets/discord-auth.js', import.meta.url), 'utf8');
const validAuthUrl = 'https://discord.com/oauth2/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fbackend.example%2Fcallback&response_type=code&scope=identify&state=state123';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

class HeadersMock {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  }
  get(key) { return this.values.has(String(key).toLowerCase()) ? this.values.get(String(key).toLowerCase()) : null; }
}

function makeResponse({ ok = false, status = 400, body, headers = {}, jsonThrows = false }) {
  return {
    ok,
    status,
    headers: new HeadersMock(headers),
    async json() {
      if (jsonThrows) throw new Error('invalid json');
      return body;
    },
  };
}

function loadModule({ fetchImpl, randomImpl } = {}) {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();
  let randomCalls = 0;
  const context = {
    window: { location: { origin: 'https://setfeed.app' } },
    sessionStorage,
    localStorage,
    URL,
    URLSearchParams,
    TextEncoder,
    Date,
    btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
    crypto: {
      getRandomValues(bytes) {
        randomCalls += 1;
        if (randomImpl) return randomImpl(bytes);
        bytes.fill(7);
        return bytes;
      },
      subtle: { async digest() { return new Uint8Array(32).fill(9).buffer; } },
    },
    fetch: fetchImpl || (async () => makeResponse({ ok: true, status: 200, body: { authorizationUrl: validAuthUrl } })),
  };
  context.window.window = context.window;
  context.window.sessionStorage = sessionStorage;
  context.window.localStorage = localStorage;
  context.window.URL = URL;
  context.window.URLSearchParams = URLSearchParams;
  context.window.crypto = context.crypto;
  context.window.fetch = context.fetch;
  vm.runInNewContext(source, context, { filename: 'assets/discord-auth.js' });
  return { api: context.window.SetfeedDiscordAuth, sessionStorage, context, get randomCalls() { return randomCalls; } };
}

async function rejectsWithCode(promise, code, extra) {
  let error;
  try { await promise; } catch (caught) { error = caught; }
  assert.ok(error, `expected rejection ${code}`);
  assert.equal(error.code, code);
  if (extra) extra(error);
  return error;
}

function seedExchangeState(api, sessionStorage, destination = '/inbox.html#hidden', intent = 'continue') {
  sessionStorage.setItem(api._test.VERIFIER_KEY, 'A'.repeat(43));
  sessionStorage.setItem(api._test.STARTED_KEY, String(Date.now()));
  sessionStorage.setItem(api._test.DESTINATION_KEY, destination);
  if (intent !== undefined) sessionStorage.setItem(api._test.INTENT_KEY, intent);
}

function oauthStateValues(api, sessionStorage) {
  return [
    api._test.VERIFIER_KEY,
    api._test.STARTED_KEY,
    api._test.DESTINATION_KEY,
    api._test.INTENT_KEY,
    api._test.IN_FLIGHT_KEY,
  ].map((key) => sessionStorage.getItem(key));
}

async function testStartNestedErrors() {
  for (const [code, retryAfter, expectedRetry] of [
    ['invalid_firebase_token', null, null],
    ['rate_limited', '42', 42],
  ]) {
    let calls = 0;
    const { api } = loadModule({
      fetchImpl: async () => {
        calls += 1;
        return makeResponse({
          status: 401,
          body: { error: { code, message: 'RAW BACKEND MESSAGE' } },
          headers: retryAfter ? { 'Retry-After': retryAfter } : {},
        });
      },
    });
    await rejectsWithCode(api.startDiscordSignIn({ destination: './send.html' }), code, (error) => assert.equal(error.retryAfter, expectedRetry));
    assert.equal(calls, 1);
    const mapped = api.mapError(code, expectedRetry);
    assert.notEqual(mapped.message, 'RAW BACKEND MESSAGE');
  }
}

async function testStartFallbacksAndTokenFailure() {
  let calls = 0;
  let loaded = loadModule({ fetchImpl: async () => { calls += 1; return makeResponse({ status: 500, body: { nope: true } }); } });
  await rejectsWithCode(loaded.api.startDiscordSignIn({ destination: './send.html' }), 'backend_unavailable');
  assert.equal(calls, 1);

  loaded = loadModule({ fetchImpl: async () => makeResponse({ status: 400, body: { error: { message: 'safe but not a code' } } }) });
  await rejectsWithCode(loaded.api.startDiscordSignIn({ destination: './send.html' }), 'internal_error');

  loaded = loadModule({ fetchImpl: async () => { throw new Error('fetch must not run'); } });
  await rejectsWithCode(
    loaded.api.startDiscordSignIn({ auth: { currentUser: { async getIdToken() { throw new Error('firebase raw'); } } }, destination: './send.html' }),
    'firebase_user_unavailable',
  );
}

async function testExchangeNestedErrors() {
  for (const code of ['firebase_account_mismatch', 'invalid_or_expired_result', 'rate_limited']) {
    let calls = 0;
    const { api, sessionStorage } = loadModule({
      fetchImpl: async () => {
        calls += 1;
        return makeResponse({
          status: 409,
          body: { error: { code, message: 'DO NOT RENDER' } },
          headers: code === 'rate_limited' ? { 'Retry-After': '7' } : {},
        });
      },
    });
    seedExchangeState(api, sessionStorage);
    await rejectsWithCode(api.exchangeDiscordResult({ resultCode: 'R'.repeat(32) }), code, (error) => {
      if (code === 'rate_limited') assert.equal(error.retryAfter, 7);
    });
    assert.equal(calls, 1);
    assert.notEqual(api.mapError(code, 7).message, 'DO NOT RENDER');
  }
}

async function testExchangeMalformedNetworkAndNoRetry() {
  let calls = 0;
  let loaded = loadModule({ fetchImpl: async () => { calls += 1; return makeResponse({ status: 400, jsonThrows: true }); } });
  seedExchangeState(loaded.api, loaded.sessionStorage);
  await rejectsWithCode(loaded.api.exchangeDiscordResult({ resultCode: 'R'.repeat(32) }), 'internal_error');
  assert.equal(calls, 1);

  calls = 0;
  loaded = loadModule({ fetchImpl: async () => { calls += 1; throw new Error('network ambiguity'); } });
  seedExchangeState(loaded.api, loaded.sessionStorage);
  await rejectsWithCode(loaded.api.exchangeDiscordResult({ resultCode: 'R'.repeat(32) }), 'ambiguous_exchange_outcome');
  assert.equal(calls, 1, 'exchange must not retry automatically');
  assert.equal(loaded.sessionStorage.getItem(loaded.api._test.IN_FLIGHT_KEY), null, 'network ambiguity clears in-flight marker');

  loaded = loadModule({ fetchImpl: async () => { throw new Error('fetch must not run'); } });
  seedExchangeState(loaded.api, loaded.sessionStorage);
  await rejectsWithCode(
    loaded.api.exchangeDiscordResult({ auth: { currentUser: { async getIdToken() { throw new Error('firebase raw'); } } }, resultCode: 'R'.repeat(32) }),
    'firebase_user_unavailable',
  );
  assert.equal(loaded.sessionStorage.getItem(loaded.api._test.IN_FLIGHT_KEY), null, 'token failure clears in-flight marker');
}

async function testSuccessAndUrlValidation() {
  const { api } = loadModule({ fetchImpl: async () => makeResponse({ ok: true, status: 200, body: { authorizationUrl: validAuthUrl } }) });
  const assigned = await api.startDiscordSignIn({ destination: './send.html' });
  assert.equal(assigned, validAuthUrl, 'valid returned URL is not modified');
  assert.equal(
    api.validateAuthorizationUrl('https://discord.com:444/oauth2/authorize?client_id=abc&redirect_uri=x&response_type=code&scope=identify&state=s'),
    false,
    'non-empty port is rejected',
  );
}

async function testIntentValidationAndEarlyRejection() {
  for (const intent of [undefined, 'continue', 'create_account']) {
    const loaded = loadModule();
    const args = intent === undefined ? { destination: '/inbox.html' } : { destination: '/inbox.html', intent };
    assert.equal(await loaded.api.startDiscordSignIn(args), validAuthUrl);
  }

  for (const intent of [null, '', ' ', 'Continue', 1, true, {}]) {
    let fetchCalls = 0;
    let tokenCalls = 0;
    const loaded = loadModule({ fetchImpl: async () => { fetchCalls += 1; return makeResponse({ ok: true, status: 200, body: { authorizationUrl: validAuthUrl } }); } });
    await rejectsWithCode(
      loaded.api.startDiscordSignIn({
        auth: { currentUser: { async getIdToken() { tokenCalls += 1; return 'token'; } } },
        destination: '/inbox.html',
        intent,
      }),
      'invalid_intent',
    );
    assert.equal(loaded.randomCalls, 0, 'invalid intent rejects before random generation');
    assert.equal(fetchCalls, 0, 'invalid intent does not fetch');
    assert.equal(tokenCalls, 0, 'invalid intent does not request ID token');
    assert.deepEqual(oauthStateValues(loaded.api, loaded.sessionStorage), [null, null, null, null, null]);
  }
}

async function testSignedInCreationRejectionWaitsForInitialAuth() {
  const loaded = loadModule({ fetchImpl: async () => { throw new Error('fetch must not run'); } });
  loaded.sessionStorage.setItem('unrelated', 'keep');
  let tokenCalls = 0;
  let unsubscribeCalls = 0;
  const auth = {
    currentUser: null,
    onAuthStateChanged(callback) {
      callback({ uid: 'persisted' });
      return () => { unsubscribeCalls += 1; };
    },
    currentUserForTest: { async getIdToken() { tokenCalls += 1; return 'token'; } },
  };
  await rejectsWithCode(loaded.api.startDiscordSignIn({ auth, destination: '/inbox.html', intent: 'create_account' }), 'already_signed_in');
  assert.equal(loaded.randomCalls, 0);
  assert.equal(tokenCalls, 0);
  assert.equal(unsubscribeCalls, 1);
  assert.equal(loaded.sessionStorage.getItem('unrelated'), 'keep');
  assert.deepEqual(oauthStateValues(loaded.api, loaded.sessionStorage), [null, null, null, null, null]);
}

async function testAuthStateReadyFailureIsSafe() {
  const loaded = loadModule({ fetchImpl: async () => { throw new Error('fetch must not run'); } });
  await rejectsWithCode(
    loaded.api.startDiscordSignIn({ auth: { async authStateReady() { throw new Error('boom'); }, currentUser: null }, destination: '/inbox.html', intent: 'create_account' }),
    'firebase_user_unavailable',
  );
  assert.equal(loaded.randomCalls, 0);
}

async function testRequestBodiesAndStoredIntent() {
  let calls = [];
  let loaded = loadModule({ fetchImpl: async (_url, init) => { calls.push(init); return makeResponse({ ok: true, status: 200, body: { authorizationUrl: validAuthUrl } }); } });
  await loaded.api.startDiscordSignIn({ destination: '/send.html', intent: 'continue' });
  let body = JSON.parse(calls[0].body);
  assert.deepEqual(Object.keys(body), ['codeChallenge']);
  assert.ok(!('intent' in body));
  assert.equal(loaded.sessionStorage.getItem(loaded.api._test.INTENT_KEY), 'continue');
  loaded.api.clearState();
  assert.equal(loaded.sessionStorage.getItem(loaded.api._test.INTENT_KEY), null);

  calls = [];
  loaded = loadModule({ fetchImpl: async (_url, init) => { calls.push(init); return makeResponse({ ok: true, status: 200, body: { authorizationUrl: validAuthUrl } }); } });
  await loaded.api.startDiscordSignIn({ destination: '/send.html', intent: 'create_account' });
  body = JSON.parse(calls[0].body);
  assert.deepEqual(Object.keys(body), ['codeChallenge', 'intent']);
  assert.equal(body.intent, 'create_account');
  assert.equal(loaded.sessionStorage.getItem(loaded.api._test.INTENT_KEY), 'create_account');
}

async function testStoredIntentValidation() {
  const { api, sessionStorage } = loadModule();
  seedExchangeState(api, sessionStorage, '/inbox.html', undefined);
  assert.equal(api.validateStoredState().intent, 'continue');

  seedExchangeState(api, sessionStorage, '/inbox.html', 'continue');
  assert.equal(api.validateStoredState().intent, 'continue');

  seedExchangeState(api, sessionStorage, '/inbox.html', 'create_account');
  assert.equal(api.validateStoredState().intent, 'create_account');

  seedExchangeState(api, sessionStorage, '/inbox.html', '');
  const malformed = api.validateStoredState();
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, 'malformed_intent');
  assert.deepEqual(oauthStateValues(api, sessionStorage), [null, null, null, null, null]);
}

async function testExchangeReturnsValidatedIntent() {
  const loaded = loadModule({ fetchImpl: async () => makeResponse({ ok: true, status: 200, body: { firebaseCustomToken: 'custom-token', intent: 'do_not_trust' } }) });
  seedExchangeState(loaded.api, loaded.sessionStorage, '/send.html#signin', 'create_account');
  const exchanged = await loaded.api.exchangeDiscordResult({ resultCode: 'R'.repeat(32) });
  assert.equal(exchanged.firebaseCustomToken, 'custom-token');
  assert.equal(exchanged.destination, '/send.html#signin');
  assert.equal(exchanged.intent, 'create_account');
}

await testStartNestedErrors();
await testStartFallbacksAndTokenFailure();
await testExchangeNestedErrors();
await testExchangeMalformedNetworkAndNoRetry();
await testSuccessAndUrlValidation();
await testIntentValidationAndEarlyRejection();
await testSignedInCreationRejectionWaitsForInitialAuth();
await testAuthStateReadyFailureIsSafe();
await testRequestBodiesAndStoredIntent();
await testStoredIntentValidation();
await testExchangeReturnsValidatedIntent();

console.log('discord-auth behavior checks passed');
