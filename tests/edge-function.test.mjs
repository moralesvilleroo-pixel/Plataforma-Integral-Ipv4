// Revisa que la Edge Function no tenga errores de sintaxis antes de pegarla en Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

let ts = null;
try { ts = createRequire(import.meta.url)('typescript'); } catch { /* sin TypeScript instalado se omite */ }

test('la Edge Function chat-redes compila sin errores de sintaxis', { skip: ts ? false : 'instala typescript para esta prueba' }, () => {
  const src = readFileSync(new URL('../supabase/functions/chat-redes/index.ts', import.meta.url), 'utf8');
  const out = ts.transpileModule(src, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const errs = (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  assert.deepEqual(errs, []);
});
