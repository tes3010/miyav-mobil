// Excel'den oyuncu yükleme
import { db } from './db.js';
import { store } from './store.js';
import { $, esc, norm, toast, errMsg, openModal } from './util.js';

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
let xlsxLoading = null;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = XLSX_URL; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Excel okuyucu yüklenemedi (internet?)'));
    document.head.append(s);
  });
  return xlsxLoading;
}

const FIELDS = [
  { key: 'full_name', label: 'Ad Soyad', guess: ['ad soyad', 'adı soyadı', 'ad', 'isim', 'oyuncu', 'adsoyad'] },
  { key: 'jersey_no', label: 'Forma No', guess: ['forma no', 'forma', 'no', 'numara', 'forma numarası'] },
  { key: 'position', label: 'Mevki', guess: ['mevki', 'pozisyon', 'mevkii'] },
  { key: 'team', label: 'Takım', guess: ['takım', 'takim', 'grup', 'kategori'] },
];

const POS_MAP = { 'pasor': 'Pasör', 'pasör': 'Pasör', 'smaçör': 'Smaçör', 'smacor': 'Smaçör', 'orta': 'Orta oyuncu',
  'orta oyuncu': 'Orta oyuncu', 'libero': 'Libero', 'pasör çaprazı': 'Pasör çaprazı', 'çapraz': 'Pasör çaprazı' };

function findTeam(val) {
  const v = norm(val).replace(/\s/g, '');
  if (!v) return null;
  return store.teams.find(t => norm(t.name).replace(/\s/g, '') === v) || null;
}

export async function downloadTemplate() {
  const XLSX = await loadXLSX();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Ad Soyad', 'Forma No', 'Mevki', 'Takım'],
    ['Örnek Oyuncu', 7, 'Smaçör', store.teams[0]?.name || 'Midi A'],
  ]);
  ws['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 14 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Oyuncular');
  XLSX.writeFile(wb, 'oyuncu-listesi-sablon.xlsx');
}

export function openImport(defaultTeamId) {
  const body = document.createElement('div');
  body.className = 'stack';
  body.innerHTML = `
    <p class="muted small">Sütunlar: <b>Ad Soyad, Forma No, Mevki, Takım</b>. Takım sütunu yoksa herkes seçili takıma eklenir.
      <button class="btn btn-sm btn-ghost" type="button" id="tpl">⬇ Şablon indir</button></p>
    <label class="drop" for="xfile">📄 Excel dosyasını seç<br><span class="muted small">.xlsx, .xls veya .csv</span>
      <input id="xfile" type="file" accept=".xlsx,.xls,.csv" hidden></label>
    <div id="xprev"></div>`;
  let rowsToImport = [];

  const close = openModal({
    title: "Excel'den oyuncu yükle", body, wide: true,
    actions: [
      { label: 'Vazgeç', cls: 'btn-ghost' },
      { label: 'Yükle', cls: 'btn-primary', onClick: async (c) => {
        if (!rowsToImport.length) { toast('Yüklenecek oyuncu yok', 'err'); return; }
        try {
          await db.insert('players', rowsToImport);
          await store.loadPlayers();
          c(); toast(`${rowsToImport.length} oyuncu eklendi ✓`);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (e) { toast(errMsg(e), 'err'); }
      } },
    ],
  });
  void close;
  $('#tpl', body).onclick = () => downloadTemplate().catch(e => toast(errMsg(e), 'err'));

  $('#xfile', body).onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer());
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
        .filter(r => r.some(c => String(c).trim() !== ''));
      if (aoa.length < 2) { $('#xprev', body).innerHTML = '<p class="muted">Dosyada veri bulunamadı.</p>'; return; }
      const headers = aoa[0].map(String);
      const map = {};
      for (const f of FIELDS) {
        const idx = headers.findIndex(h => f.guess.includes(norm(h)));
        map[f.key] = idx;
      }
      if (map.full_name < 0) map.full_name = 0;
      renderPreview(headers, aoa.slice(1), map);
    } catch (err) { toast(errMsg(err), 'err'); }
  };

  function renderPreview(headers, data, map) {
    const opts = (sel) => `<option value="-1">— yok —</option>` + headers.map((h, i) =>
      `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h || `Sütun ${i + 1}`)}</option>`).join('');
    const defTeam = store.team(defaultTeamId);

    rowsToImport = [];
    const preview = data.map(r => {
      const get = (k) => (map[k] >= 0 ? String(r[map[k]] ?? '').trim() : '');
      const name = get('full_name');
      const teamVal = get('team');
      const team = teamVal ? findTeam(teamVal) : defTeam;
      const noRaw = get('jersey_no').replace(/\D/g, '');
      const posRaw = get('position');
      const pos = POS_MAP[norm(posRaw)] || posRaw || null;
      const dup = team && store.players.some(p => p.team_id === team.id && norm(p.full_name) === norm(name));
      let status = 'ok';
      if (!name) status = 'Ad yok';
      else if (!team) status = `Takım tanınmadı: "${teamVal}"`;
      else if (dup) status = 'Zaten kayıtlı';
      if (status === 'ok') rowsToImport.push({ full_name: name, jersey_no: noRaw ? Number(noRaw) : null, position: pos, team_id: team.id });
      return { name, no: noRaw, pos, team, status };
    });

    $('#xprev', body).innerHTML = `
      <div class="form-grid">${FIELDS.map(f => `<label>${f.label}<select data-map="${f.key}">${opts(map[f.key])}</select></label>`).join('')}</div>
      <p><b>${rowsToImport.length}</b> oyuncu eklenecek${preview.length - rowsToImport.length ? `, <b>${preview.length - rowsToImport.length}</b> satır atlanacak` : ''}.</p>
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Ad Soyad</th><th class="c">No</th><th>Mevki</th><th>Takım</th><th>Durum</th></tr></thead>
        <tbody>${preview.map(p => `<tr ${p.status !== 'ok' ? 'style="opacity:.55"' : ''}>
          <td>${esc(p.name)}</td><td class="c">${esc(p.no)}</td><td>${esc(p.pos || '')}</td>
          <td>${esc(p.team?.name || '')}</td><td>${p.status === 'ok' ? '✅' : '⚠️ ' + esc(p.status)}</td></tr>`).join('')}</tbody>
      </table></div>`;
    body.querySelectorAll('[data-map]').forEach(s => s.onchange = () => {
      map[s.dataset.map] = Number(s.value); renderPreview(headers, data, map);
    });
  }
}
