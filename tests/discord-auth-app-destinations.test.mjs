import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TextEncoder } from 'node:util';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/discord-auth.js', import.meta.url), 'utf8');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const sessionStorage = new MemoryStorage();
const context = {
  window: { location: { origin: 'https://setfeed.app' } },
  sessionStorage,
  URL,
  URLSearchParams,
  TextEncoder,
  Date,
  btoa(value) { return Buffer.from(value, 'binary').toString('base64'); },
  crypto: {
    getRandomValues(bytes) { bytes.fill(7); return bytes; },
    subtle: { async digest() { return new Uint8Array(32).buffer; } },
  },
  fetch: async () => { throw new Error('network not expected'); },
};
context.window.window = context.window;
context.window.sessionStorage = sessionStorage;
context.window.URL = URL;
context.window.URLSearchParams = URLSearchParams;
context.window.crypto = context.crypto;
context.window.fetch = context.fetch;

vm.runInNewContext(source, context, { filename: 'assets/discord-auth.js' });
const { sanitizeDestination } = context.window.SetfeedDiscordAuth;

const allowed = [
  '/app/',
  '/app/index.html',
  '/app/send.html',
  '/app/upcoming.html',
  '/app/awaiting.html',
  '/app/inbox.html',
  '/app/sent.html',
  '/app/settings.html',
];

for (const destination of allowed) {
  assert.equal(sanitizeDestination(destination), destination, `${destination} remains an exact safe return path`);
  assert.equal(sanitizeDestination(`https://setfeed.app${destination}`), destination, `${destination} accepts an exact same-origin URL`);
}

for (const unsafe of [
  'https://example.com/app/',
  '//example.com/app/',
  'javascript:alert(1)',
  '/app/send.html?next=https://example.com',
  '/app/send.html#unknown',
  '/app/not-a-page.html',
  '/app/inbox.html?discord_result=secret',
]) {
  assert.equal(sanitizeDestination(unsafe), '/inbox.html', `${unsafe} falls back to the legacy safe default`);
}

console.log('discord-auth app destination checks passed');
