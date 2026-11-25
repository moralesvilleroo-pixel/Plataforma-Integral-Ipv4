// Laboratorio de bits: interruptores de un octeto, deslizador de prefijo y operación AND paso a paso.
import { h, randInt, markStudyDay } from './lib.js';
import { cidrToMask, cidrToWildcard, intToIp, ipToInt } from './core/ipv4.js';

const WEIGHTS = [128, 64, 32, 16, 8, 4, 2, 1];
const MASK_VALUES = [0, 128, 192, 224, 240, 248, 252, 254, 255];

// ---------- 1. Interruptores de octeto ----------

function octetLab(state, save) {
  let bits = [0, 0, 0, 0, 0, 0, 0, 0];
  let mode = 'libre';
  let target = null;
  let streak = 0;

  const value = () => bits.reduce((acc, b, i) => acc + b * WEIGHTS[i], 0);
  const sum = h('p', { class: 'bits__sum mono', 'aria-live': 'polite' });
  const big = h('p', { class: 'bits__big mono' });
  const goal = h('p', { class: 'bits__goal' });
  const fb = h('p', { class: 'bits__fb', 'aria-live': 'polite' });

  const row = h('div', { class: 'octet', role: 'group', 'aria-label': 'Ocho bits de un octeto' });
  const buttons = WEIGHTS.map((w, i) => {
    const b = h('button', { class: 'bit', type: 'button', 'aria-pressed': 'false', 'aria-label': `Bit de valor ${w}` },
      h('span', { class: 'bit__w', text: w }),
      h('span', { class: 'bit__v', text: '0' }));
    b.addEventListener('click', () => { bits[i] = bits[i] ? 0 : 1; draw(); });
    row.append(b);
    return b;
  });

  function newTarget() {
    // La mitad de los retos son valores de máscara: son los que más se usan al subnetear.
    target = Math.random() < 0.5 ? MASK_VALUES[randInt(1, MASK_VALUES.length - 1)] : randInt(1, 254);
    bits = [0, 0, 0, 0, 0, 0, 0, 0];
  }

  function draw() {
    buttons.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(bits[i] === 1));
      b.lastChild.textContent = String(bits[i]);
    });
    const v = value();
    const parts = bits.map((b, i) => (b ? WEIGHTS[i] : null)).filter((x) => x !== null);
    sum.textContent = parts.length ? `${parts.join(' + ')} = ${v}` : 'Todos los bits en 0 = 0';
    big.textContent = `${bits.join('')}₂ = ${v}`;
    if (mode === 'libre') {
      goal.textContent = 'Toca los bits para encenderlos y mira cómo se suma su valor.';
      fb.textContent = '';
      fb.className = 'bits__fb';
      return;
    }
    goal.textContent = `Forma el número ${target}`;
    if (v === target) {
      fb.textContent = `Correcto: ${target} = ${bits.join('')}. Racha: ${streak + 1}.`;
      fb.className = 'bits__fb bits__fb--ok';
    } else if (v > target) {
      fb.textContent = `Te pasas por ${v - target}. Apaga algún bit.`;
      fb.className = 'bits__fb';
    } else {
      fb.textContent = `Te faltan ${target - v}.`;
      fb.className = 'bits__fb';
    }
  }

  const next = h('button', { class: 'btn btn--primary', type: 'button', text: 'Otro número', hidden: true });
  next.addEventListener('click', () => {
    if (value() === target) { streak += 1; markStudyDay(state); save(); } else { streak = 0; }
    newTarget();
    draw();
    buttons[0].focus();
  });
  const reset = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Apagar todos', onclick: () => { bits = bits.map(() => 0); draw(); } });

  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo' });
  for (const [k, label] of [['libre', 'Libre'], ['reto', 'Reto']]) {
    seg.append(h('button', { type: 'button', 'aria-pressed': String(k === mode), onclick: () => {
      mode = k;
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.textContent === label));
      next.hidden = mode !== 'reto';
      if (mode === 'reto') { streak = 0; newTarget(); }
      draw();
    } }, label));
  }

  draw();
  return h('section', { class: 'panel bits', 'aria-labelledby': 'oct-h' },
    h('div', { class: 'bits__head' },
      h('h2', { id: 'oct-h', text: 'Un octeto, ocho interruptores' }),
      seg),
    goal, row, big, sum, fb,
    h('div', { class: 'row' }, next, reset));
}

// ---------- 2. Deslizador de prefijo ----------

function prefixLab() {
  const range = h('input', { type: 'range', min: 1, max: 32, value: 24, id: 'cidr-range', class: 'range' });
  const label = h('label', { for: 'cidr-range', class: 'range__label' });
  const strip = h('div', { class: 'strip', 'aria-hidden': 'true' });
  const cells = [];
  for (let o = 0; o < 4; o++) {
    const oct = h('div', { class: 'strip__oct' });
    for (let i = 0; i < 8; i++) { const c = h('span', { class: 'strip__bit' }); cells.push(c); oct.append(c); }
    strip.append(oct);
  }
  const facts = h('dl', { class: 'kv' });

  function draw() {
    const p = Number(range.value);
    label.textContent = `Prefijo /${p}`;
    cells.forEach((c, i) => {
      c.textContent = i < p ? '1' : '0';
      c.classList.toggle('strip__bit--net', i < p);
    });
    const hostBits = 32 - p;
    const total = 2 ** hostBits;
    const useful = p >= 31 ? (p === 32 ? 1 : 2) : total - 2;
    const fmt = (n) => n.toLocaleString('es-CO');
    facts.replaceChildren(...[
      ['Máscara', cidrToMask(p)],
      ['Wildcard', cidrToWildcard(p)],
      ['Bits de red / host', `${p} / ${hostBits}`],
      ['Direcciones por red', fmt(total)],
      ['Hosts útiles', p >= 31 ? `${fmt(useful)} (enlace especial)` : `2^${hostBits} - 2 = ${fmt(useful)}`],
      ['Subredes al partir un /24', p >= 24 ? `2^${p - 24} = ${fmt(2 ** (p - 24))}` : 'Mayor que un /24'],
    ].map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }))));
  }
  range.addEventListener('input', draw);
  draw();

  return h('section', { class: 'panel bits', 'aria-labelledby': 'pre-h' },
    h('h2', { id: 'pre-h', text: 'Red y host en los 32 bits' }),
    h('p', { class: 'muted', text: 'Mueve el prefijo. Los bits en verde son la parte de red; los demás, la parte de host.' }),
    label, range, strip,
    h('p', { class: 'strip__legend' },
      h('span', { class: 'strip__key strip__key--net' }), 'Red',
      h('span', { class: 'strip__key' }), 'Host'),
    facts);
}

// ---------- 3. Operación AND paso a paso ----------

function andLab(state, save) {
  let p; let ip; let ipInt; let maskInt; let oct; let picks;

  const body = h('div');
  const fb = h('p', { class: 'bits__fb', 'aria-live': 'polite' });
  const problem = h('p', { class: 'problem' });

  function newProblem() {
    p = [17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30][randInt(0, 12)];
    ip = `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
    ipInt = ipToInt(ip);
    maskInt = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
    oct = Math.floor(p / 8); // octeto donde la máscara no es 255 ni 0
    picks = [0, 0, 0, 0, 0, 0, 0, 0];
    fb.textContent = '';
    fb.className = 'bits__fb';
    draw();
  }

  const octBits = (n, o) => ((n >>> (24 - o * 8)) & 255).toString(2).padStart(8, '0').split('').map(Number);

  function draw() {
    const ipOct = octBits(ipInt, oct);
    const maskOct = octBits(maskInt, oct);
    problem.replaceChildren('Dirección ', h('code', { text: `${ip}/${p}` }),
      `. Los octetos con máscara 255 se copian y los de máscara 0 quedan en 0. Solo hay que calcular el octeto ${oct + 1}.`);

    const cellRow = (label, arr, cls) => h('div', { class: 'androw' },
      h('span', { class: 'androw__label', text: label }),
      h('span', { class: 'androw__bits' }, arr.map((b) => h('span', { class: `andbit ${cls}`, text: b }))));

    const pickRow = h('div', { class: 'androw' },
      h('span', { class: 'androw__label', text: 'Resultado' }),
      h('span', { class: 'androw__bits', role: 'group', 'aria-label': 'Toca cada bit del resultado' },
        picks.map((b, i) => {
          const btn = h('button', { class: 'andbit andbit--pick', type: 'button', 'aria-pressed': String(b === 1), 'aria-label': `Bit ${i + 1} del resultado: ${b}`, text: b });
          btn.addEventListener('click', () => { picks[i] = picks[i] ? 0 : 1; draw(); body.querySelectorAll('.andbit--pick')[i].focus(); });
          return btn;
        })));

    body.replaceChildren(
      cellRow(`IP, octeto ${oct + 1} (${(ipInt >>> (24 - oct * 8)) & 255})`, ipOct, ''),
      cellRow(`Máscara (${(maskInt >>> (24 - oct * 8)) & 255})`, maskOct, 'andbit--mask'),
      pickRow);
  }

  const check = h('button', { class: 'btn btn--primary', type: 'button', text: 'Comprobar' });
  check.addEventListener('click', () => {
    const want = octBits(ipInt, oct).map((b, i) => b & octBits(maskInt, oct)[i]);
    const wrong = want.map((b, i) => (b !== picks[i] ? i + 1 : null)).filter(Boolean);
    const netIp = intToIp((ipInt & maskInt) >>> 0);
    markStudyDay(state); save();
    if (wrong.length === 0) {
      fb.textContent = `Correcto. La dirección de red es ${netIp}/${p}.`;
      fb.className = 'bits__fb bits__fb--ok';
    } else {
      fb.textContent = `Revisa ${wrong.length === 1 ? 'el bit' : 'los bits'} ${wrong.join(', ')}. Regla: 1 AND 1 = 1; cualquier otro caso da 0.`;
      fb.className = 'bits__fb';
    }
  });
  const another = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Otra dirección', onclick: newProblem });

  newProblem();
  return h('section', { class: 'panel bits', 'aria-labelledby': 'and-h' },
    h('h2', { id: 'and-h', text: 'De la IP a la dirección de red (AND)' }),
    problem, body, fb,
    h('div', { class: 'row' }, check, another));
}

export function renderBits(root, state, save) {
  root.replaceChildren(h('div', { class: 'enter bitslab' },
    h('header', { class: 'view-head' },
      h('h1', { tabindex: '-1', text: 'Laboratorio de bits' }),
      h('p', { class: 'lead', text: 'Antes de subnetear con números, mira qué pasa con los bits: cómo se forma un octeto, dónde termina la red y cómo sale la dirección de red.' }),
      h('a', { class: 'btn btn--ghost btn--sm', href: '#practica', text: 'Ir a la práctica de subneteo' })),
    octetLab(state, save),
    prefixLab(),
    andLab(state, save)));
  root.querySelector('h1').focus();
}
