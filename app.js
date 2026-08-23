/* HLUBINA — engine v jednom souboru. Vanilla JS, žádné dependencies. */

const APP_VERSION = '1.1.0';
const SCHEMA_VERSION = 2;

const OBOR_LABELS = {
  'psychoterapie': 'Psychoterapie',
  'filosofie': 'Filosofie',
  'vedomi': 'Vědomí a mysl',
  'prirodni-vedy': 'Přírodní vědy',
  'general': 'General',
};

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
  'kernberg-2018': 'Kernberg: TFP-E',
};

// ---------- stav ----------

let questions = [];          // všechny otázky ze všech balíčků
let byId = new Map();
let packsInfo = [];

let player = { v: SCHEMA_VERSION, elos: {}, answeredByObor: {}, answered: 0, pool: 'all', obor: 'all' };
let qstate = {};             // id -> {elo, seen, wrong, due, last, cooldown, flag}
let answers = [];            // log: {q, ok, eloB, eloA, t}

let current = null;          // {q, order} — rozehraná otázka
let recent = [];             // posledních 50 id (odvozeno z answers při startu)

function loadState() {
  try { player = Object.assign(player, JSON.parse(localStorage.getItem(LS_PLAYER) || '{}')); } catch (e) {}
  try { qstate = JSON.parse(localStorage.getItem(LS_QSTATE) || '{}'); } catch (e) {}
  try { answers = JSON.parse(localStorage.getItem(LS_ANSWERS) || '[]'); } catch (e) {}
  // migrace v1 → v2: jedno Elo se stává Elem oboru psychoterapie
  if (typeof player.elo === 'number') {
    player.elos = { psychoterapie: player.elo };
    player.answeredByObor = { psychoterapie: player.answered || 0 };
    delete player.elo;
    player.v = 2;
  }
  if (!player.elos) player.elos = {};
  if (!player.answeredByObor) player.answeredByObor = {};
  if (!player.obor) player.obor = 'all';
  recent = answers.slice(-50).map(a => a.q);
}

function eloOf(obor) { return player.elos[obor] ?? 1500; }
function oborLabel(id) { return OBOR_LABELS[id] || id; }

function saveState() {
  localStorage.setItem(LS_PLAYER, JSON.stringify(player));
  localStorage.setItem(LS_QSTATE, JSON.stringify(qstate));
  localStorage.setItem(LS_ANSWERS, JSON.stringify(answers.slice(-2000)));
}

function qs(id) {
  if (!qstate[id]) qstate[id] = { elo: byId.get(id)?.seedElo || 1500, seen: 0, wrong: 0, due: null, last: -1, cooldown: -1, flag: 0, keep: 0 };
  return qstate[id];
}

function activePool() {
  if (player.pool && player.pool !== 'all' && packsInfo.some(p => p.id === player.pool)) {
    // balíček + knihy k němu vázané (parent)
    const children = new Set(packsInfo.filter(p => p.parent === player.pool).map(p => p.id));
    return questions.filter(q => q._pack === player.pool || children.has(q._pack));
  }
  if (player.obor && player.obor !== 'all') {
    return questions.filter(q => q._obor === player.obor);
  }
  return questions;
}

// ---------- Elo ----------

function expected(rp, rq) { return 1 / (1 + Math.pow(10, (rq - rp) / 400)); }

function kFactor(n) { return n < 200 ? 32 : n < 1000 ? 24 : 16; }

function applyElo(q, ok) {
  const st = qs(q.id);
  const obor = q._obor;
  const rp = eloOf(obor);
  const e = expected(rp, st.elo);
  const s = ok ? 1 : 0;
  const dp = kFactor(player.answeredByObor[obor] || 0) * (s - e);
  const dq = 12 * ((1 - s) - (1 - e));
  player.elos[obor] = Math.round((rp + dp) * 10) / 10;
  st.elo = Math.round((st.elo + dq) * 10) / 10;
  return Math.round(dp);
}

// ---------- scheduler ----------

function pickNext() {
  const recentSet = new Set(recent);
  const source = activePool();
  // 1) fronta oprav
  const dueList = source.filter(q => {
    const st = qstate[q.id];
    return st && st.due !== null && st.due <= player.answered && !recentSet.has(q.id);
  });
  if (dueList.length) {
    dueList.sort((a, b) => qstate[a.id].due - qstate[b.id].due);
    return dueList[0];
  }
  // 2) vzorkování v Elo pásmu
  let pool = source.filter(q => !recentSet.has(q.id));
  if (!pool.length) pool = source.slice();
  let fresh = pool.filter(q => (qstate[q.id]?.cooldown ?? -1) < player.answered);
  if (!fresh.length) fresh = pool; // vyčerpaný pool → cooldowny ignorujeme
  let band = 150;
  let cand = [];
  while (true) {
    cand = fresh.filter(q => Math.abs((qstate[q.id]?.elo ?? q.seedElo) - eloOf(q._obor)) <= band);
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
  const eloB = eloOf(q._obor);
  const delta = applyElo(q, ok);
  player.answered++;
  player.answeredByObor[q._obor] = (player.answeredByObor[q._obor] || 0) + 1;
  st.seen++;
  st.last = player.answered;
  if (ok) {
    // „nechat“: otázka zůstává v oběhu a vrací se po 40–80 otázkách
    st.due = st.keep ? player.answered + 40 + Math.floor(Math.random() * 41) : null;
    st.cooldown = player.answered + 200;
  } else {
    st.wrong++;
    st.due = player.answered + (st.wrong > 1 ? 50 : 15);
  }
  answers.push({ q: q.id, ok, eloB, eloA: eloOf(q._obor), o: q._obor, t: Date.now() });
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
  // v guláši Elo oboru aktuální otázky, jinak Elo zvoleného oboru
  const obor = player.obor !== 'all' ? player.obor : (current?.q?._obor || 'psychoterapie');
  e.textContent = Math.round(eloOf(obor));
  e.title = 'Elo: ' + oborLabel(obor);
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
  const oborCount = new Set(packsInfo.map(p => p.obor)).size;
  const catLabel = (player.obor === 'all' && oborCount > 1 ? oborLabel(q._obor) + ' · ' : '') + (CAT_LABELS[q.category] || q.category);
  $('#q-meta').innerHTML = '';
  $('#q-meta').append(
    el('span', null, catLabel),
    el('span', null, TYPE_LABELS[q.type] || q.type)
  );
  updateHeader();
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
  current.res = res;
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
  const keepBtn = $('#btn-keep');
  keepBtn.classList.toggle('kept', !!st.keep);
  keepBtn.textContent = st.keep ? '♻ necháno' : '♻ nechat';
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

$('#btn-keep').onclick = () => {
  if (!current) return;
  const st = qs(current.q.id);
  st.keep = st.keep ? 0 : 1;
  if (st.keep) st.due = player.answered + 40 + Math.floor(Math.random() * 41);
  else if (current.res?.ok) st.due = null;
  saveState();
  $('#btn-keep').classList.toggle('kept', !!st.keep);
  $('#btn-keep').textContent = st.keep ? '♻ necháno' : '♻ nechat';
};

$('#btn-next').onclick = renderQuestion;

// ---------- UI: statistiky ----------

function renderStats() {
  // statistiky se scopují na aktivní obor; v guláši přes všechno
  const aObor = a => a.o || byId.get(a.q)?._obor || 'psychoterapie';
  const scoped = player.obor === 'all' ? answers : answers.filter(a => aObor(a) === player.obor);
  const total = scoped.length;
  const okCount = scoped.filter(a => a.ok).length;
  const acc = total ? Math.round(100 * okCount / total) : 0;
  const sum = $('#st-summary');
  sum.innerHTML = '';
  const tile = (num, lbl) => {
    const t = el('div', 'stat-tile');
    t.append(el('div', 'num', String(num)), el('div', 'lbl', lbl));
    return t;
  };
  const obory = [...new Set(packsInfo.map(p => p.obor))];
  if (player.obor === 'all' && obory.length > 1) {
    for (const o of obory) {
      if ((player.answeredByObor[o] || 0) > 0 || obory.length <= 4) sum.append(tile(Math.round(eloOf(o)), oborLabel(o)));
    }
    sum.append(tile(total, 'odpovědí'), tile(acc + ' %', 'úspěšnost'));
  } else {
    const o = player.obor === 'all' ? obory[0] : player.obor;
    sum.append(tile(Math.round(eloOf(o)), 'Elo · ' + oborLabel(o)), tile(total, 'odpovědí'), tile(acc + ' %', 'úspěšnost'));
  }

  // sparkline z posledních 200 odpovědí (ve scope)
  const spark = $('#st-sparkline');
  const pts = scoped.slice(-200).map(a => a.eloA);
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
    for (const a of scoped) {
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
  for (const a of scoped.slice(-20).reverse()) {
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
  const sel = $('#pool-select');
  sel.innerHTML = '';
  const scope = packsInfo.filter(p => player.obor === 'all' || p.obor === player.obor);
  const scopeLabel = player.obor === 'all' ? 'Guláš všeho' : oborLabel(player.obor);
  const optAll = el('option', null, scopeLabel + ' — vše');
  optAll.value = 'all';
  sel.append(optAll);
  for (const p of scope.filter(p => !p.parent)) {
    const o = el('option', null, p.title + ' (' + p.count + ')');
    o.value = p.id;
    sel.append(o);
    for (const b of scope.filter(x => x.parent === p.id)) {
      const ob = el('option', null, '  📖 ' + b.title + ' (' + b.count + ')');
      ob.value = b.id;
      sel.append(ob);
    }
  }
  sel.value = packsInfo.some(p => p.id === player.pool) ? player.pool : 'all';
  const packs = $('#set-packs');
  packs.innerHTML = '';
  for (const p of packsInfo) {
    packs.append(el('p', 'hint', p.title + ' — ' + p.count + ' otázek (v' + p.version + ')'));
  }
  const flagged = Object.entries(qstate).filter(([, s]) => s.flag).length;
  $('#set-version').textContent = 'Hlubina ' + APP_VERSION + ' · ' + questions.length + ' otázek v poolu' +
    (flagged ? ' · ' + flagged + ' nahlášených' : '');
}

$('#pool-select').onchange = e => {
  player.pool = e.target.value;
  saveState();
  renderQuestion();
  toast(player.pool === 'all' ? 'Hraješ ze všeho.' : 'Hraješ jen z balíčku.');
};

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

// ---------- obor menu ----------

function renderOborMenu() {
  const menu = $('#obor-menu');
  menu.innerHTML = '';
  const obory = [...new Set(packsInfo.map(p => p.obor))];
  const item = (id, label) => {
    const b = el('button', 'obor-item' + ((player.obor === id) ? ' active' : ''), label);
    b.onclick = () => {
      player.obor = id;
      player.pool = 'all';
      saveState();
      menu.classList.add('hidden');
      renderQuestion();
      show('#view-question');
    };
    return b;
  };
  menu.append(item('all', '🍲 Guláš všeho'));
  for (const o of obory) menu.append(item(o, oborLabel(o) + ' · Elo ' + Math.round(eloOf(o))));
}

$('#btn-obor').onclick = () => {
  const menu = $('#obor-menu');
  if (menu.classList.contains('hidden')) { renderOborMenu(); menu.classList.remove('hidden'); }
  else menu.classList.add('hidden');
};

document.addEventListener('click', e => {
  const menu = $('#obor-menu');
  if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target.id !== 'btn-obor') {
    menu.classList.add('hidden');
  }
});

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
      q._pack = p.id;
      q._obor = p.obor || 'psychoterapie';
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
