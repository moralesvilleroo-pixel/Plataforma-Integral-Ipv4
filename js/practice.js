// Práctica de subneteo FLSM con ejemplos resueltos que se van desvaneciendo (niveles 1 a 4).
import { h, randInt, markStudyDay } from './lib.js';
import { calculateFLSM } from './core/subnetting.js';
import { cidrToMask, ipToInt, maskToCidr, validateIp } from './core/ipv4.js';

const LEVELS = [
  { n: 1, name: 'Ejemplo resuelto', shown: [1, 2, 3, 4, 5, 6] },
  { n: 2, name: 'Completa el final', shown: [1, 2, 3, 4] },
  { n: 3, name: 'Completa casi todo', shown: [1, 2] },
  { n: 4, name: 'Sin ayuda', shown: [] },
];
const PROMOTE_AFTER = 2;

function makeProblem(level) {
  const big = level === 4 && Math.random() < 0.6;
  const baseCidr = big ? 16 : 24;
  const ip = big
    ? (Math.random() < 0.5 ? `172.${randInt(16, 31)}.0.0` : `10.${randInt(0, 255)}.0.0`)
    : `192.168.${randInt(0, 254)}.0`;
  const choices = big ? [3, 5, 6, 9, 12, 20, 30, 40, 50, 60] : [2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16];
  const need = choices[randInt(0, choices.length - 1)];
  const res = calculateFLSM({ ip, baseCidr, criteria: 'subnets', value: need });
  const bits = res.newCidr - baseCidr;
  const k = randInt(2, Math.min(need, res.totalSubnets));
  const s = res.subnets[k - 1];
  const octet = res.newCidr <= 24 ? 3 : 4;
  const jump = octet === 3 ? s.blockSize / 256 : s.blockSize;
  return {
    ip, baseCidr, need, bits, k, octet, jump,
    newCidr: res.newCidr,
    mask: cidrToMask(res.newCidr),
    net: s.netIp, broadcast: s.broadcast, first: s.firstIp, last: s.lastIp,
    nextNet: res.subnets[k]?.netIp ?? null,
    prevNet: res.subnets[k - 2]?.netIp ?? null,
  };
}

const sameIp = (a, b) => validateIp(a) && ipToInt(a) === ipToInt(b);

/** Revisa cada paso y explica el error típico cuando lo reconoce. */
function check(p, step, v, v2) {
  const val = String(v ?? '').trim();
  switch (step) {
    case 1: {
      const n = Number(val);
      if (!/^\d+$/.test(val)) return 'Escribe un número entero.';
      if (n === p.bits) return null;
      if (2 ** n < p.need) return `2 elevado a ${n} da ${2 ** n} subredes: no alcanza para ${p.need}.`;
      return `Con ${p.bits} bits ya tienes ${2 ** p.bits} subredes, suficientes para ${p.need}. Usa el mínimo.`;
    }
    case 2: {
      const c = maskToCidr(val);
      if (c === null) return 'Escribe el prefijo (/27) o la máscara (255.255.255.224).';
      if (c === p.newCidr) return null;
      if (c === p.bits) return `Ese es el número de bits prestados. Súmalo al prefijo original: /${p.baseCidr} + ${p.bits}.`;
      return `Prefijo original /${p.baseCidr} más ${p.bits} bits prestados.`;
    }
    case 3: {
      const n = Number(val);
      if (!/^\d+$/.test(val)) return 'Escribe un número entero.';
      if (n === p.jump) return null;
      const maskOctet = Number(p.mask.split('.')[p.octet - 1]);
      return `En el octeto ${p.octet} la máscara vale ${maskOctet}. Salto = 256 - ${maskOctet}.`;
    }
    case 4: {
      if (!validateIp(val)) return 'Escribe una dirección IPv4 válida.';
      if (sameIp(val, p.net)) return null;
      if (sameIp(val, p.first)) return 'Esa es la primera dirección útil. La dirección de red es una antes.';
      if (p.nextNet && sameIp(val, p.nextNet)) return `Esa es la subred ${p.k + 1}. La subred 1 empieza en la red base, así que suma (${p.k} - 1) × salto.`;
      if (p.prevNet && sameIp(val, p.prevNet)) return `Esa es la subred ${p.k - 1}. Te faltó un salto más.`;
      return `Red base + (${p.k} - 1) × ${p.jump} en el octeto ${p.octet}.`;
    }
    case 5: {
      if (!validateIp(val)) return 'Escribe una dirección IPv4 válida.';
      if (sameIp(val, p.broadcast)) return null;
      if (p.nextNet && sameIp(val, p.nextNet)) return 'Esa es la red de la siguiente subred. El broadcast es la dirección anterior.';
      if (sameIp(val, p.last)) return 'Esa es la última útil. El broadcast es la siguiente.';
      return 'Broadcast = siguiente dirección de red menos 1.';
    }
    case 6: {
      const a = String(v2 ?? '').trim();
      if (!validateIp(val) || !validateIp(a)) return 'Escribe las dos direcciones IPv4.';
      const okFirst = sameIp(val, p.first);
      const okLast = sameIp(a, p.last);
      if (okFirst && okLast) return null;
      if (!okFirst && sameIp(val, p.net)) return 'La dirección de red no se asigna a equipos: la primera útil es red + 1.';
      if (!okLast && sameIp(a, p.broadcast)) return 'El broadcast no se asigna a equipos: la última útil es broadcast - 1.';
      return 'Primera útil = red + 1. Última útil = broadcast - 1.';
    }
    default: return null;
  }
}

function stepDefs(p) {
  const oct = p.octet === 3 ? 'tercer' : 'cuarto';
  return [
    { n: 1, label: 'Bits prestados', hint: `El menor número de bits con 2 elevado a bits mayor o igual a ${p.need}`, answer: String(p.bits) },
    { n: 2, label: 'Nuevo prefijo y máscara', hint: 'Prefijo original más bits prestados', answer: `/${p.newCidr}  ${p.mask}` },
    { n: 3, label: `Salto en el ${oct} octeto`, hint: '256 menos el valor de la máscara en ese octeto', answer: String(p.jump) },
    { n: 4, label: `Red de la subred ${p.k}`, hint: `Red base + (${p.k} - 1) × salto`, answer: p.net },
    { n: 5, label: `Broadcast de la subred ${p.k}`, hint: 'Siguiente red menos 1', answer: p.broadcast },
    { n: 6, label: 'Primera y última útil', hint: 'Red + 1 y broadcast - 1', answer: `${p.first} a ${p.last}`, two: true },
  ];
}

export function renderPractice(root, state, save) {
  let level = state.practice.level;
  let problem = makeProblem(level);

  const draw = () => {
    const lv = LEVELS[level - 1];
    const steps = stepDefs(problem);
    const inputs = new Map();

    const levelSeg = h('div', { class: 'seg seg--stack', role: 'group', 'aria-label': 'Nivel de ayuda' },
      LEVELS.map((L) => h('button', {
        type: 'button', 'aria-pressed': String(L.n === level),
        onclick: () => { level = L.n; state.practice.level = L.n; state.practice.streak = 0; save(); problem = makeProblem(level); draw(); },
      }, `${L.n}. ${L.name}`)));

    const list = h('ol', { class: 'steps' });
    for (const s of steps) {
      const shown = lv.shown.includes(s.n);
      const fb = h('p', { class: 'step__fb', id: `fb-${s.n}`, 'aria-live': 'polite' });
      let ansCell;
      if (shown) {
        ansCell = h('span', { class: 'step__ans', text: s.answer });
      } else if (s.two) {
        const a = h('input', { class: 'input', id: `in-${s.n}a`, inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': `fb-${s.n}`, placeholder: 'primera' });
        const b = h('input', { class: 'input', id: `in-${s.n}b`, inputmode: 'decimal', autocomplete: 'off', 'aria-describedby': `fb-${s.n}`, placeholder: 'última' });
        inputs.set(s.n, [a, b]);
        ansCell = h('span', { class: 'row' },
          h('label', { class: 'visually-hidden', for: `in-${s.n}a`, text: 'Primera útil' }), a,
          h('label', { class: 'visually-hidden', for: `in-${s.n}b`, text: 'Última útil' }), b);
      } else {
        const a = h('input', { class: 'input', id: `in-${s.n}`, inputmode: s.n <= 3 ? 'numeric' : 'decimal', autocomplete: 'off', 'aria-describedby': `fb-${s.n}` });
        inputs.set(s.n, [a]);
        ansCell = a;
      }
      list.append(h('li', { class: 'step', 'data-step': s.n },
        h('span', { class: 'step__n', 'aria-hidden': 'true', text: s.n }),
        h(shown ? 'span' : 'label', { class: 'step__label', for: shown || s.two ? null : `in-${s.n}` },
          s.label, h('small', { text: s.hint })),
        ansCell, fb));
    }

    const status = h('p', { 'aria-live': 'polite', class: 'eyebrow-num' });
    const actions = h('div', { class: 'row' });
    const another = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Otro ejercicio', onclick: () => { problem = makeProblem(level); draw(); } });

    if (lv.shown.length === 6) {
      actions.append(
        h('button', { class: 'btn btn--primary', type: 'button', text: 'Practicar en el nivel 2',
          onclick: () => { level = 2; state.practice.level = 2; state.practice.streak = 0; save(); problem = makeProblem(2); draw(); } }),
        another);
    } else {
      const checkBtn = h('button', { class: 'btn btn--primary', type: 'button', text: 'Comprobar' });
      checkBtn.addEventListener('click', () => {
        let allOk = true;
        let firstBad = null;
        for (const [n, els] of inputs) {
          const msg = check(problem, n, els[0].value, els[1]?.value);
          const li = list.querySelector(`[data-step="${n}"]`);
          li.classList.toggle('step--ok', !msg);
          li.classList.toggle('step--bad', !!msg);
          li.querySelector('.step__fb').textContent = msg ? `Revisa: ${msg}` : 'Correcto.';
          for (const el of els) el.setAttribute('aria-invalid', String(!!msg));
          if (msg) { allOk = false; firstBad ??= els[0]; }
        }
        markStudyDay(state);
        if (allOk) {
          state.practice.streak += 1;
          if (state.practice.streak >= PROMOTE_AFTER && level < 4) {
            level += 1;
            state.practice.level = level;
            state.practice.streak = 0;
            status.textContent = `Ejercicio correcto. Subes al nivel ${level}: ${LEVELS[level - 1].name}.`;
          } else {
            status.textContent = 'Ejercicio correcto.';
          }
          checkBtn.disabled = true;
          another.classList.replace('btn--ghost', 'btn--primary');
          another.focus();
        } else {
          state.practice.streak = 0;
          status.textContent = 'Hay pasos por corregir. Lee la pista de cada uno.';
          firstBad?.focus();
        }
        save();
      });
      actions.append(checkBtn, another);
    }

    root.replaceChildren(h('div', { class: 'enter' },
      h('header', { class: 'view-head' },
        h('h1', { tabindex: '-1', text: 'Práctica de subneteo' }),
        h('p', { class: 'lead', text: 'Primero ves el procedimiento completo; luego se ocultan pasos hasta que lo resuelves solo. Dos ejercicios correctos seguidos te suben de nivel.' }),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn--ghost btn--sm', href: '#bits', text: 'Laboratorio de bits' }),
          h('a', { class: 'btn btn--ghost btn--sm', href: '#calculadora', text: 'Abrir la calculadora' }))),
      h('div', { class: 'panel' },
        h('div', { class: 'row', style: null }, levelSeg),
        h('p', { class: 'problem' },
          'Divide la red ', h('code', { text: `${problem.ip}/${problem.baseCidr}` }),
          ` en al menos ${problem.need} subredes iguales (FLSM). Calcula la subred número ${problem.k}.`),
        list,
        h('div', { class: 'row order-actions' }, actions.childNodes.length ? [...actions.childNodes] : null),
        status),
    ));
    root.querySelector('h1').focus();
  };

  draw();
}
