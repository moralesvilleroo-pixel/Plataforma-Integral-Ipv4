import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['.git', 'node_modules', 'tests', '.github']);
function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out); else out.push(p);
  }
  return out;
}
const text = files(root).filter((p) => /\.(js|ts|html|json|toml|md|sql|webmanifest)$|_headers$/.test(p));
const js = text.filter((p) => p.includes('/js/') && p.endsWith('.js'));

test('no hay claves secretas en el repositorio', () => {
  const secrets = [/sb_secret_[A-Za-z0-9_-]{10,}/, /service_role["']?\s*[:=]\s*["']ey/, /AIza[0-9A-Za-z_-]{35}/, /sk-ant-[A-Za-z0-9_-]{20,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/];
  for (const p of text) {
    const src = readFileSync(p, 'utf8');
    for (const re of secrets) assert.ok(!re.test(src), `posible secreto en ${p.replace(root, '')}`);
  }
});

test('el código del navegador no inserta HTML sin sanitizar', () => {
  for (const p of js) {
    const src = readFileSync(p, 'utf8');
    assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\(|\beval\(|new Function\(/.test(src), `uso peligroso en ${p.replace(root, '')}`);
  }
});

test('la CSP es la misma en Netlify y en Vercel', () => {
  const netlify = readFileSync(join(root, '_headers'), 'utf8').match(/Content-Security-Policy:\s*(.+)/)[1].trim();
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')).headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
  assert.equal(vercel, netlify);
  assert.match(netlify, /script-src 'self'(;|$)/, 'sin scripts en línea ni de terceros');
  assert.match(netlify, /frame-ancestors 'none'/);
});

test('el inicio de sesión usa PKCE y no acepta tokens desde la URL', () => {
  const supa = readFileSync(join(root, 'js/supa.js'), 'utf8');
  assert.match(supa, /code_challenge_method/);
  assert.match(supa, /grant_type=pkce/);
  assert.ok(!/setSession\(\{\s*access_token:\s*p\.get/.test(supa), 'no debe crear sesiones con tokens leídos de la URL');
});

test('la clave pública configurada es la publicable, no la secreta', () => {
  const cfg = readFileSync(join(root, 'js/config.js'), 'utf8');
  assert.match(cfg, /sb_publishable_/);
});
