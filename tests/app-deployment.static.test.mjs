import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const pages = [
  'index.html',
  'send.html',
  'upcoming.html',
  'awaiting.html',
  'inbox.html',
  'feed.html',
  'sent.html',
  'settings.html',
];