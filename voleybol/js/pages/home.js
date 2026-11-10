// Ana sayfa: takım kartları, son yoklamalar, son maçlar
import { db } from '../db.js';
import { store } from '../store.js';
import { esc, isoDate, addDays, fmtDate, fmtShort } from '../util.js';
import { summarize, rateClass } from '../attendance.js';

export async function render(view, _p, { setTitle }) {
  setTitle('Ana Sayfa');
  const today = isoDate();
  const from = addDays(today, -30);
  const [att, matches] = await Promise.all([
    db.select('attendance', { gte: { date: from } }),
    db.select('matches', { order: 'created_at desc' }),
  ]);

  const cards = store.teams.map(t => {
    const players = store.teamPlayers(t.id);
    const rows = att.filter(a => a.team_id === t.id);
    const s = summarize(rows);
    const lastDate = rows.map(r => r.date).sort().pop();
    const todayDone = rows.some(r => r.date === today);
    return `
      <a class="team-card ${t.category}" href="#/takim/${t.id}">
        <span class="badge b-${t.category}">${t.category === 'midi' ? 'MİDİ' : 'MİNİ'}</span>
        <h3>${esc(t.name)}</h3>
        <div class="stat-line">
          <span><b>${players.length}</b>oyuncu</span>
          <span><b class="rate ${rateClass(s.rate)}">${s.rate == null ? '–' : '%' + s.rate}</b>katılım (30 gün)</span>
        </div>
        <div class="small muted" style="margin-top:8px">
          ${todayDone ? '✅ Bugün yoklama alındı' : lastDate ? `Son yoklama: ${fmtShort(lastDate)}` : 'Henüz yoklama yok'}
        </div>
      </a>`;
  }).join('');

  const recent = matches.filter(m => m.finished).slice(0, 5);
  const matchList = recent.length ? `
    <ul class="plist">${recent.map(m => {
      const win = m.home_sets > m.away_sets;
      return `<li>
        <span class="jersey" style="background:${win ? 'var(--ok)' : 'var(--bad)'}">${win ? 'G' : 'M'}</span>
        <span class="pname"><b>${esc(m.home_name)} – ${esc(m.away_name)}</b>
          <small>${fmtDate(m.date)} · ${(m.sets || []).map(s => `${s.home}-${s.away}`).join(', ')}</small></span>
        <span class="num" style="font-size:24px;font-weight:700">${m.home_sets}-${m.away_sets}</span>
      </li>`;
    }).join('')}</ul>` : '<div class="empty">Henüz kayıtlı maç yok.</div>';

  view.innerHTML = `
    <div class="stack">
      <div class="row" style="justify-content:space-between">
        <div>
          <h1 style="font-size:24px">Merhaba hocam 👋</h1>
          <p class="muted" style="margin:4px 0 0">${fmtDate(today, { day: true })}</p>
        </div>
        <a class="btn btn-primary" href="#/skorbord">🏐 Maç başlat</a>
      </div>
      <div class="grid grid-teams">${cards}</div>
      <div class="card">
        <div class="card-head"><h3>Son maçlar</h3><a class="btn btn-sm btn-ghost" href="#/skorbord">Skorbord →</a></div>
        ${matchList}
      </div>
    </div>`;
}
