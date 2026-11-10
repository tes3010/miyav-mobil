// Oyuncu karnesi
import { db } from '../db.js';
import { store } from '../store.js';
import { $, esc, fmtDate, isoDate, monthStart } from '../util.js';
import { STATUS, STATUSES, summarize, rateClass } from '../attendance.js';
import { playerForm } from './team.js';
import { playerMatchStats } from './scoreboard.js';

export async function render(view, { id }, { setTitle }) {
  const p = store.players.find(x => x.id === id);
  if (!p) { setTitle('Oyuncu'); view.innerHTML = '<div class="card empty"><b>Oyuncu bulunamadı</b></div>'; return; }
  const team = store.team(p.team_id);
  setTitle(p.full_name);

  const [att, matches] = await Promise.all([
    db.select('attendance', { eq: { player_id: id }, order: 'date desc' }),
    db.select('matches', { eq: { finished: true } }),
  ]);
  const all = summarize(att);
  const month = summarize(att.filter(a => a.date >= monthStart(isoDate())));
  const ms = playerMatchStats(matches, id);

  const statBlock = (title, s) => `
    <div class="card">
      <div class="card-head"><h3>${title}</h3><span class="rate ${rateClass(s.rate)}" style="font-size:26px">${s.rate == null ? '–' : '%' + s.rate}</span></div>
      <div class="att-summary">${STATUSES.map(st => `<span class="sbox ${st.cls}">${st.label}: ${s[st.key] || 0}</span>`).join('')}</div>
    </div>`;

  view.innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="row">
          <span class="jersey" style="width:56px;height:56px;font-size:28px">${p.jersey_no ?? '–'}</span>
          <div class="pname"><b style="font-size:20px">${esc(p.full_name)}</b>
            <small>${esc(team?.name || '')} · ${esc(p.position || 'Mevki yok')}${p.active === false ? ' · pasif' : ''}</small></div>
          <button class="btn btn-sm" id="edit">✎ Düzenle</button>
        </div>
      </div>
      <div class="grid grid-2">
        ${statBlock('Bu ay katılım', month)}
        ${statBlock('Tüm zamanlar katılım', all)}
      </div>
      <div class="card">
        <div class="card-head"><h3>Maç istatistikleri</h3><span class="muted small">${ms.matches} maç</span></div>
        ${ms.matches ? `<div class="table-wrap"><table class="t"><thead><tr>
            <th class="c">Servis</th><th class="c">Servis %</th><th class="c">As</th><th class="c">Smaç</th><th class="c">Blok</th><th class="c">Hata</th></tr></thead>
          <tbody><tr>
            <td class="c num">${ms.serveIn}/${ms.serveTotal}</td>
            <td class="c"><span class="rate ${rateClass(ms.servePct)}">${ms.servePct == null ? '–' : '%' + ms.servePct}</span></td>
            <td class="c num">${ms.ace}</td><td class="c num">${ms.kill}</td><td class="c num">${ms.block}</td><td class="c num">${ms.error}</td>
          </tr></tbody></table></div>` : '<p class="muted">Canlı istatistik tutulan maç yok.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h3>Teknik ve fiziksel</h3></div>
        <p class="muted">Teknik yüzdeler (4. aşama) ve antropometrik ölçümler (5. aşama) eklenince burada görünecek.</p>
      </div>
      <div class="card">
        <div class="card-head"><h3>Yoklama geçmişi</h3></div>
        ${att.length ? `<ul class="plist">${att.slice(0, 40).map(a => `
          <li><span class="pname">${fmtDate(a.date, { day: true })}</span><span class="sbox ${STATUS[a.status].cls}">${STATUS[a.status].label}</span></li>`).join('')}</ul>`
          : '<p class="muted">Kayıt yok.</p>'}
      </div>
    </div>`;
  $('#edit', view).onclick = () => playerForm(p);
}
