// Corre una serie de preguntas (opción múltiple u ordenar) con retroalimentación por opción.
import { h, shuffle } from './lib.js';

const KEYS = ['A', 'B', 'C', 'D', 'E'];

/**
 * @param {HTMLElement} root
 * @param {{questions: object[], label: (q: object) => string, onAnswer: (q: object, ok: boolean) => void, onDone: (r: {ok:number,total:number}) => void}} opts
 */
export function runQuiz(root, { questions, label, onAnswer, onDone }) {
  let i = 0;
  let okCount = 0;
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });

  const show = () => {
    const q = questions[i];
    const box = h('section', { class: 'quiz enter', 'aria-labelledby': 'q-title' });
    box.append(
      h('div', { class: 'quiz__top' },
        h('span', { class: 'eyebrow-num', text: `Pregunta ${i + 1} de ${questions.length}` }),
        h('span', { class: 'row' },
          label ? h('span', { class: 'tag', text: label(q) }) : null,
          h('span', { class: 'tag', text: q.b })),
      ),
      h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Avance', 'aria-valuemin': 0, 'aria-valuemax': questions.length, 'aria-valuenow': i },
        barFill(i / questions.length)),
      h('h2', { id: 'q-title', class: 'quiz__q', tabindex: '-1', text: q.q }),
    );
    const body = h('div');
    box.append(body, live);
    root.replaceChildren(box);
    box.querySelector('h2').focus();

    const finish = (ok) => {
      if (ok) okCount += 1;
      onAnswer(q, ok);
      live.textContent = ok ? 'Respuesta correcta.' : 'Respuesta incorrecta.';
      const next = h('button', {
        class: 'btn btn--primary', type: 'button',
        text: i + 1 < questions.length ? 'Siguiente pregunta' : 'Ver resultado',
        onclick: () => { i += 1; if (i < questions.length) show(); else onDone({ ok: okCount, total: questions.length }); },
      });
      body.append(
        h('div', { class: 'feedback' },
          h('strong', { text: ok ? 'Correcto' : 'Incorrecto' }),
          h('p', { text: q.exp ?? '' }),
          next),
      );
      next.focus();
    };

    if (q.tipo === 'orden') renderOrder(body, q, finish);
    else renderChoice(body, q, finish);
  };

  show();
}

function barFill(ratio) {
  const s = h('span');
  s.style.width = `${Math.round(ratio * 100)}%`;
  return s;
}

function renderChoice(body, q, finish) {
  const opts = shuffle(q.o);
  const list = h('ul', { class: 'opts' });
  const buttons = opts.map((o, idx) => {
    const btn = h('button', { class: 'opt', type: 'button' },
      h('span', { class: 'opt__k', 'aria-hidden': 'true', text: KEYS[idx] }),
      h('span', {}, h('span', { text: o.t })));
    btn.addEventListener('click', () => {
      for (const b of buttons) b.disabled = true;
      const correctIdx = opts.findIndex((x) => x.ok);
      const chosenOk = o.ok === true;
      btn.classList.add(chosenOk ? 'opt--ok' : 'opt--bad');
      addFb(btn, chosenOk ? '' : 'Incorrecta. ', o.fb);
      if (!chosenOk) {
        const right = buttons[correctIdx];
        right.classList.add('opt--ok');
        addFb(right, '', opts[correctIdx].fb);
      }
      finish(chosenOk);
    });
    list.append(h('li', {}, btn));
    return btn;
  });
  body.append(list);
}

function addFb(btn, prefix, text) {
  btn.lastElementChild.append(h('span', { class: 'opt__fb', text: `${prefix}${text ?? ''}` }));
}

function renderOrder(body, q, finish) {
  let pool = shuffle(q.items);
  if (pool.every((v, k) => v === q.items[k])) pool = [...pool.slice(1), pool[0]];
  const picked = [];

  const pickBox = h('div', { class: 'order-pick', 'aria-label': 'Tu orden' });
  const poolBox = h('div', { class: 'order-pool', 'aria-label': 'Elementos disponibles' });
  const check = h('button', { class: 'btn btn--primary', type: 'button', text: 'Comprobar orden', disabled: true });
  const reset = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Empezar de nuevo' });
  let locked = false;

  const draw = () => {
    pickBox.replaceChildren(
      ...(picked.length ? picked.map((t, k) => h('button', {
        class: 'chip chip--placed', type: 'button', 'aria-label': `Quitar ${t} de la posición ${k + 1}`, disabled: locked,
        onclick: () => { picked.splice(k, 1); pool.push(t); draw(); },
      }, h('b', { text: k + 1 }), t)) : [h('span', { class: 'eyebrow-num', text: 'Toca los elementos en orden.' })]),
    );
    poolBox.replaceChildren(...pool.map((t) => h('button', {
      class: 'chip', type: 'button', disabled: locked,
      onclick: () => { pool = pool.filter((x) => x !== t); picked.push(t); draw(); },
    }, t)));
    check.disabled = locked || pool.length > 0;
    reset.disabled = locked;
  };

  reset.addEventListener('click', () => { pool = shuffle(q.items); picked.length = 0; draw(); });
  check.addEventListener('click', () => {
    locked = true;
    const ok = picked.every((t, k) => t === q.items[k]);
    draw();
    [...pickBox.children].forEach((chip, k) => chip.classList.add(picked[k] === q.items[k] ? 'chip--ok' : 'chip--bad'));
    if (!ok) {
      body.append(h('p', { class: 'feedback' },
        h('strong', { text: 'Orden correcto' }),
        q.items.map((t, k) => `${k + 1}. ${t}`).join(' · ')));
    }
    finish(ok);
  });

  draw();
  body.append(pickBox, poolBox, h('div', { class: 'row order-actions' }, check, reset));
}
