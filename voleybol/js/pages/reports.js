// Raporlar: devamsızlık (günlük / haftalık / aylık / özel), yazdırma ve Excel çıktısı
import { db } from '../db.js';
import { store } from '../store.js';
import { $, $$, esc, isoDate, addDays, weekStart, monthStart, monthEnd, fmtDate, fmtShort, dayShort,
  monthName, toast, errMsg } from '../util.js';
import { STATUS, STATUSES, summarize, rateClass } from '../attendance.js';
import { loadXLSX } from '../import.js';
import { CLUB_NAME } from '../config.js';

const PERIODS = [
  { key: 'gun', label: 'Günlük' },
  { key: 'hafta', label: 'Haftalık' },
  { key: 'ay', label: 'Aylık' },
  { key: 'ozel', label: 'Özel aralık' },
];

const state = { period: 'hafta', anchor: isoDate(), from: null, to: null, team: 'all' };

function range() {
  const a = state.anchor;
  switch (state.period) {
    case 'gun': return [a, a];
    case 'hafta': { const s = weekStart(a); return [s, addDays(s, 6)]; }
    case 'ay': return [monthStart(a), monthEnd(a)];
    default: return [state.from || addDays(a, -30), state.to || a];
  }
}
function rangeLabel(from, to) {
  if (state.period === 'gun') return fmtDate(from, { day: true });
  if (state.period === 'ay') return monthName(from);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}
function shift(dir) {
  const a = state.anchor;
  if (state.period === 'gun') state.anchor = addDays(a, dir);
  else if (state.period === 'hafta') state.anchor = addDays(a, 7 * dir);
  else if (state.period === 'ay') { const d = new Date(+a.slice(0, 4), +a.slice(5, 7) - 1 + dir, 1); state.anchor = isoDate(d); }
}

export async function render(view, _p, { setTitle }) {
  setTitle('Raporlar');
  const [from, to] = range();
  const teams = state.team === 'all' ? store.teams : store.teams.filter(t => t.id === state.team);
  const att = await db.select('attendance', { gte: { date: from }, lte: { date: to } });

  const sections = teams.map(t => buildTeam(t, att.filter(a => a.team_id === t.id)));

  view.innerHTML = `
    <div class="stack">
      <div class="tabs no-print"><a class="active" href="#/raporlar">Devamsızlık</a>
        <a href="#/raporlar" onclick="return false" style="opacity:.45" title="4. aşamada">Performans (yakında)</a></div>
      <div class="card no-print">
        <div class="row" style="margin-bottom:10px">${PERIODS.map(p =>
          `<button class="chip ${p.key === state.period ? 'active' : ''}" data-period="${p.key}">${p.label}</button>`).join('')}</div>
        <div class="form-grid">
          <label>Takım<select id="r-team">
            <option value="all">Tüm takımlar</option>
            ${store.teams.map(t => `<option value="${t.id}" ${t.id === state.team ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
          </select></label>
          ${state.period === 'ozel' ? `
            <label>Başlangıç<input type="date" id="r-from" value="${from}"></label>
            <label>Bitiş<input type="date" id="r-to" value="${to}"></label>` : `
            <label>Tarih<input type="date" id="r-anchor" value="${state.anchor}"></label>`}
        </div>
        ${state.period === 'ozel' ? '' : `
        <div class="row" style="justify-content:center;margin-top:10px;flex-wrap:nowrap">
          <button class="icon-btn" id="r-prev" aria-label="Önceki">◀</button>
          <b style="text-align:center">${rangeLabel(from, to)}</b>
          <button class="icon-btn" id="r-next" aria-label="Sonraki">▶</button>
        </div>`}
        <div class="row" style="margin-top:10px;justify-content:flex-end">
          <button class="btn btn-sm" id="r-xlsx">⬇ Excel</button>
          <button class="btn btn-sm btn-primary" id="r-print">🖨 Yazdır / PDF</button>
        </div>
      </div>

      <div class="print-only print-head">
        <img src="logo.jpg" alt="">
        <div><b style="font-size:16pt">${esc(CLUB_NAME)} — Devamsızlık Raporu</b><br>
          ${rangeLabel(from, to)} · ${state.team === 'all' ? 'Tüm takımlar' : esc(teams[0]?.name)}</div>
      </div>

      ${sections.map(s => s.html).join('') || '<div class="card empty">Takım yok.</div>'}
    </div>`;

  $$('[data-period]', view).forEach(b => b.onclick = () => { state.period = b.dataset.period; rerender(view, setTitle); });
  $('#r-team', view).onchange = (e) => { state.team = e.target.value; rerender(view, setTitle); };
  $('#r-prev', view)?.addEventListener('click', () => { shift(-1); rerender(view, setTitle); });
  $('#r-next', view)?.addEventListener('click', () => { shift(1); rerender(view, setTitle); });
  $('#r-anchor', view)?.addEventListener('change', (e) => { if (e.target.value) { state.anchor = e.target.value; rerender(view, setTitle); } });
  $('#r-from', view)?.addEventListener('change', (e) => { state.from = e.target.value; rerender(view, setTitle); });
  $('#r-to', view)?.addEventListener('change', (e) => { state.to = e.target.value; rerender(view, setTitle); });
  $('#r-print', view).onclick = () => window.print();
  $('#r-xlsx', view).onclick = () => exportXlsx(sections, from, to).catch(e => toast(errMsg(e), 'err'));
}

function rerender(view, setTitle) { render(view, {}, { setTitle }); }

function buildTeam(team, rows) {
  // Yoklamada pasif yapılmış ama bu dönemde kaydı olan oyuncular da raporda görünsün
  const ids = new Set(rows.map(r => r.player_id));
  const players = store.teamPlayers(team.id, { includeInactive: true }).filter(p => p.active !== false || ids.has(p.id));
  const dates = [...new Set(rows.map(r => r.date))].sort();
  const byKey = new Map(rows.map(r => [`${r.player_id}|${r.date}`, r.status]));
  const teamSum = summarize(rows);

  const perPlayer = players.map(p => ({ p, s: summarize(rows.filter(r => r.player_id === p.id)) }));
  const showGrid = dates.length > 0 && dates.length <= 31;

  const html = `
    <div class="card" style="break-inside:avoid">
      <div class="card-head">
        <h3>${esc(team.name)}</h3>
        <div class="row small muted">
          <span>${dates.length} antrenman</span>
          <span>Ortalama katılım <span class="rate ${rateClass(teamSum.rate)}">${teamSum.rate == null ? '–' : '%' + teamSum.rate}</span></span>
        </div>
      </div>
      ${!dates.length ? '<p class="muted" style="margin:0">Bu dönemde yoklama kaydı yok.</p>' : `
      <div class="table-wrap"><table class="t">
        <thead><tr>
          <th class="sticky">Oyuncu</th>
          ${showGrid ? dates.map(d => `<th class="c" title="${fmtDate(d)}">${fmtShort(d)}<br><span style="font-weight:500">${dayShort(d)}</span></th>`).join('') : ''}
          <th class="c">Geldi</th><th class="c">Geç</th><th class="c">İzinli</th><th class="c">Sakat</th><th class="c">Gelmedi</th><th class="c">Katılım</th>
        </tr></thead>
        <tbody>${perPlayer.map(({ p, s }) => `<tr>
          <td class="sticky"><b>${p.jersey_no != null ? p.jersey_no + ' · ' : ''}</b>${esc(p.full_name)}</td>
          ${showGrid ? dates.map(d => { const st = byKey.get(`${p.id}|${d}`);
            return `<td class="c">${st ? `<span class="cell-s ${STATUS[st].cls}" title="${STATUS[st].label}">${STATUS[st].short}</span>` : '<span class="muted">·</span>'}</td>`; }).join('') : ''}
          <td class="c num">${s.geldi}</td><td class="c num">${s.gec}</td><td class="c num">${s.izinli}</td>
          <td class="c num">${s.sakat}</td><td class="c num">${s.gelmedi}</td>
          <td class="c"><span class="rate ${rateClass(s.rate)}">${s.rate == null ? '–' : '%' + s.rate}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="small muted" style="margin:10px 0 0">${STATUSES.map(s => `<span class="cell-s ${s.cls}" style="width:20px;height:20px;font-size:11px">${s.short}</span> ${s.label}`).join(' &nbsp; ')}</p>`}
    </div>`;
  return { team, dates, byKey, perPlayer, html };
}

async function exportXlsx(sections, from, to) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const s of sections) {
    const head = ['Forma', 'Oyuncu', ...s.dates.map(d => fmtShort(d)), 'Geldi', 'Geç', 'İzinli', 'Sakat', 'Gelmedi', 'Katılım %'];
    const body = s.perPlayer.map(({ p, s: c }) => [
      p.jersey_no ?? '', p.full_name,
      ...s.dates.map(d => STATUS[s.byKey.get(`${p.id}|${d}`)]?.label || ''),
      c.geldi, c.gec, c.izinli, c.sakat, c.gelmedi, c.rate ?? '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([[`${CLUB_NAME} — ${s.team.name} devamsızlık (${fmtDate(from)} – ${fmtDate(to)})`], [], head, ...body]);
    ws['!cols'] = [{ wch: 6 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, ws, s.team.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `devamsizlik_${from}_${to}.xlsx`);
}
