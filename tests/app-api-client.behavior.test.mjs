import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/assets/api.js', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('../app/assets/shell.js', import.meta.url), 'utf8');
const appCssSource = readFileSync(new URL('../app/assets/app.css', import.meta.url), 'utf8');

class HeadersMock {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  }
  get(key) { return this.values.get(String(key).toLowerCase()) ?? null; }
}

function response(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new HeadersMock(headers),
    async text() {
      return body === null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

function load(fetchImpl, timeoutMs = 50) {
  let generation = 1;
  let accountController = new AbortController();
  const tokens = [];
  let user = {
    uid: 'u1',
    isAnonymous: false,
    async getIdToken(force) {
      tokens.push(Boolean(force));
      return force ? 'fresh' : 'old';
    },
  };
  const context = { window: {}, fetch: fetchImpl, AbortController, setTimeout, clearTimeout, Date, JSON, Error };
  context.window.window = context.window;
  context.window.fetch = fetchImpl;
  vm.runInNewContext(source, context, { filename: 'app/assets/api.js' });
  const client = new context.window.SetfeedJsonApiClient({
    baseUrl: 'https://api.example',
    fetchImpl,
    timeoutMs,
    getUser: () => user,
    getGeneration: () => generation,
    getAccountSignal: () => accountController.signal,
  });
  return {
    client,
    tokens,
    switchUser() {
      generation += 1;
      accountController.abort();
      accountController = new AbortController();
      user = { uid: 'u2', isAnonymous: false, async getIdToken() { return 'new'; } };
    },
  };
}

{
  let calls = 0;
  const loaded = load(async (_url, init) => {
    calls += 1;
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, calls === 1 ? 'Bearer old' : 'Bearer fresh');
    return calls === 1
      ? response(401, { error: { code: 'invalid_firebase_token', message: 'expired' } })
      : response(200, { ok: true });
  });
  assert.deepEqual(await loaded.client.get('/v1/test'), { ok: true });
  assert.deepEqual(loaded.tokens, [false, true]);
  assert.equal(calls, 2);
}

{
  const loaded = load(async () => response(429, { error: { code: 'rate_limited', message: 'Slow down' } }, { 'Retry-After': '7' }));
  await assert.rejects(loaded.client.get('/v1/test'), (error) => error.code === 'rate_limited' && error.retryAfterSeconds === 7 && error.status === 429);
}

{
  const loaded = load(async () => response(200, 'not-json'));
  await assert.rejects(loaded.client.get('/v1/test'), (error) => error.code === 'malformed_backend_response');
}

{
  const loaded = load((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  }), 10);
  await assert.rejects(loaded.client.get('/v1/test'), (error) => error.code === 'network_timeout');
}

{
  let resolveFetch;
  const loaded = load(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const pending = loaded.client.get('/v1/test');
  while (!resolveFetch) await Promise.resolve();
  loaded.switchUser();
  resolveFetch(response(200, { secret: 'old' }));
  await assert.rejects(pending, (error) => error.code === 'account_changed');
}

{
  const loaded = load(async (_url, init) => {
    assert.equal(init.method, 'DELETE');
    return response(204, null);
  });
  assert.equal(await loaded.client.delete('/v1/test'), null);
}

{
  const requiredReceiver = {
    calls: 0,
    async fetch(_url, init) {
      assert.equal(this, requiredReceiver);
      this.calls += 1;
      assert.equal(init.headers.Authorization, 'Bearer token');
      return response(200, { profile: { username: 'bound-user' } });
    },
  };
  const windowObject = {
    window: null,
    fetch: requiredReceiver.fetch,
  };
  windowObject.window = windowObject;
  const context = {
    window: windowObject,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Error,
  };
  vm.runInNewContext(source, context, { filename: 'app/assets/api.js' });
  const client = new windowObject.SetfeedJsonApiClient({
    baseUrl: 'https://api.example',
    getUser: () => ({ uid: 'u1', isAnonymous: false, async getIdToken() { return 'token'; } }),
  });
  await assert.rejects(client.get('/v1/profile'), (error) => error.code === 'backend_unavailable');

  windowObject.fetch = requiredReceiver.fetch.bind(requiredReceiver);
  const fixedClient = new windowObject.SetfeedJsonApiClient({
    baseUrl: 'https://api.example',
    getUser: () => ({ uid: 'u1', isAnonymous: false, async getIdToken() { return 'token'; } }),
  });
  assert.equal((await fixedClient.get('/v1/profile')).profile.username, 'bound-user');
  assert.equal(requiredReceiver.calls, 1);
}

assert.ok(shellSource.includes('window.fetch = window.fetch.bind(window)'));
assert.ok(shellSource.includes('document.body.classList.add("app-shell-ready")'));
assert.ok(shellSource.includes('Account error: ${text}'));
assert.match(appCssSource, /body:not\(\.app-shell-ready\)>#app-page-content\{visibility:hidden\}/);

await assert.rejects(load(async () => response(200, {})).client.get('https://evil.example'), (error) => error.code === 'invalid_request');

console.log('app api client checks passed');