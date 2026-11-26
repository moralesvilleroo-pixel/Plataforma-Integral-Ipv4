// Micro-retos de 60 segundos y examen sin ayudas. Los ejercicios se generan al azar.
import { h, randInt, shuffle, markStudyDay } from './lib.js';
import { cidrToMask, intToIp, ipToInt, maskToCidr, validateIp } from './core/ipv4.js';

const EXAM_KEY = 'subnetpro:exam';
const EXAM_MINUTES = 10;
const EXAM_SIZE = 10;

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');
const randIp = () => `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
const ordinal = ['1.er', '2.º', '3.er', '4.º'];

function netOf(ip, p) { return (ipToInt(ip) & ((0xffffffff << (32 - p)) >>> 0)) >>> 0; }

/** Cada tipo genera { q, answer, check(input), how, choices? }. */
const TYPES = {
  cidr2mask: {
    label: 'Prefijo a máscara',
    make() {
      const p = randInt(8, 30);
      const a = cidrToMask(p);
      return { q: `¿Qué máscara corresponde a /${p}?`, answer: a, hint: 'Ej. 255.255.255.0', mode: 'decimal',
        check: (v) => norm(v) === a,
        how: `/${p} son ${p} bits en 1. En el octeto donde se cortan, suma los pesos 128, 64, 32… hasta completar.` };
    },
  },
  mask2cidr: {
    label: 'Máscara a prefijo',
    make() {
      const p = randInt(8, 30);
      const m = cidrToMask(p);
      return { q: `¿Qué prefijo tiene la máscara ${m}?`, answer: `/${p}`, hint: 'Ej. /24', mode: 'text',
        check: (v) => maskToCidr(v) === p && !String(v).includes('.'),
        how: `Cuenta los bits en 1: cada 255 son 8 bits; el último octeto aporta los bits de su valor.` };
    },
  },
  dec2bin: {
    label: 'Decimal a binario',
    make() {
      const n = randInt(1, 255);
      const a = n.toString(2).padStart(8, '0');
      return { q: `Escribe ${n} en binario (8 bits).`, answer: a, hint: 'Ej. 11000000', mode: 'numeric',
        check: (v) => /^[01]{1,8}$/.test(norm(v)) && parseInt(norm(v), 2) === n,
        how: `Resta pesos de mayor a menor: 128, 64, 32, 16, 8, 4, 2, 1. Pon 1 donde el peso cabe.` };
    },
  },
  bin2dec: {
    label: 'Binario a decimal',
    make() {
      const n = randInt(1, 255);
      const b = n.toString(2).padStart(8, '0');
      return { q: `¿Cuánto vale ${b} en decimal?`, answer: String(n), hint: 'Un número', mode: 'numeric',
        check: (v) => Number(norm(v)) === n && /^\d+$/.test(norm(v)),
        how: `Suma los pesos de los bits en 1: ${b.split('').map((x, i) => (x === '1' ? 2 ** (7 - i) : null)).filter(Boolean).join(' + ')}.` };
    },
  },
  hosts: {
    label: 'Hosts útiles',
    make() {
      const p = randInt(20, 30);
      const a = 2 ** (32 - p) - 2;
      return { q: `¿Cuántos hosts útiles tiene una red /${p}?`, answer: String(a), hint: 'Un número', mode: 'numeric',
        check: (v) => Number(norm(v)) === a,
        how: `Bits de host = 32 - ${p} = ${32 - p}. 2^${32 - p} - 2 = ${a}. Se restan la red y el broadcast.` };
    },
  },
  magic: {
    label: 'Salto (número mágico)',
    make() {
      const p = randInt(17, 30);
      const oct = Math.floor((p - 1) / 8);
      const m = Number(cidrToMask(p).split('.')[oct]);
      const a = 256 - m;
      return { q: `¿Cuál es el salto de la máscara ${cidrToMask(p)}?`, answer: String(a), hint: 'Un número', mode: 'numeric',
        check: (v) => Number(norm(v)) === a,
        how: `El octeto interesante es el ${ordinal[oct]} (${m}). Salto = 256 - ${m} = ${a}.` };
    },
  },
  network: {
    label: 'Dirección de red',
    make() {
      const p = randInt(17, 30);
      const ip = randIp();
      const a = intToIp(netOf(ip, p));
      return { q: `¿Cuál es la dirección de red de ${ip}/${p}?`, answer: a, hint: 'Una IP', mode: 'decimal',
        check: (v) => validateIp(norm(v)) && norm(v) === a,
        how: howRange(ip, p) };
    },
  },
  broadcast: {
    label: 'Broadcast',
    make() {
      const p = randInt(17, 30);
      const ip = randIp();
      const a = intToIp((netOf(ip, p) | (~((0xffffffff << (32 - p)) >>> 0) >>> 0)) >>> 0);
      return { q: `¿Cuál es el broadcast de ${ip}/${p}?`, answer: a, hint: 'Una IP', mode: 'decimal',
        check: (v) => validateIp(norm(v)) && norm(v) === a,
        how: howRange(ip, p) };
    },
  },
  same: {
    label: '¿Misma subred?',
    make() {
      const p = randInt(22, 30);
      const a = randIp();
      const block = 2 ** (32 - p);
      const base = netOf(a, p);
      const same = Math.random() < 0.5;
      const otherInt = same ? base + randInt(1, Math.max(1, block - 2)) : base + block + randInt(1, Math.max(1, block - 2));
      const b = intToIp(otherInt >>> 0);
      const yes = netOf(b, p) === base;
      return { q: `¿${a}/${p} y ${b}/${p} están en la misma subred?`, answer: yes ? 'Sí' : 'No', choices: ['Sí', 'No'],
        check: (v) => (v === 'Sí') === yes,
        how: `Calcula la red de cada una con la máscara ${cidrToMask(p)}: ${intToIp(base)} y ${intToIp(netOf(b, p))}.` };
    },
  },
};

function howRange(ip, p) {
  const oct = Math.floor((p - 1) / 8);
  const m = Number(cidrToMask(p).split('.')[oct]);
  const jump = 256 - m;
  const val = Number(ip.split('.')[oct]);
  const start = Math.floor(val / jump) * jump;
  return `Salto ${jump} en el ${ordinal[oct]} octeto. ${val} cae entre ${start} y ${start + jump - 1}: la red empieza en ${start} y el broadcast termina en ${start + jump - 1} (los octetos siguientes van en 0 para la red y en 255 para el broadcast).`;
}

const DRILL_TYPES = ['cidr2mask', 'mask2cidr', 'dec2bin', 'bin2dec', 'hosts', 'magic', 'same'];
const EXAM_TYPES = ['network', 'broadcast', 'hosts', 'magic', 'mask2cidr', 'same', 'network', 'broadcast', 'cidr2mask', 'same'];

/** Elige el tipo de ejercicio dando más peso a los que la persona más falla. */
function pickType(stats) {
  const weights = DRILL_TYPES.map((t) => {
    const s = stats[t] ?? { ok: 0, fail: 0 };
    return 1 + Math.max(0, s.fail * 2 - s.ok * 0.5);
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < DRILL_TYPES.length; i++) { r -= weights[i]; if (r <= 0) return DRILL_TYPES[i]; }
  return DRILL_TYPES[0];
}

function answerInput(item, onSubmit) {
  if (item.choices) {
    return h('div', { class: 'row drill__choices' }, item.choices.map((c) =>
      h('button', { class: 'btn btn--ghost drill__choice', type: 'button', text: c, onclick: () => onSubmit(c) })));
  }
  const input = h('input', { class: 'input drill__input', id: 'drill-in', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    inputmode: item.mode === 'numeric' ? 'numeric' : item.mode === 'decimal' ? 'decimal' : 'text', placeholder: item.hint });
  const form = h('form', { class: 'drill__form', novalidate: true },
    h('label', { class: 'visually-hidden', for: 'drill-in', text: 'Tu respuesta' }),
    input,
    h('button', { class: 'btn btn--primary', type: 'submit', text: 'Comprobar' }));
  form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) onSubmit(input.value); });
  queueMicrotask(() => input.focus());
  return form;
}

// ---------- Reto de 60 segundos ----------

export function renderDrill(root, state, save) {
  const stats = state.drills.types;
  let left = 60;
  let timer = null;
  let paused = false;
  let score = 0;
  let wrong = [];
  let item = null;
  let type = null;

  const clock = h('p', { class: 'drill__clock mono', 'aria-live': 'off' });
  const scoreEl = h('p', { class: 'drill__score mono' });
  const card = h('div', { class: 'drill__card' });
  const fb = h('p', { class: 'drill__fb', 'aria-live': 'polite' });
  const pause = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Pausar' });
  const stage = h('div');

  function tick() {
    if (paused) return;
    left -= 1;
    clock.textContent = `0:${String(Math.max(left, 0)).padStart(2, '0')}`;
    clock.classList.toggle('drill__clock--low', left <= 10);
    if (left <= 0) finish();
  }

  function nextItem() {
    type = pickType(stats);
    item = TYPES[type].make();
    card.replaceChildren(
      h('p', { class: 'drill__type', text: TYPES[type].label }),
      h('p', { class: 'drill__q', text: item.q }),
      answerInput(item, submit));
  }

  function submit(value) {
    if (paused || left <= 0) return;
    const ok = item.check(value);
    stats[type] = stats[type] ?? { ok: 0, fail: 0 };
    stats[type][ok ? 'ok' : 'fail'] += 1;
    if (ok) {
      score += 1;
      fb.textContent = 'Correcto.';
      fb.className = 'drill__fb drill__fb--ok';
    } else {
      wrong.push({ type, q: item.q, answer: item.answer, given: value, how: item.how });
      fb.textContent = `Era ${item.answer}.`;
      fb.className = 'drill__fb drill__fb--bad';
    }
    scoreEl.textContent = `${score} correctas`;
    nextItem();
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    const isBest = score > (state.drills.best ?? 0);
    if (isBest) state.drills.best = score;
    markStudyDay(state);
    save();
    const weakest = Object.entries(stats)
      .map(([t, s]) => [t, s.fail / Math.max(1, s.ok + s.fail), s.fail])
      .filter(([, , f]) => f > 0)
      .sort((a, b) => b[1] - a[1])[0];
    stage.replaceChildren(h('section', { class: 'panel result enter', 'aria-labelledby': 'dr-h' },
      h('h2', { id: 'dr-h', tabindex: '-1', text: isBest ? 'Nuevo récord' : 'Se acabó el tiempo' }),
      h('p', { class: 'result__score', text: String(score) }),
      h('p', { text: `correctas en 60 segundos. Tu mejor marca: ${state.drills.best}.` }),
      weakest ? h('p', { class: 'muted', text: `Donde más fallas: ${TYPES[weakest[0]].label}. Los próximos retos te lo pondrán más seguido.` }) : null,
      wrong.length ? h('div', { class: 'review-list' },
        h('h3', { text: 'Para repasar' }),
        h('ul', {}, wrong.slice(0, 6).map((w) => h('li', {},
          h('p', { class: 'review-list__q', text: w.q }),
          h('p', { class: 'muted' }, 'Pusiste ', h('code', { text: w.given }), ', era ', h('code', { text: w.answer }), '. ', w.how))))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn--primary', type: 'button', text: 'Otro reto de 60 s', onclick: start }),
        h('a', { class: 'btn btn--ghost', href: '#examen', text: 'Hacer el examen' }))));
    stage.querySelector('h2').focus();
  }

  function start() {
    left = 60; score = 0; wrong = []; paused = false;
    clock.textContent = '1:00';
    clock.classList.remove('drill__clock--low');
    scoreEl.textContent = '0 correctas';
    fb.textContent = '';
    pause.textContent = 'Pausar';
    stage.replaceChildren(h('section', { class: 'panel drill' },
      h('div', { class: 'drill__bar' }, clock, scoreEl, pause), card, fb));
    nextItem();
    clearInterval(timer);
    timer = setInterval(tick, 1000);
  }

  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Seguir' : 'Pausar';
    card.inert = paused;
    if (!paused) card.querySelector('input, button')?.focus();
  });

  // Si la persona sale de la vista, el reloj se detiene.
  const stopOnLeave = () => { clearInterval(timer); window.removeEventListener('hashchange', stopOnLeave); };
  window.addEventListener('hashchange', stopOnLeave);

  root.replaceChildren(h('div', { class: 'enter drillview' },
    h('header', { class: 'view-head' },
      h('h1', { tabindex: '-1', text: 'Reto de 60 segundos' }),
      h('p', { class: 'lead', text: 'Respuestas rápidas de máscaras, prefijos, binario, hosts y saltos. Lo que más falles te va a salir más seguido.' })),
    stage));
  stage.replaceChildren(h('section', { class: 'panel state' },
    h('h2', { text: state.drills.best ? `Tu mejor marca: ${state.drills.best}` : 'Calienta la mente' }),
    h('p', { class: 'muted', text: 'Escribe la respuesta y presiona Enter. Si fallas, te mostramos la correcta y sigues.' }),
    h('button', { class: 'btn btn--primary', type: 'button', text: 'Empezar', onclick: start })));
  root.querySelector('h1').focus();
}

// ---------- Examen sin ayudas ----------

export function examActive() {
  try {
    const e = JSON.parse(sessionStorage.getItem(EXAM_KEY) ?? 'null');
    return e && e.deadline > Date.now() ? e : null;
  } catch { return null; }
}
function saveExam(e) { try { sessionStorage.setItem(EXAM_KEY, JSON.stringify(e)); } catch { /* sin almacenamiento */ } }
function clearExam() { try { sessionStorage.removeItem(EXAM_KEY); } catch { /* sin almacenamiento */ } }

export function renderExam(root, state, save) {
  let exam = examActive();
  let timer = null;

  const stopOnLeave = () => { clearInterval(timer); window.removeEventListener('hashchange', stopOnLeave); };
  window.addEventListener('hashchange', stopOnLeave);

  function intro() {
    root.replaceChildren(h('div', { class: 'enter drillview' },
      h('header', { class: 'view-head' },
        h('h1', { tabindex: '-1', text: 'Examen sin ayudas' }),
        h('p', { class: 'lead', text: `${EXAM_SIZE} ejercicios de subneteo en ${EXAM_MINUTES} minutos. Mientras dure, la calculadora y el asistente quedan bloqueados.` })),
      h('section', { class: 'panel' },
        h('ul', { class: 'points' },
          h('li', { text: 'Direcciones de red y broadcast, hosts útiles, saltos, máscaras y si dos IP están en la misma subred.' }),
          h('li', { text: 'No ves si acertaste hasta el final: así se parece a un examen real.' }),
          h('li', { text: 'Puedes dejar preguntas en blanco y volver a ellas antes de entregar.' })),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn--primary', type: 'button', text: 'Empezar examen', onclick: begin }),
          h('a', { class: 'btn btn--ghost', href: '#reto', text: 'Practicar antes con el reto de 60 s' })))));
    root.querySelector('h1').focus();
  }

  function begin() {
    const items = shuffle(EXAM_TYPES).map((t) => { const it = TYPES[t].make(); return { type: t, q: it.q, answer: it.answer, choices: it.choices ?? null, mode: it.mode ?? null, hint: it.hint ?? null, how: it.how }; });
    exam = { deadline: Date.now() + EXAM_MINUTES * 60000, items, given: items.map(() => ''), at: 0 };
    saveExam(exam);
    run();
  }

  function grade(i) {
    const it = exam.items[i];
    const v = exam.given[i];
    if (!v) return false;
    if (it.type === 'same') return v === it.answer;
    if (it.type === 'mask2cidr') return maskToCidr(v) === maskToCidr(it.answer) && !v.includes('.');
    if (it.type === 'dec2bin') return /^[01]{1,8}$/.test(norm(v)) && parseInt(norm(v), 2) === parseInt(it.answer, 2);
    return norm(v) === norm(it.answer);
  }

  function run() {
    const clock = h('span', { class: 'drill__clock mono' });
    const draw = () => {
      const ms = Math.max(0, exam.deadline - Date.now());
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      clock.textContent = `${m}:${String(s).padStart(2, '0')}`;
      clock.classList.toggle('drill__clock--low', ms < 60000);
      if (ms <= 0) submitExam();
    };
    const i = exam.at;
    const it = exam.items[i];
    const nav = h('div', { class: 'exam__nav', role: 'group', 'aria-label': 'Preguntas' },
      exam.items.map((_, k) => h('button', {
        type: 'button', class: `exam__dot${k === i ? ' exam__dot--on' : ''}${exam.given[k] ? ' exam__dot--done' : ''}`,
        'aria-label': `Pregunta ${k + 1}${exam.given[k] ? ', respondida' : ''}`, 'aria-current': k === i ? 'step' : null, text: k + 1,
        onclick: () => { exam.at = k; saveExam(exam); run(); },
      })));

    const store = (v) => { exam.given[i] = String(v).trim(); saveExam(exam); };
    let answer;
    if (it.choices) {
      answer = h('div', { class: 'row drill__choices' }, it.choices.map((c) => h('button', {
        class: `btn ${exam.given[i] === c ? 'btn--primary' : 'btn--ghost'} drill__choice`, type: 'button', text: c, 'aria-pressed': String(exam.given[i] === c),
        onclick: () => { store(c); run(); },
      })));
    } else {
      const input = h('input', { class: 'input drill__input', id: 'exam-in', value: exam.given[i], autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        inputmode: it.mode === 'numeric' ? 'numeric' : it.mode === 'decimal' ? 'decimal' : 'text', placeholder: it.hint ?? '' });
      input.addEventListener('input', () => store(input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && i < exam.items.length - 1) { exam.at = i + 1; saveExam(exam); run(); } });
      answer = h('div', {}, h('label', { class: 'visually-hidden', for: 'exam-in', text: 'Tu respuesta' }), input);
      queueMicrotask(() => input.focus());
    }

    const done = exam.given.filter(Boolean).length;
    root.replaceChildren(h('div', { class: 'drillview' },
      h('header', { class: 'view-head' },
        h('h1', { tabindex: '-1', text: 'Examen sin ayudas' }),
        h('p', { class: 'exam__status' }, h('span', { text: 'Tiempo: ' }), clock, h('span', { text: ` · ${done}/${exam.items.length} respondidas` }))),
      h('section', { class: 'panel drill' },
        nav,
        h('p', { class: 'drill__type', text: `Pregunta ${i + 1} de ${exam.items.length}` }),
        h('p', { class: 'drill__q', text: it.q }),
        answer,
        h('div', { class: 'row order-actions' },
          i > 0 ? h('button', { class: 'btn btn--ghost', type: 'button', text: 'Anterior', onclick: () => { exam.at = i - 1; saveExam(exam); run(); } }) : null,
          i < exam.items.length - 1
            ? h('button', { class: 'btn btn--ghost', type: 'button', text: 'Siguiente', onclick: () => { exam.at = i + 1; saveExam(exam); run(); } })
            : null,
          h('button', { class: 'btn btn--primary', type: 'button', text: 'Entregar examen', onclick: () => {
            const blanks = exam.items.length - exam.given.filter(Boolean).length;
            if (blanks === 0 || window.confirm(`Tienes ${blanks} sin responder. ¿Entregar de todas formas?`)) submitExam();
          } })))));
    draw();
    clearInterval(timer);
    timer = setInterval(draw, 1000);
  }

  function submitExam() {
    clearInterval(timer);
    const results = exam.items.map((it, k) => ({ ...it, given: exam.given[k], ok: grade(k) }));
    const ok = results.filter((r) => r.ok).length;
    for (const r of results) {
      state.drills.types[r.type] = state.drills.types[r.type] ?? { ok: 0, fail: 0 };
      state.drills.types[r.type][r.ok ? 'ok' : 'fail'] += 1;
    }
    state.drills.examBest = Math.max(state.drills.examBest ?? 0, ok);
    markStudyDay(state);
    save();
    clearExam();
    exam = null;
    root.replaceChildren(h('div', { class: 'enter drillview' },
      h('section', { class: 'panel result', 'aria-labelledby': 'ex-h' },
        h('h1', { id: 'ex-h', tabindex: '-1', text: ok >= 8 ? 'Examen aprobado' : 'Examen terminado' }),
        h('p', { class: 'result__score', text: `${ok}/${results.length}` }),
        h('p', { class: 'muted', text: ok >= 8 ? 'Dominas el cálculo sin ayudas.' : 'Necesitas 8 de 10. Revisa los que fallaste y vuelve a intentarlo: cada examen trae ejercicios nuevos.' }),
        h('div', { class: 'review-list' },
          h('ul', {}, results.map((r) => h('li', { class: r.ok ? 'review-list__ok' : 'review-list__bad' },
            h('p', { class: 'review-list__q' }, h('span', { class: 'tag', text: r.ok ? 'Correcta' : 'Incorrecta' }), ' ', r.q),
            r.ok ? null : h('p', { class: 'muted' }, 'Pusiste ', h('code', { text: r.given || '(en blanco)' }), ', era ', h('code', { text: r.answer }), '. ', r.how))))),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn--primary', type: 'button', text: 'Otro examen', onclick: () => { intro(); } }),
          h('a', { class: 'btn btn--ghost', href: '#reto', text: 'Reto de 60 s' })))));
    root.querySelector('h1').focus();
  }

  if (exam) run(); else intro();
}

/** Pantalla que reemplaza a la calculadora y al asistente mientras hay un examen en curso. */
export function renderBlocked(root, what) {
  root.replaceChildren(h('section', { class: 'panel state enter' },
    h('h1', { tabindex: '-1', text: `${what} durante el examen` }),
    h('p', { text: 'Termina o entrega el examen para volver a usarlo.' }),
    h('a', { class: 'btn btn--primary', href: '#examen', text: 'Volver al examen' })));
  root.querySelector('h1').focus();
}

