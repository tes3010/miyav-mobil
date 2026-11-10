// Takım sayfası: Oyuncular | Yoklama | Teknik | Fiziksel
import { db } from '../db.js';
import { store } from '../store.js';
import { $, $$, esc, isoDate, addDays, fmtDate, toast, errMsg, openModal, confirmBox } from '../util.js';
import { STATUSES, summarize, rateClass } from '../attendance.js';
import { openImport } from '../import.js';

export const POSITIONS = ['Pasör', 'Smaçör', 'Orta oyuncu', 'Pasör çaprazı', 'Libero'];

const TABS = [
  { key: 'oyuncular', label: 'Oyuncular' },
  { key: 'yoklama', label: 'Yoklama' },
  { key: 'teknik', label: 'Teknik' },
  { key: 'fiziksel', label: 'Fiziksel' },
];

export async function render(view, { id, tab }, { setTitle }) {
  const team = store.team(id);
  if (!team) {
    setTitle('Takımlar');
    view.innerHTML = '<div class="card empty"><b>Takım bulunamadı</b>Takımlar yükleniyor olabilir, sayfayı yenileyin.</div>';
    return;
  }
  setTitle(team.name);
  view.innerHTML = `
    <div class="chips no-print">${store.teams.map(t =>
      `<a class="chip ${t.id === id ? 'active' : ''}" href="#/takim/${t.id}/${tab}">${esc(t.name)}</a>`).join('')}</div>
    <div class="tabs no-print" role="tablist">${TABS.map(t =>
      `<a role="tab" class="${t.key === tab ? 'active' : ''}" href="#/takim/${id}/${t.key}">${t.label}</a>`).join('')}</div>
    <div id="tab-body"></div>`;
  const body = $('#tab-body', view);
  if (tab === 'yoklama') return renderAttendance(body, team);
  if (tab === 'teknik') return renderSoon(body, '🎯', 'Teknik çalışmalar', 'Servis, manşet, pas, plase ve smaç; nereden → nereye, teknik, deneme / hata / isabet. 4. aşamada geliyor.');
  if (tab === 'fiziksel') return renderSoon(body, '📏', 'Fiziksel ölçümler', 'Boy, kilo, oturma boyu, kulaç, vücut kitle indeksi ve büyüme grafiği. 5. aşamada geliyor.');
  return renderPlayers(body, team);
}

function renderSoon(el, ico, title, text) {
  el.innerHTML = `<div class="card soon"><div class="ico">${ico}</div><h3>${title}</h3><p class="muted">${text}</p></div>`;
}

// ================================================================ OYUNCULAR
async function renderPlayers(el, team) {
  const from = addDays(isoDate(), -30);
  const att = await db.select('attendance', { eq: { team_id: team.id }, gte: { date: from } });
  const players = store.teamPlayers(team.id, { includeInactive: true });

  const list = players.length ? `<ul class="plist">${players.map(p => {
    const s = summarize(att.filter(a => a.player_id === p.id));
    return `<li ${p.active === false ? 'style="opacity:.5"' : ''}>
      <span class="jersey ${p.jersey_no == null ? 'empty-no' : ''}">${p.jersey_no ?? '–'}</span>
      <a class="pname" href="#/oyuncu/${p.id}"><b>${esc(p.full_name)}</b>
        <small>${esc(p.position || 'Mevki yok')}${p.active === false ? ' · pasif' : ''}</small></a>
      <span class="rate ${rateClass(s.rate)}" title="Son 30 gün katılım">${s.rate == null ? '' : '%' + s.rate}</span>
      <button class="icon-btn" data-edit="${p.id}" aria-label="Düzenle">✎</button>
    </li>`;
  }).join('')}</ul>` : `<div class="empty"><b>Bu takımda henüz oyuncu yok</b>Tek tek ekleyebilir ya da Excel listesinden yükleyebilirsin.</div>`;

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h3>${players.filter(p => p.active !== false).length} oyuncu</h3>
        <div class="row">
          <button class="btn btn-sm" id="btn-import">📄 Excel'den yükle</button>
          <button class="btn btn-sm btn-primary" id="btn-add">+ Oyuncu</button>
        </div>
      </div>
      ${list}
    </div>`;

  $('#btn-add', el).onclick = () => playerForm({ team_id: team.id });
  $('#btn-import', el).onclick = () => openImport(team.id);
  $$('[data-edit]', el).forEach(b => b.onclick = () => playerForm(store.players.find(p => p.id === b.dataset.edit)));
}

export function playerForm(p) {
  const isNew = !p.id;
  const body = document.createElement('form');
  body.className = 'stack';
  body.innerHTML = `
    <label>Ad Soyad<input name="full_name" required value="${esc(p.full_name || '')}"></label>
    <div class="form-grid">
      <label>Forma No<input name="jersey_no" type="number" inputmode="numeric" min="0" max="99" value="${p.jersey_no ?? ''}"></label>
      <label>Mevki<select name="position"><option value="">—</option>${POSITIONS.map(x =>
        `<option ${p.position === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
    <label>Takım<select name="team_id">${store.teams.map(t =>
      `<option value="${t.id}" ${t.id === p.team_id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    ${isNew ? '' : `<label style="flex-direction:row;align-items:center;gap:10px"><input type="checkbox" name="active" style="width:22px;min-height:22px" ${p.active !== false ? 'checked' : ''}> Aktif oyuncu (kulüpten ayrıldıysa işareti kaldır)</label>`}
  `;
  const save = async (close) => {
    const f = body;
    if (!f.full_name.value.trim()) { f.full_name.focus(); return; }
    const row = {
      full_name: f.full_name.value.trim(),
      jersey_no: f.jersey_no.value === '' ? null : Number(f.jersey_no.value),
      position: f.position.value || null,
      team_id: f.team_id.value,
    };
    if (!isNew) row.active = f.active.checked;
    try {
      if (isNew) await db.insert('players', row); else await db.update('players', p.id, row);
      await store.loadPlayers();
      close();
      toast(isNew ? 'Oyuncu eklendi' : 'Kaydedildi');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) { toast(errMsg(e), 'err'); }
  };
  body.onsubmit = (e) => { e.preventDefault(); };
  const actions = [];
  if (!isNew) actions.push({ label: 'Sil', cls: 'btn-ghost', onClick: async (close) => {
    if (!await confirmBox(`${p.full_name} silinsin mi? Yoklama ve istatistik kayıtları da silinir. Sadece ayrıldıysa "Aktif" işaretini kaldırman yeterli.`, { ok: 'Sil', danger: true })) return;
    try { await db.remove('players', p.id); await store.loadPlayers(); close(); toast('Silindi');
      window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { toast(errMsg(e), 'err'); }
  } });
  actions.push({ label: 'Vazgeç', cls: 'btn-ghost' }, { label: 'Kaydet', cls: 'btn-primary', onClick: save });
  openModal({ title: isNew ? 'Yeni oyuncu' : 'Oyuncuyu düzenle', body, actions });
}

// ================================================================ YOKLAMA
let attDate = isoDate();

async function renderAttendance(el, team) {
  const players = store.teamPlayers(team.id);
  if (!players.length) {
    el.innerHTML = `<div class="card empty"><b>Önce oyuncu eklemelisin</b><a class="btn btn-primary" style="margin-top:12px" href="#/takim/${team.id}/oyuncular">Oyunculara git</a></div>`;
    return;
  }
  const existing = await db.select('attendance', { eq: { team_id: team.id, date: attDate } });
  const state = Object.fromEntries(existing.map(r => [r.player_id, r.status]));
  const original = { ...state };

  el.innerHTML = `
    <div class="card">
      <div class="att-head">
        <button class="icon-btn" id="d-prev" aria-label="Önceki gün">◀</button>
        <input type="date" id="d-pick" value="${attDate}" max="${isoDate()}">
        <button class="icon-btn" id="d-next" aria-label="Sonraki gün" ${attDate >= isoDate() ? 'disabled' : ''}>▶</button>
        <span class="muted small" id="d-label">${fmtDate(attDate, { day: true })}</span>
        <span class="spacer"></span>
        <button class="btn btn-sm" id="all-in">✓ Hepsi geldi</button>
      </div>
      <div class="att-summary" id="att-sum"></div>
      <div id="att-list" style="margin-top:6px">${players.map(p => `
        <div class="att-row" data-p="${p.id}">
          <div class="att-who"><span class="jersey ${p.jersey_no == null ? 'empty-no' : ''}">${p.jersey_no ?? '–'}</span><b>${esc(p.full_name)}</b></div>
          <div class="seg">${STATUSES.map(s => `<button type="button" data-s="${s.key}">${s.key === 'sakat' ? 'Sakat' : s.label}</button>`).join('')}</div>
        </div>`).join('')}</div>
    </div>
    <div class="sticky-save"><button class="btn btn-primary btn-block" id="att-save">Yoklamayı kaydet</button></div>`;

  const paint = () => {
    $$('.att-row', el).forEach(row => {
      const st = state[row.dataset.p];
      $$('.seg button', row).forEach(b => b.classList.toggle('on', b.dataset.s === st));
    });
    const c = { none: 0 };
    for (const p of players) { const s = state[p.id]; if (s) c[s] = (c[s] || 0) + 1; else c.none++; }
    $('#att-sum', el).innerHTML = STATUSES.filter(s => c[s.key]).map(s =>
      `<span class="sbox ${s.cls}">${s.label}: ${c[s.key]}</span>`).join('') +
      (c.none ? `<span class="sbox s-none">İşaretlenmedi: ${c.none}</span>` : '');
  };
  paint();

  $('#att-list', el).addEventListener('click', (e) => {
    const b = e.target.closest('.seg button'); if (!b) return;
    const pid = b.closest('.att-row').dataset.p;
    state[pid] = state[pid] === b.dataset.s ? undefined : b.dataset.s;   // tekrar dokununca kaldır
    paint();
  });
  $('#all-in', el).onclick = () => { for (const p of players) if (!state[p.id]) state[p.id] = 'geldi'; paint(); };

  const go = (d) => { attDate = d; renderAttendance(el, team); };
  $('#d-prev', el).onclick = () => go(addDays(attDate, -1));
  $('#d-next', el).onclick = () => go(addDays(attDate, 1));
  $('#d-pick', el).onchange = (e) => e.target.value && go(e.target.value);

  $('#att-save', el).onclick = async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const rows = players.filter(p => state[p.id]).map(p => ({
        team_id: team.id, player_id: p.id, date: attDate, status: state[p.id],
      }));
      if (rows.length) await db.upsert('attendance', rows, 'player_id,date');
      for (const p of players) {
        if (original[p.id] && !state[p.id]) await db.removeWhere('attendance', { player_id: p.id, date: attDate });
      }
      Object.assign(original, state);
      const unmarked = players.filter(p => !state[p.id]).length;
      toast(unmarked ? `Kaydedildi (${unmarked} oyuncu işaretlenmedi)` : 'Yoklama kaydedildi ✓');
    } catch (err) { toast(errMsg(err), 'err'); }
    btn.disabled = false;
  };
}
