'use strict';
const $ = id => document.getElementById(id);
let meta = null;      // {sayimId, kisi}
let items = [];       // sıralı liste
let filter = 'all';

// ---------- IndexedDB ----------
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('sayim', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('meta');
      r.result.createObjectStore('items', {keyPath: 'k'});
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (store, mode) => db.transaction(store, mode).objectStore(store);
const prom = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
const saveItem = it => prom(tx('items', 'readwrite').put(it));

async function loadAll() {
  meta = await prom(tx('meta', 'readonly').get('meta'));
  if (!meta) return false;
  const all = await prom(tx('items', 'readonly').getAll());
  const order = meta.order;
  const map = new Map(all.map(x => [x.k, x]));
  items = order.map(k => map.get(k)).filter(Boolean);
  return true;
}

async function importData(obj) {
  if (!obj || !Array.isArray(obj.items)) throw new Error('Geçersiz dosya');
  await new Promise((res, rej) => {
    const t = db.transaction(['meta', 'items'], 'readwrite');
    t.objectStore('items').clear();
    t.objectStore('meta').put({sayimId: obj.sayimId, kisi: obj.kisi, order: obj.items.map(x => x.k)}, 'meta');
    obj.items.forEach(x => t.objectStore('items').put(x));
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
  await loadAll();
}

// ---------- UI ----------
const isDone = it => it.c !== undefined && it.c !== null && it.c !== '';
const isDiff = it => isDone(it) && typeof it.s === 'number' && Number(it.c) !== it.s;
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

function rowClass(it) { return 'item' + (isDone(it) ? ' done' : '') + (isDiff(it) ? ' diff' : '') + (it.t ? ' flag' : ''); }

function show() {
  const has = !!meta;
  $('welcome').style.display = has ? 'none' : 'block';
  $('app').style.display = has ? 'block' : 'none';
  if (!has) return;
  $('who').textContent = meta.kisi;
  const rafs = [...new Set(items.map(x => x.r || '(rafsız)'))];
  const cur = $('raf').value;
  $('raf').innerHTML = '<option value="">Tüm raflar</option>' + rafs.map(r => `<option>${esc(r)}</option>`).join('');
  $('raf').value = rafs.includes(cur) ? cur : '';
  render();
}

function updateProgress() {
  const n = items.length, c = items.filter(isDone).length;
  $('prog').textContent = `${c}/${n}  (%${n ? Math.round(c * 100 / n) : 0})`;
  $('bar').firstElementChild.style.width = (n ? c * 100 / n : 0) + '%';
}

function matches(it) {
  const q = $('search').value.trim().toLocaleLowerCase('tr');
  const rf = $('raf').value;
  if (rf && (it.r || '(rafsız)') !== rf) return false;
  if (filter === 'todo' && isDone(it)) return false;
  if (filter === 'diff' && !isDiff(it)) return false;
  if (filter === 'flag' && !it.t) return false;
  if (q && !(it.k.toLocaleLowerCase('tr').includes(q) || (it.a || '').toLocaleLowerCase('tr').includes(q))) return false;
  return true;
}

function render() {
  const list = $('list');
  const vis = items.filter(matches);
  let html = '', lastShelf = null;
  const shelfStats = {};
  items.forEach(it => { const r = it.r || '(rafsız)'; const s = shelfStats[r] || (shelfStats[r] = {n: 0, c: 0}); s.n++; if (isDone(it)) s.c++; });
  for (const it of vis) {
    const r = it.r || '(rafsız)';
    if (r !== lastShelf) {
      html += `<div class="shelf" data-shelf="${esc(r)}"><span>📍 ${esc(r)}</span><span class="sc">${shelfStats[r].c}/${shelfStats[r].n}</span></div>`;
      lastShelf = r;
    }
    html += `<div class="${rowClass(it)}" data-k="${esc(it.k)}">
      <div class="info"><div class="code">${esc(it.k)}</div><div class="name">${esc(it.a)}</div>
      <div class="sys">Sistem: <b>${it.s == null ? '-' : esc(it.s)}</b> ${esc(it.u)}</div></div>
      <button class="fl ${it.t ? 'on' : ''}" tabindex="-1">⚑</button>
      <input class="qty" type="text" inputmode="decimal" enterkeyhint="next" value="${isDone(it) ? esc(it.c) : ''}" placeholder="?"></div>`;
  }
  list.innerHTML = html;
  $('empty').style.display = vis.length ? 'none' : 'block';
  updateProgress();
  const th = $('top').offsetHeight;
  document.documentElement.style.setProperty('--th', th + 'px');
}

const byKey = new Map();
function find(k) { return items.find(x => x.k === k); }

const saveTimers = {};
function onQty(inp) {
  const row = inp.closest('.item'); const it = find(row.dataset.k);
  const v = inp.value.trim().replace(',', '.');
  if (v === '') delete it.c;
  else if (!isNaN(Number(v))) it.c = Number(v);
  else { inp.value = isDone(it) ? it.c : ''; return; }
  row.className = rowClass(it);
  clearTimeout(saveTimers[it.k]);
  saveTimers[it.k] = setTimeout(() => saveItem(it), 200);
  updateProgress();
  const sh = row.previousElementSibling;
  // raf sayaç güncelle
  let s = row; while (s && !s.classList.contains('shelf')) s = s.previousElementSibling;
  if (s) {
    const r = s.dataset.shelf; const grp = items.filter(x => (x.r || '(rafsız)') === r);
    s.querySelector('.sc').textContent = `${grp.filter(isDone).length}/${grp.length}`;
  }
}

$('list').addEventListener('input', e => { if (e.target.classList.contains('qty')) onQty(e.target); });
$('list').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('qty')) {
    e.preventDefault();
    let nx = e.target.closest('.item').nextElementSibling;
    while (nx && !nx.classList.contains('item')) nx = nx.nextElementSibling;
    if (nx) { nx.querySelector('.qty').focus(); nx.scrollIntoView({block: 'center'}); } else e.target.blur();
  }
});
$('list').addEventListener('focusin', e => { if (e.target.classList.contains('qty')) e.target.select(); });
$('list').addEventListener('click', e => {
  if (e.target.classList.contains('fl')) {
    const row = e.target.closest('.item'); const it = find(row.dataset.k);
    it.t = !it.t; if (!it.t) delete it.t;
    e.target.classList.toggle('on', !!it.t); row.className = rowClass(it);
    saveItem(it);
  }
});

let st;
$('search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(render, 150); });
$('raf').addEventListener('change', render);
document.querySelectorAll('.chip').forEach(c => c.onclick = () => {
  document.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
  c.classList.add('on'); filter = c.dataset.f; render();
});

// ---------- Menü / dosya ----------
$('hdrBtn').onclick = () => $('menu').style.display = 'block';
$('menu').onclick = e => { if (e.target === $('menu')) $('menu').style.display = 'none'; };
$('mLoad').onclick = () => {
  $('menu').style.display = 'none';
  if (meta && !confirm('Mevcut sayım silinecek ve yeni dosya yüklenecek. Önce sonucu gönderdiysen devam et. Devam?')) return;
  $('file').click();
};
$('mReset').onclick = async () => {
  $('menu').style.display = 'none';
  if (!confirm('Tüm girilen sayımlar silinsin mi?')) return;
  for (const it of items) { delete it.c; delete it.t; await saveItem(it); }
  render();
};
$('file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { await importData(JSON.parse(await f.text())); show(); }
  catch (err) { alert('Dosya yüklenemedi: ' + err.message); }
};

$('mShare').onclick = async () => {
  $('menu').style.display = 'none';
  const out = {v: 1, sayimId: meta.sayimId, kisi: meta.kisi, items};
  const name = 'sonuc_' + meta.kisi.toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]+/gi, '_') + '.json';
  const file = new File([JSON.stringify(out)], name, {type: 'application/json'});
  try {
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: name}); return; }
  } catch (err) { if (err.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
};

// ---------- Başlat ----------
(async () => {
  db = await openDB();
  await loadAll();
  show();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
})();
