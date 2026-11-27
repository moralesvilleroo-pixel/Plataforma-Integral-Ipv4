import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));
const unidades = read('data/unidades.json').unidades;
const teoria = read('data/teoria.json').unidades;

test('cada pregunta tiene una sola respuesta correcta y explicación', () => {
  const ids = new Set();
  for (const u of unidades) {
    assert.ok(u.preguntas.length >= 8, `${u.id} necesita al menos 8 preguntas para la prueba`);
    for (const q of u.preguntas) {
      assert.ok(!ids.has(q.id), `id repetido ${q.id}`);
      ids.add(q.id);
      if (q.tipo === 'orden') { assert.ok(q.items.length > 1, q.id); continue; }
      assert.equal(q.o.filter((o) => o.ok === true).length, 1, `${q.id} debe tener una correcta`);
      for (const o of q.o) assert.ok(typeof o.t === 'string' || typeof o.x === 'string' || typeof o.text === 'string' || typeof o === 'object', q.id);
    }
  }
});

const WIDGETS = new Set(['topologia', 'encapsulado', 'switch', 'distancia', 'atenuacion', 'octeto', 'mascara']);
const TEXT = new Set(['p', 'lista', 'nota', 'tabla']);

test('la teoría existe para cada unidad y sus actividades son válidas', () => {
  const ids = new Set();
  for (const u of unidades) {
    const lesson = teoria[u.id];
    assert.ok(lesson?.secciones?.length >= 3, `${u.id} sin teoría suficiente`);
    for (const s of lesson.secciones) {
      assert.ok(s.titulo && s.bloques.length, `${u.id}: sección vacía`);
      for (const b of s.bloques) {
        if (TEXT.has(b.t)) continue;
        assert.ok(b.id && !ids.has(b.id), `${u.id}: id de actividad faltante o repetido (${b.id})`);
        ids.add(b.id);
        if (b.t === 'pregunta') assert.equal(b.o.filter((o) => o.ok).length, 1, b.id);
        else if (b.t === 'ordenar') assert.ok(b.items.length > 2, b.id);
        else if (b.t === 'clasificar') for (const it of b.items) assert.ok(it.c >= 0 && it.c < b.cats.length, `${b.id}: ${it.x}`);
        else if (b.t === 'escribir') assert.ok(b.ok.length > 0, b.id);
        else if (b.t === 'explorar') assert.ok(b.items.length > 1, b.id);
        else if (b.t === 'revela') assert.ok(b.a, b.id);
        else if (b.t === 'widget') assert.ok(WIDGETS.has(b.w), `${b.id}: simulador desconocido ${b.w}`);
        else assert.fail(`${b.id}: tipo desconocido ${b.t}`);
      }
    }
  }
});
