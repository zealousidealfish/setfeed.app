import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../discord-oauth-complete.html', import.meta.url), 'utf8');
const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
const completionScript = inlineScripts.at(-1);
const oldResultCode = 'R'.repeat(32);

class ClassListMock {
  constructor() { this.values = new Set(['hidden']); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class ElementMock {
  constructor(id) {
    this.id = id;
    this.textContent = '';
    this.disabled = false;
    this.attrs = {};
    this.classList = new ClassListMock();
    this.listeners = new Map();
  }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  click() { return this.listeners.get('click')?.({ preventDefault() {} }); }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function runCompletion({
  hash = `#discord_result=${oldResultCode}`,
  state = { ok: true, destination: '/inbox.html', intent: 'continue' },
  exchange,
  signIn,
  currentUser = null,
  waitForInitialAuthState,
  start,
} = {}) {
  const elements = Object.fromEntries(
    ['title', 'message', 'restart', 'create-account', 'continue-discord'].map((id) => [id, new ElementMock(id)]),
  );
  const calls = [];
  const auth = {
    currentUser,
    signOut() { calls.push(['signOut']); },
    signInWithCustomToken: signIn || (async (token) => { calls.push(['signIn', token]); }),
  };
  const api = {
    DEFAULT_DESTINATION: '/inbox.html',
    parseResultFragment(value) {
      calls.push(['parse', value]);
      if (!value) return { ok: false, code: 'missing_result' };
      const params = new URLSearchParams(value.slice(1));
      if (params.has('discord_error')) return { ok: false, code: params.get('discord_error') };
      return { ok: true, resultCode: params.get('discord_result') };
    },
    validateStoredState() { calls.push(['validate']); return state; },
    clearState() { calls.push(['clear']); },
    waitForInitialAuthState: waitForInitialAuthState || (async () => { calls.push(['waitForInitialAuthState']); return auth.currentUser || null; }),
    exchangeDiscordResult: exchange || (async ({ resultCode }) => {
      calls.push(['exchange', resultCode]);
      return { firebaseCustomToken: 'token', destination: '/inbox.html', intent: 'continue' };
    }),
    startDiscordSignIn: start || (async (options) => {
      calls.push(['start', options]);
      return 'https://discord.com/oauth2/authorize?ok=1';
    }),
    mapError(code) {
      const pairs = {
        discord_not_linked: ['Discord account not linked', 'not linked'],
        discord_already_linked: ['Use Continue with Discord', 'already linked'],
        active_session_changed: ['Another Setfeed session is active', 'race'],
        firebase_custom_token_sign_in_failed: ['Setfeed sign-in failed', 'failed'],
        malformed_intent: ['Restart required', 'bad intent'],
      };
      const pair = pairs[code] || ['Service unavailable', 'generic'];
      return { title: pair[0], message: pair[1], code: pairs[code] ? code : 'internal_error' };
    },
  };
  const location = {
    hash,
    pathname: '/discord-oauth-complete.html',
    search: '?discord_result=query_must_be_ignored',
    assigned: null,
    assign(value) { calls.push(['assign', value]); this.assigned = value; },
  };
  const context = {
    window: { sfAuth: auth, SetfeedDiscordAuth: api, location },
    document: { getElementById: (id) => elements[id] },
    history: {
      replaceState(...args) {
        calls.push(['replaceState', location.hash, ...args]);
        location.hash = '';
      },
    },
    URLSearchParams,
    console,
  };
  context.window.window = context.window;
  vm.runInNewContext(completionScript, context, { filename: 'discord-oauth-complete inline script' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, calls, location, auth };
}

function latestStartOptions(calls) {
  return calls.filter((call) => call[0] === 'start').at(-1)?.[1];
}


function extractBlock(fileName, startNeedle, endNeedle) {
  const page = readFileSync(new URL(`../${fileName}`, import.meta.url), 'utf8');
  const start = page.indexOf(startNeedle);
  const end = page.indexOf(endNeedle, start);
  assert.notEqual(start, -1, `${fileName} start block exists`);
  assert.notEqual(end, -1, `${fileName} end block exists`);
  return page.slice(start, end);
}

async function exercisePageDiscordButtons({ fileName, block, statusName = 'setStatus' }) {
  const pending = deferred();
  const calls = [];
  const btnDiscord = new ElementMock('btn-discord');
  btnDiscord.classList.remove('hidden');
  const btnDiscordCreate = new ElementMock('btn-discord-create');
  btnDiscordCreate.classList.remove('hidden');
  const context = {
    btnDiscord,
    btnDiscordCreate,
    auth: {},
    window: {
      location: {
        hash: '#hidden',
        assigned: null,
        assign(value) { calls.push(['assign', value]); this.assigned = value; },
      },
      SetfeedDiscordAuth: {
        startDiscordSignIn(options) { calls.push(['start', options]); return pending.promise; },
        mapError(code) { return { title: code || 'error', message: 'mapped' }; },
      },
    },
    getDiscordDestination() { return '/inbox.html'; },
    clearPendingDestination() { calls.push(['clearPendingDestination']); },
    [statusName](...args) { calls.push(['status', ...args]); },
  };
  context.window.window = context.window;
  vm.runInNewContext(block, context, { filename: `${fileName} discord button block` });
  const firstClick = btnDiscord.click();
  await btnDiscordCreate.click();
  assert.equal(calls.filter((call) => call[0] === 'start').length, 1, `${fileName} continue then create starts once`);
  assert.equal(btnDiscord.disabled, true);
  assert.equal(btnDiscordCreate.disabled, true);
  pending.reject({ code: 'network_failure' });
  await firstClick;
  assert.equal(btnDiscord.disabled, false, `${fileName} restores continue after failure`);
  assert.equal(btnDiscordCreate.disabled, false, `${fileName} restores create after failure`);

  const pendingSecond = deferred();
  calls.length = 0;
  context.window.SetfeedDiscordAuth.startDiscordSignIn = (options) => { calls.push(['start', options]); return pendingSecond.promise; };
  const createClick = btnDiscordCreate.click();
  await btnDiscord.click();
  assert.equal(calls.filter((call) => call[0] === 'start').length, 1, `${fileName} create then continue starts once`);
  pendingSecond.reject({ code: 'network_failure' });
  await createClick;
}

async function testPageDiscordButtonConcurrency() {
  await exercisePageDiscordButtons({
    fileName: 'index.html',
    statusName: 'setAuthStatus',
    block: extractBlock('index.html', 'function setDiscordButtonsDisabled', '    if (btnGoogle) {'),
  });
  await exercisePageDiscordButtons({
    fileName: 'send.html',
    block: extractBlock('send.html', 'function setDiscordButtonsDisabled', '    btnGoogle.addEventListener'),
  });
  await exercisePageDiscordButtons({
    fileName: 'inbox.html',
    block: extractBlock('inbox.html', 'function setDiscordButtonsDisabled', '    btnGoogle.addEventListener'),
  });
}

async function testOrderingAndParsing() {
  const result = await runCompletion();
  assert.ok(result.calls.findIndex((call) => call[0] === 'replaceState') < result.calls.findIndex((call) => call[0] === 'exchange'));
  assert.equal(result.calls.find((call) => call[0] === 'parse')[1], `#discord_result=${oldResultCode}`);
}

async function testInvalidStoredStatePreventsExchange() {
  const result = await runCompletion({ state: { ok: false, code: 'malformed_intent' } });
  assert.equal(result.calls.some((call) => call[0] === 'exchange'), false);
  assert.equal(result.elements.restart.classList.contains('hidden'), false);
}

async function testDiscordNotLinkedRecovery() {
  const result = await runCompletion({
    state: { ok: true, destination: '/send.html#signin', intent: 'continue' },
    exchange: async () => { throw { code: 'discord_not_linked' }; },
  });
  assert.equal(result.calls.some((call) => call[0] === 'start'), false);
  assert.equal(result.elements.restart.classList.contains('hidden'), false);
  assert.equal(result.elements['create-account'].classList.contains('hidden'), false);
  assert.equal(result.elements['continue-discord'].classList.contains('hidden'), true);
  assert.equal(result.elements.restart.textContent, 'Try Continue with Discord again');

  await result.elements['create-account'].click();
  const options = latestStartOptions(result.calls);
  assert.equal(options.auth, result.auth);
  assert.equal(options.destination, '/send.html#signin');
  assert.equal(options.intent, 'create_account');
  assert.equal(JSON.stringify(result.calls.filter((call) => call[0] === 'start')).includes(oldResultCode), false);
}

async function testDiscordAlreadyLinkedRecovery() {
  const result = await runCompletion({ exchange: async () => { throw { code: 'discord_already_linked' }; } });
  assert.equal(result.elements['continue-discord'].classList.contains('hidden'), false);
  assert.equal(result.elements.restart.classList.contains('hidden'), true);
  assert.equal(result.elements['create-account'].classList.contains('hidden'), true);

  await result.elements['continue-discord'].click();
  assert.equal(latestStartOptions(result.calls).intent, 'continue');
}

async function testGenericRestartPreservesIntent() {
  let result = await runCompletion({
    state: { ok: true, destination: '/inbox.html#hidden', intent: 'create_account' },
    exchange: async () => { throw { code: 'backend_unavailable' }; },
  });
  assert.equal(result.elements.restart.textContent, 'Try account creation again');
  await result.elements.restart.click();
  assert.equal(latestStartOptions(result.calls).intent, 'create_account');
  assert.equal(latestStartOptions(result.calls).destination, '/inbox.html#hidden');

  result = await runCompletion({
    state: { ok: true, destination: '/inbox.html', intent: 'continue' },
    exchange: async () => { throw { code: 'backend_unavailable' }; },
  });
  assert.equal(result.elements.restart.textContent, 'Try Continue with Discord again');
  await result.elements.restart.click();
  assert.equal(latestStartOptions(result.calls).intent, 'continue');
  assert.equal(latestStartOptions(result.calls).destination, '/inbox.html');
}

async function testSuccessMessagesAndNavigation() {
  let result = await runCompletion({
    exchange: async () => ({ firebaseCustomToken: 'continue-token', destination: '/inbox.html', intent: 'continue' }),
  });
  assert.equal(result.elements.title.textContent, 'Signed in');
  assert.deepEqual(result.calls.filter((call) => call[0] === 'signIn'), [['signIn', 'continue-token']]);
  assert.ok(result.calls.findIndex((call) => call[0] === 'clear') < result.calls.findIndex((call) => call[0] === 'assign'));
  assert.equal(result.location.assigned, '/inbox.html');

  result = await runCompletion({
    exchange: async () => ({ firebaseCustomToken: 'create-token', destination: '/send.html', intent: 'create_account' }),
  });
  assert.equal(result.elements.title.textContent, 'Setfeed account created');
  assert.deepEqual(result.calls.filter((call) => call[0] === 'signIn'), [['signIn', 'create-token']]);
  assert.equal(result.location.assigned, '/send.html');
}

async function testFailureAndSessionRaceSafety() {
  let result = await runCompletion({ signIn: async () => { throw new Error('sign-in failed'); } });
  assert.equal(result.location.assigned, null);
  assert.equal(result.calls.some((call) => call[0] === 'clear'), true);

  result = await runCompletion({
    state: { ok: true, destination: '/send.html', intent: 'create_account' },
    waitForInitialAuthState: async () => ({ uid: 'persisted' }),
  });
  assert.equal(result.calls.some((call) => call[0] === 'exchange'), false);
  assert.equal(result.calls.some((call) => call[0] === 'signIn'), false);
  assert.equal(result.calls.some((call) => call[0] === 'signOut'), false);
  assert.equal(result.location.assigned, null);
  assert.equal(result.elements.title.textContent, 'Another Setfeed session is active');

  result = await runCompletion({
    currentUser: { uid: 'active-now' },
    exchange: async () => ({ firebaseCustomToken: 'token', destination: '/send.html', intent: 'create_account' }),
  });
  assert.equal(result.calls.some((call) => call[0] === 'signIn'), false);
  assert.equal(result.calls.some((call) => call[0] === 'signOut'), false);
  assert.equal(result.location.assigned, null);
  assert.equal(result.elements.title.textContent, 'Another Setfeed session is active');
}

async function testRecoveryButtonConcurrencyAndFailureRendering() {
  const pendingStart = deferred();
  const result = await runCompletion({
    exchange: async () => { throw { code: 'discord_not_linked' }; },
    start: (options) => {
      result.calls.push(['start', options]);
      return pendingStart.promise;
    },
  });
  const createClick = result.elements['create-account'].click();
  await result.elements.restart.click();
  assert.equal(result.calls.filter((call) => call[0] === 'start').length, 1);
  assert.equal(result.elements['create-account'].disabled, true);
  assert.equal(result.elements.restart.disabled, true);
  assert.equal(result.elements['create-account'].attrs['aria-busy'], 'true');

  pendingStart.reject({ code: 'discord_already_linked' });
  await createClick;
  assert.equal(result.elements['continue-discord'].classList.contains('hidden'), false);
  assert.equal(result.elements.restart.classList.contains('hidden'), true);
  assert.equal(result.elements['create-account'].classList.contains('hidden'), true);
  assert.equal(result.elements['continue-discord'].disabled, false);
}

await testPageDiscordButtonConcurrency();
await testOrderingAndParsing();
await testInvalidStoredStatePreventsExchange();
await testDiscordNotLinkedRecovery();
await testDiscordAlreadyLinkedRecovery();
await testGenericRestartPreservesIntent();
await testSuccessMessagesAndNavigation();
await testFailureAndSessionRaceSafety();
await testRecoveryButtonConcurrencyAndFailureRendering();

console.log('discord-oauth-complete behavior checks passed');
