import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const pages = ['index.html','send.html','upcoming.html','awaiting.html','inbox.html','feed.html','sent.html','settings.html'];

for (const page of pages) {
  const relativePage = `app/${page}`;
  assert.ok(existsSync(path.join(root, relativePage)), `${relativePage} exists`);
  const html = read(relativePage);
  assert.match(html, /<meta name="viewport"/i, `${relativePage} has a viewport`);
  assert.match(html, /data-app-page=/i, `${relativePage} declares its app page`);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(value)) continue;
    const clean = value.split(/[?#]/, 1)[0];
    const target = path.resolve(root, 'app', clean);
    assert.ok(target.startsWith(root), `${relativePage} reference stays inside repository: ${value}`);
    assert.ok(existsSync(target), `${relativePage} local reference exists: ${value}`);
  }
}

const config = read('app/assets/config.js');
for (const page of pages) assert.ok(config.includes(`./${page}`), `config exposes ${page}`);
const open = read('open-setfeed.html');
assert.ok(open.includes('location.replace("./app/")'), 'desktop entry targets the app directory');
assert.equal(read('CNAME').trim(), 'setfeed.app', 'custom domain remains setfeed.app');
assert.equal(existsSync(path.join(root, 'firebase.json')), false, 'repository does not claim Firebase Hosting configuration');
assert.equal(existsSync(path.join(root, 'vercel.json')), false, 'repository does not claim Vercel configuration');
assert.equal(existsSync(path.join(root, 'netlify.toml')), false, 'repository does not claim Netlify configuration');
console.log('app static deployment integrity checks passed');
