import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { loadState, saveState, gradeCard, dueIds, dayNum } = await import('../js/lib.js');
const { mergeProgress } = await import('../js/sync.js');

test('el progreso corrupto o malicioso se limpia al cargar', () => {
  localStorage.setItem('subnetpro:v1', JSON.stringify({
    units: { u1: { best: 999, attempts: -3, mastered: 'si' } },
    cards: { q1: { box: 40, due: 'x', log: 'no' } },
    practice: { level: 99 },
    days: ['2026-11-01', '<script>'],
    drills: { types: { '__proto__': { ok: 1 }, ok1: { ok: 2, fail: 1 } } },
  }));
  const s = loadState();
  assert.deepEqual(s.units.u1, { best: 100, attempts: 0, mastered: false });
  assert.equal(s.cards.q1.box, 5);
  assert.deepEqual(s.cards.q1.log, []);
  assert.equal(s.practice.level, 4);
  assert.deepEqual(s.days, ['2026-11-01']);
  assert.deepEqual(Object.keys(s.drills.types), ['ok1']);
  localStorage.setItem('subnetpro:v1', '{roto');
  assert.deepEqual(loadState().units, {});
});

test('repaso espaciado (Leitner): sube con aciertos y vuelve a la caja 1 con fallos', () => {
  const s = loadState();
  gradeCard(s, 'q', true);
  assert.equal(s.cards.q.box, 2);
  gradeCard(s, 'q', true);
  assert.equal(s.cards.q.box, 3);
  assert.equal(s.cards.q.due, dayNum() + 4, 'la caja 3 vuelve en 4 días');
  gradeCard(s, 'q', false);
  assert.equal(s.cards.q.box, 1);
  assert.equal(s.cards.q.due, dayNum() + 1, 'la fallada vuelve mañana');
  assert.deepEqual(dueIds(s, new Set(['q'])), [], 'hoy todavía no toca');
  s.cards.q.due = dayNum();
  assert.deepEqual(dueIds(s, new Set(['q'])), ['q']);
  assert.deepEqual(dueIds(s, new Set()), [], 'ignora preguntas que ya no existen');
  saveState(s);
});

test('unir progresos conserva lo mejor de cada lado', () => {
  const a = { units: { u1: { best: 60, attempts: 2 } }, cards: { q: { box: 2, due: 1, log: [[100, 1]] } }, practice: { level: 2 }, days: ['2026-11-02'], drills: { best: 5, types: { x: { ok: 1, fail: 4 } } } };
  const b = { units: { u1: { best: 90, attempts: 1, mastered: true } }, cards: { q: { box: 4, due: 9, log: [[200, 1]] } }, practice: { level: 3, streak: 1 }, days: ['2026-11-01'], drills: { best: 3, types: { x: { ok: 6, fail: 0 } } } };
  const m = mergeProgress(a, b);
  assert.deepEqual(m.units.u1, { best: 90, attempts: 2, mastered: true });
  assert.equal(m.cards.q.box, 4, 'gana la respuesta más reciente');
  assert.equal(m.practice.level, 3);
  assert.deepEqual(m.days, ['2026-11-01', '2026-11-02']);
  assert.deepEqual(m.drills.types.x, { ok: 6, fail: 4 });
});
