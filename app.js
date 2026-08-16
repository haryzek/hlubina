/* HLUBINA — engine v jednom souboru. Vanilla JS, žádné dependencies. */

const APP_VERSION = '1.0.0';
const SCHEMA_VERSION = 1;

const LS_PLAYER = 'hlubina.player';
const LS_QSTATE = 'hlubina.qstate';
const LS_ANSWERS = 'hlubina.answers';

const TYPE_LABELS = { V: 'vigneta', I: 'intervence', K: 'kontrast', F: 'fakta', X: 'více směrů', E: 'najdi chybu' };
const TYPE_WEIGHTS = { V: 35, I: 13, K: 15, F: 22, X: 8, E: 7 };
const CAT_LABELS = {
  'obrany': 'Obrany',
  'prenos-technika': 'Přenos a technika',
  'vyvoj': 'Vývojové teorie',
  'skoly-autori': 'Školy a autoři',
  'struktura-diagnostika': 'Struktura a diagnostika',
  'smery-mosty': 'Směry a mosty',
  'vyzkum-etika-dejiny': 'Výzkum, etika, dějiny',
};

// ---------- stav ----------

let questions = [];          // všechny otázky ze všech balíčků
let byId = new Map();
let packsInfo = [];

let player = { v: SCHEMA_VERSION, elo: 1500, answered: 0 };
let qstate = {};             // id -> {elo, seen, wrong, due, last, cooldown, flag}
let answers = [];            // log: {q, ok, eloB, eloA, t}

let current = null;          // {q, order} — rozehraná otázka
let recent = [];             // posledních 50 id (odvozeno z answers při startu)

function loadState() {
  try { player = Object.assign(player, JSON.parse(localStorage.getItem(LS_PLAYER) || '{}')); } catch (e) {}
  try { qstate = JSON.parse(localStorage.getItem(LS_QSTATE) || '{}'); } catch (e) {}
  try { answers = JSON.parse(localStorage.getItem(LS_ANSWERS) || '[]'); } catch (e) {}
  recent = answers.slice(-50).map(a => a.q);
}

function saveState() {
  localStorage.setItem(LS_PLAYER, JSON.stringify(player));
  localStorage.setItem(LS_QSTATE, JSON.stringify(qstate));
  localStorage.setItem(LS_ANSWERS, JSON.stringify(answers.slice(-2000)));
}

function qs(id) {
  if (!qstate[id]) qstate[id] = { elo: byId.get(id)?.seedElo || 1500, seen: 0, wrong: 0, due: null, last: -1, cooldown: -1, flag: 0 };
  return qstate[id];
}

// ---------- Elo ----------

function expected(rp, rq) { return 1 / (1 + Math.pow(10, (rq - rp) / 400)); }

function kFactor(n) { return n < 200 ? 32 : n < 1000 ? 24 : 16; }

function applyElo(q, ok) {
  const st = qs(q.id);
  const e = expected(player.elo, st.elo);
  const s = ok ? 1 : 0;
  const dp = kFactor(player.answered) * (s - e);
  const dq = 12 * ((1 - s) - (1 - e));
  player.elo = Math.round((player.elo + dp) * 10) / 10;
  st.elo = Math.round((st.elo + dq) * 10) / 10;
  return Math.round(dp);
}

// ---------- scheduler ----------

function pickNext() {
  const recentSet = new Set(recent);
  // 1) fronta oprav
  const dueList = questions.filter(q => {
    const st = qstate[q.id];
    return st && st.due !== null && st.due <= player.answered && !recentSet.has(q.id);
  });
  if (dueList.length) {
    dueList.sort((a, b) => qstate[a.id].due - qstate[b.id].due);
    return dueList[0];
  }
  // 2) vzorkování v Elo pásmu
  let pool = questions.filter(q => !recentSet.has(q.id));
  if (!pool.length) pool = questions.slice();
  let fresh = pool.filter(q => (qstate[q.id]?.cooldown ?? -1) < player.answered);
  if (!fresh.length) fresh = pool; // vyčerpaný pool → cooldowny ignorujeme
  let band = 150;
  let cand = [];
  while (true) {
    cand = fresh.filter(q => Math.abs((qstate[q.id]?.elo ?? q.seedElo) - player.elo) <= band);
    if (cand.length >= 5 || band > 2000) break;
    band += 50;
  }
  if (!cand.length) cand = fresh;
  // typ dle kvót
  const types = [...new Set(cand.map(q => q.type))];
  const total = types.reduce((s, t) => s + (TYPE_WEIGHTS[t] || 5), 0);
  let r = Math.random() * total;
  let chosen = types[0];
  for (const t of types) { r -= (TYPE_WEIGHTS[t] || 5); if (r <= 0) { chosen = t; break; } }
  const typed = cand.filter(q => q.type === chosen);
  const list = typed.length ? typed : cand;
  return list[Math.floor(Math.random() * list.length)];
}

// ---------- odpověď ----------

function answer(optIndex) {
  const { q, order } = current;
  const ok = order[optIndex] === q.correct;
  const st = qs(q.id);
  const eloB = player.elo;
  const delta = applyElo(q, ok);
  player.answered++;
  st.seen++;
  st.last = player.answered;
  if (ok) {
    st.due = null;
    st.cooldown = player.answered + 200;
  } else {
    st.wrong++;
    st.due = player.answered + (st.wrong > 1 ? 50 : 15);
  }
  answers.push({ q: q.id, ok, eloB, eloA: player.elo, t: Date.now() });
  recent.push(q.id);
  if (recent.length > 50) recent.shift();
  saveState();
  return { ok, delta };
}

// ---------- UI: pomůcky ----------

const $ = sel => document.querySelector(sel);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function miniMd(src) {
  // mikro-renderer pro deepDive: odstavce, tučné, kurzíva, blockquote
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return src.split(/\n\s*\n/).map(block => {
    const b = block.trim();
    if (!b) return '';
    const inline = esc(b)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    if (b.startsWith('&gt;') || b.startsWith('>')) {
      return '<blockquote>' + inline.replace(/^(&gt;|>)\s?/gm, '') + '</blockquote>';
    }
    return '<p>' + inline + '</p>';
  }).join('');
}

function toast(msg, btnLabel, btnFn, ms = 4000) {
  const t = $('#toast');
  t.innerHTML = '';
  t.append(el('span', null, msg));
  if (btnLabel) {
    const b = el('button', null, btnLabel);
    b.onclick = () => { t.classList.add('hidden'); btnFn(); };
    t.append(b);
  }
  t.classList.remove('hidden');
  if (ms) setTimeout(() => t.classList.add('hidden'), ms);
}

function show(view) {
  for (const v of document.querySelectorAll('.view')) v.classList.add('hidden');
  $(view).classList.remove('hidden');
}

function updateHeader() {
  const e = $('#hdr-elo');
  e.textContent = Math.round(player.elo);
  e.classList.remove('bump');
  void e.offsetWidth;
  e.classList.add('bump');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- UI: otázka ----------

function renderQuestion() {
  const q = pickNext();
  if (!q) { $('#q-text').textContent = 'Nejsou žádné otázky. Zkontroluj balíčky.'; return; }
  current = { q, order: shuffle([0, 1, 2, 3]) };
  $('#q-meta').innerHTML = '';
  $('#q-meta').append(
    el('span', null, CAT_LABELS[q.category] || q.category),
    el('span', null, TYPE_LABELS[q.type] || q.type)
  );
  $('#q-text').textContent = q.text;
  const box = $('#q-options');
  box.innerHTML = '';
  current.order.forEach((origIdx, i) => {
    const b = el('button', 'opt', q.options[origIdx]);
    b.onclick = () => onAnswer(i);
    box.append(b);
  });
  $('#q-feedback').classList.add('hidden');
  window.scrollTo({ top: 0 });
}

function onAnswer(i) {
  const { q, order } = current;
  const res = answer(i);
  const btns = [...$('#q-options').children];
  btns.forEach((b, j) => {
    b.disabled = true;
    if (order[j] === q.correct) b.classList.add('correct');
    else if (j === i && !res.ok) b.classList.add('wrong');
  });
  updateHeader();
  const fb = $('#q-feedback');
  const r = $('#fb-result');
  r.className = res.ok ? 'ok' : 'ko';
  r.innerHTML = '';
  r.append(
    el('span', null, res.ok ? 'Správně! ' : 'Vedle. '),
    el('span', 'delta', (res.delta >= 0 ? '+' : '') + res.delta + ' Elo')
  );
  $('#fb-explanation').textContent = q.explanation || '';
  $('#fb-source').textContent = q.source || '';
  const dd = $('#fb-deepdive');
  if (q.deepDive) {
    dd.classList.remove('hidden');
    dd.open = false;
    $('#fb-deepdive-body').innerHTML = miniMd(q.deepDive);
  } else {
    dd.classList.add('hidden');
  }
  const flagBtn = $('#btn-flag');
  const st = qs(q.id);
  flagBtn.classList.toggle('flagged', !!st.flag);
  flagBtn.textContent = st.flag ? '🐟 nahlášeno' : '🐟 smrdí mi to';
  fb.classList.remove('hidden');
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('#btn-flag').onclick = () => {
  if (!current) return;
  const st = qs(current.q.id);
  st.flag = st.flag ? 0 : 1;
  saveState();
  $('#btn-flag').classList.toggle('flagged', !!st.flag);
  $('#btn-flag').textContent = st.flag ? '🐟 nahlášeno' : '🐟 smrdí mi to';
};

$('#btn-next').onclick = renderQuestion;

// ---------- UI: statistiky ----------

function renderStats() {
  const total = answers.length;
  const okCount = answers.filter(a => a.ok).length;
  const acc = total ? Math.round(100 * okCount / total) : 0;
  const sum = $('#st-summary');
  sum.innerHTML = '';
  const tile = (num, lbl) => {
    const t = el('div', 'stat-tile');
    t.append(el('div', 'num', String(num)), el('div', 'lbl', lbl));
    return t;
  };
  sum.append(
    tile(Math.round(player.elo), 'Elo'),
    tile(player.answered, 'odpovědí'),
    tile(acc + ' %', 'úspěšnost')
  );

  // sparkline z posledních 200 odpovědí
  const spark = $('#st-sparkline');
  const pts = answers.slice(-200).map(a => a.eloA);
  if (pts.length > 1) {
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = Math.max(max - min, 20);
    const w = 100, h = 30;
    const path = pts.map((p, i) =>
      (i ? 'L' : 'M') + (i / (pts.length - 1) * w).toFixed(2) + ',' + (h - ((p - min) / range) * h).toFixed(2)
    ).join(' ');
    spark.innerHTML = '<svg viewBox="0 0 100 30" preserveAspectRatio="none">' +
      '<path d="' + path + '" fill="none" stroke="#f2a75c" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>';
  } else {
    spark.innerHTML = '<p class="hint">Sparkline se ukáže po pár odpovědích.</p>';
  }

  const groupTable = (keyFn, labelFn, target) => {
    const groups = {};
    for (const a of answers) {
      const q = byId.get(a.q);
      if (!q) continue;
      const k = keyFn(q);
      (groups[k] = groups[k] || { n: 0, ok: 0 }).n++;
      if (a.ok) groups[k].ok++;
    }
    const rows = Object.entries(groups).sort((a, b) => b[1].n - a[1].n);
    const tbl = el('table', 'stats');
    for (const [k, g] of rows) {
      const tr = el('tr');
      tr.append(el('td', null, labelFn(k)), el('td', 'num', String(g.n)), el('td', 'num', Math.round(100 * g.ok / g.n) + ' %'));
      tbl.append(tr);
    }
    target.innerHTML = '';
    target.append(rows.length ? tbl : el('p', 'hint', 'Zatím nic.'));
  };
  groupTable(q => q.category, k => CAT_LABELS[k] || k, $('#st-categories'));
  groupTable(q => q.type, k => TYPE_LABELS[k] || k, $('#st-types'));

  // historie posledních 20
  const hist = $('#st-history');
  hist.innerHTML = '';
  for (const a of answers.slice(-20).reverse()) {
    const q = byId.get(a.q);
    if (!q) continue;
    const item = el('button', 'hist-item');
    const mark = el('span', 'mark ' + (a.ok ? 'ok' : 'ko'), a.ok ? '✓' : '✗');
    const txt = el('span', null, q.text.length > 90 ? q.text.slice(0, 90) + '…' : q.text);
    item.append(mark, txt);
    item.onclick = () => {
      let d = item.querySelector('.hist-detail');
      if (d) { d.remove(); return; }
      d = el('div', 'hist-detail');
      d.textContent = 'Správně: ' + q.options[q.correct] + ' — ' + q.explanation + (q.source ? ' (' + q.source + ')' : '');
      item.append(d);
    };
    hist.append(item);
  }
  if (!hist.children.length) hist.append(el('p', 'hint', 'Zatím žádné odpovědi.'));
}

// ---------- UI: nastavení ----------

function renderSettings() {
  const packs = $('#set-packs');
  packs.innerHTML = '';
  for (const p of packsInfo) {
    packs.append(el('p', 'hint', p.title + ' — ' + p.count + ' otázek (v' + p.version + ')'));
  }
  const flagged = Object.entries(qstate).filter(([, s]) => s.flag).length;
  $('#set-version').textContent = 'Hlubina ' + APP_VERSION + ' · ' + questions.length + ' otázek v poolu' +
    (flagged ? ' · ' + flagged + ' nahlášených' : '');
}

$('#btn-export').onclick = () => {
  const data = { app: 'hlubina', v: SCHEMA_VERSION, exported: new Date().toISOString(), player, qstate, answers };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hlubina-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#btn-import').onclick = () => $('#import-file').click();
$('#import-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'hlubina' || !data.player || !data.qstate) throw new Error('neplatný formát');
    if (!confirm('Přepsat aktuální postup zálohou z ' + (data.exported || '?').slice(0, 10) + '?')) return;
    player = data.player;
    qstate = data.qstate;
    answers = data.answers || [];
    recent = answers.slice(-50).map(a => a.q);
    saveState();
    updateHeader();
    toast('Záloha nahrána.');
    renderSettings();
  } catch (err) {
    toast('Import selhal: ' + err.message);
  }
  e.target.value = '';
};

$('#btn-reset').onclick = () => {
  if (!confirm('Fakt smazat všechen postup? Tohle nejde vrátit.')) return;
  localStorage.removeItem(LS_PLAYER);
  localStorage.removeItem(LS_QSTATE);
  localStorage.removeItem(LS_ANSWERS);
  player = { v: SCHEMA_VERSION, elo: 1500, answered: 0 };
  qstate = {};
  answers = [];
  recent = [];
  updateHeader();
  toast('Postup smazán.');
  renderSettings();
};

// ---------- navigace ----------

$('#btn-stats').onclick = () => { renderStats(); show('#view-stats'); };
$('#btn-settings').onclick = () => { renderSettings(); show('#view-settings'); };
for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => show('#view-question');

// ---------- start ----------

async function loadPacks() {
  const manifest = await (await fetch('packs/manifest.json')).json();
  packsInfo = manifest;
  for (const p of manifest) {
    const pack = await (await fetch('packs/' + p.file)).json();
    for (const q of pack) {
      if (byId.has(q.id)) continue;
      byId.set(q.id, q);
      questions.push(q);
    }
  }
}

async function main() {
  loadState();
  updateHeader();
  try {
    await loadPacks();
  } catch (e) {
    $('#q-text').textContent = 'Nepodařilo se načíst otázky (' + e.message + '). Zkus obnovit stránku online.';
    return;
  }
  renderQuestion();

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.register('sw.js');
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('Nová verze Hlubiny.', 'Obnovit', () => {
            nw.postMessage('skipWaiting');
          }, 0);
        }
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }
}

main();
