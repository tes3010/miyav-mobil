// Skorbord + mola zamanlayıcısı + basit canlı istatistik
// Maç, olay listesi (events) olarak tutulur; skor, setler, servis ve molalar bu listeden hesaplanır.
// Böylece "geri al" her şeyi (skor + istatistik) tutarlı biçimde geri alır.
import { db } from '../db.js';
import { store } from '../store.js';
import { $, $$, esc, isoDate, fmtDate, toast, errMsg, openModal, confirmBox, pct } from '../util.js';
import { DEFAULT_MATCH_RULES, CLUB_NAME } from '../config.js';
import { rateClass } from '../attendance.js';

const LIVE_KEY = 'abvoley-live-match';

// Canlı istatistik eylemleri. point: sayıyı kim alır (home = biz)
export const ACTIONS = [
  { key: 'srv_in',  label: 'Servis ✓',  point: null,   cls: 'a-neu' },
  { key: 'ace',     label: 'As 🔥',     point: 'home', cls: 'a-pos' },
  { key: 'srv_err', label: 'Servis ✗',  point: 'away', cls: 'a-neg' },
  { key: 'kill',    label: 'Smaç sayı', point: 'home', cls: 'a-pos' },
  { key: 'block',   label: 'Blok sayı', point: 'home', cls: 'a-pos' },
  { key: 'err',     label: 'Hata',      point: 'away', cls: 'a-neg' },
];
const ACT = Object.fromEntries(ACTIONS.map(a => [a.key, a]));

// ---------------------------------------------------------------- Kayıt (yerel)
function loadLive() { try { return JSON.parse(localStorage.getItem(LIVE_KEY)); } catch { return null; } }
function saveLive(m) { try { localStorage.setItem(LIVE_KEY, JSON.stringify(m)); } catch { /* yok say */ } }
function clearLive() { try { localStorage.removeItem(LIVE_KEY); } catch { /* yok say */ } }

export function matchRules() {
  return { ...DEFAULT_MATCH_RULES, ...(store.settings?.matchRules || {}) };
}

// ---------------------------------------------------------------- Hesaplama
export function compute(m) {
  const R = m.rules;
  const other = (s) => (s === 'home' ? 'away' : 'home');
  const st = {
    cur: { home: 0, away: 0 }, sets: [], won: { home: 0, away: 0 },
    serve: m.firstServe, setFirstServe: m.firstServe,
    to: { home: 0, away: 0 }, swapped: false, tbSwitched: false,
    finished: false, winner: null, lastNotice: null,
  };
  const decidingIdx = R.setsToWin * 2 - 2;
  for (const e of m.events) {
    st.lastNotice = null;
    if (st.finished) break;
    if (e.t === 'pt') {
      st.cur[e.side]++;
      st.serve = e.side;
      const isDeciding = st.sets.length === decidingIdx;
      const target = isDeciding ? R.tiebreakPoints : R.setPoints;
      const a = st.cur[e.side], b = st.cur[other(e.side)];
      if (a >= target && a - b >= 2) {
        st.sets.push({ home: st.cur.home, away: st.cur.away });
        st.won[e.side]++;
        st.lastNotice = { type: 'set', side: e.side, no: st.sets.length, score: { ...st.cur } };
        st.cur = { home: 0, away: 0 };
        st.to = { home: 0, away: 0 };
        if (st.won[e.side] >= R.setsToWin) { st.finished = true; st.winner = e.side; st.lastNotice.type = 'match'; continue; }
        st.swapped = !st.swapped;                       // setler arası taraf değişir
        st.setFirstServe = other(st.setFirstServe);     // sıradaki seti diğer takım başlatır
        st.serve = st.setFirstServe;
      } else if (isDeciding && !st.tbSwitched && Math.max(st.cur.home, st.cur.away) === Math.ceil(R.tiebreakPoints / 2)) {
        st.tbSwitched = true; st.swapped = !st.swapped;
        st.lastNotice = { type: 'tbswitch' };
      }
    } else if (e.t === 'to') st.to[e.side]++;
    else if (e.t === 'swap') st.swapped = !st.swapped;
    else if (e.t === 'srv') { st.serve = e.side; if (st.cur.home + st.cur.away === 0) st.setFirstServe = e.side; }
  }
  st.setNo = st.sets.length + 1;
  st.isDeciding = st.sets.length === decidingIdx;
  return st;
}

// Oyuncu bazlı maç istatistikleri (oyuncu karnesi ve maç özeti için)
export function playerMatchStats(matches, pid) {
  const c = { matches: 0, srv_in: 0, ace: 0, srv_err: 0, kill: 0, block: 0, err: 0 };
  for (const m of matches) {
    let seen = false;
    for (const e of (m.events || [])) if (e.pid === pid && e.act) { c[e.act]++; seen = true; }
    if (seen) c.matches++;
  }
  c.serveTotal = c.srv_in + c.ace + c.srv_err;
  c.serveIn = c.srv_in + c.ace;
  c.servePct = pct(c.serveIn, c.serveTotal);
  c.error = c.err;
  return c;
}

// ---------------------------------------------------------------- Ses / titreşim
let audioCtx = null;
function beep(freq = 880, dur = 0.18, times = 1) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.type = 'square';
      const t0 = audioCtx.currentTime + i * (dur + 0.12);
      g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur);
    }
  } catch { /* ses desteklenmiyor */ }
  try { navigator.vibrate?.(times > 1 ? [200, 100, 200, 100, 400] : 120); } catch { /* yok say */ }
}

// ---------------------------------------------------------------- Sayfa
let cleanupFns = [];
export function cleanup() {
  cleanupFns.forEach(f => { try { f(); } catch { /* yok say */ } });
  cleanupFns = [];
  document.body.classList.remove('sb-mode');
}

export async function render(view, _p, { setTitle }) {
  setTitle('Skorbord');
  const live = loadLive();
  if (live && live.playing) return renderBoard(view, live);
  return renderSetup(view, live, setTitle);
}

// ================================================================ KURULUM
async function renderSetup(view, live, setTitle) {
  const R = matchRules();
  let past = [];
  try { past = await db.select('matches', { eq: { finished: true }, order: 'created_at desc' }); }
  catch (e) { toast(errMsg(e), 'err'); }

  const pending = loadPending();
  view.innerHTML = `
    <div class="stack sb-setup">
      ${live ? `<div class="card" style="border-left:4px solid var(--warn)">
        <div class="card-head"><h3>Yarım kalan maç</h3></div>
        <p style="margin:0 0 10px">${esc(live.homeName)} – ${esc(live.awayName)} · ${fmtDate(live.date)}</p>
        <div class="row"><button class="btn btn-primary" id="resume">▶ Devam et</button><button class="btn btn-ghost" id="discard">Sil</button></div>
      </div>` : ''}
      ${pending.length ? `<div class="card" style="border-left:4px solid var(--bad)">
        <p style="margin:0 0 10px"><b>${pending.length} maç</b> internet olmadığı için kaydedilemedi.</p>
        <button class="btn btn-sm btn-primary" id="retry">Tekrar dene</button></div>` : ''}

      <form class="card" id="setup">
        <div class="card-head"><h3>Yeni maç</h3></div>
        <div class="stack">
          <label>Takımımız<select name="team">${store.teams.map(t =>
            `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
          <div class="team-pick">
            <label>Bizim ad<input name="home" value="AB ${esc(store.teams[0]?.name || '')}" maxlength="24"></label>
            <span class="vs">VS</span>
            <label>Rakip<input name="away" placeholder="Rakip takım" maxlength="24" required></label>
          </div>
          <label>İlk servisi kim atıyor?
            <div class="tabs" style="margin:0" id="fs">
              <button type="button" class="active" data-v="home">Biz</button><button type="button" data-v="away">Rakip</button></div></label>
          <label style="flex-direction:row;align-items:center;gap:10px;font-weight:600">
            <input type="checkbox" name="stats" checked style="width:22px;min-height:22px"> Canlı oyuncu istatistiği tut</label>
          <details>
            <summary class="muted small" style="cursor:pointer">Kurallar: ${R.setsToWin * 2 - 1} setten ${R.setsToWin} alan kazanır · setler ${R.setPoints}, son set ${R.tiebreakPoints} · sette ${R.timeoutsPerSet} mola × ${R.timeoutSeconds} sn</summary>
            <p class="small muted">Kuralları <a href="#/ayarlar" style="color:var(--red);font-weight:600">Ayarlar</a> bölümünden değiştirebilirsin.</p>
          </details>
          <button class="btn btn-primary btn-block" type="submit" style="min-height:54px;font-size:18px">🏐 Maçı başlat</button>
        </div>
      </form>

      <div class="card">
        <div class="card-head"><h3>Geçmiş maçlar</h3></div>
        ${past.length ? `<ul class="plist">${past.map(m => {
          const win = m.home_sets > m.away_sets;
          return `<li>
            <span class="jersey" style="background:${win ? 'var(--ok)' : 'var(--bad)'}">${win ? 'G' : 'M'}</span>
            <button class="pname" data-show="${m.id}" style="border:0;background:none;text-align:left;padding:0;cursor:pointer">
              <b>${esc(m.home_name)} – ${esc(m.away_name)}</b>
              <small>${fmtDate(m.date)} · ${(m.sets || []).map(s => `${s.home}-${s.away}`).join(', ')}</small></button>
            <span class="num" style="font-size:24px;font-weight:700">${m.home_sets}-${m.away_sets}</span>
          </li>`; }).join('')}</ul>` : '<div class="empty">Henüz kayıtlı maç yok.</div>'}
      </div>
    </div>`;

  const f = $('#setup', view);
  let firstServe = 'home';
  f.team.onchange = () => { f.home.value = 'AB ' + store.team(f.team.value).name; };
  $$('#fs button', view).forEach(b => b.onclick = () => {
    firstServe = b.dataset.v; $$('#fs button', view).forEach(x => x.classList.toggle('active', x === b));
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (live && !await confirmBox('Yarım kalan maç silinip yeni maç başlasın mı?', { ok: 'Yeni maç', danger: true })) return;
    const m = {
      teamId: f.team.value, homeName: f.home.value.trim() || 'Biz', awayName: f.away.value.trim() || 'Rakip',
      date: isoDate(), rules: matchRules(), firstServe, statsOn: f.stats.checked, events: [], playing: true,
    };
    saveLive(m);
    renderBoard(view, m);
  };
  $('#resume', view)?.addEventListener('click', () => { live.playing = true; saveLive(live); renderBoard(view, live); });
  $('#discard', view)?.addEventListener('click', async () => {
    if (await confirmBox('Yarım kalan maç silinsin mi?', { ok: 'Sil', danger: true })) { clearLive(); renderSetup(view, null, setTitle); }
  });
  $('#retry', view)?.addEventListener('click', async () => { await flushPending(); renderSetup(view, loadLive(), setTitle); });
  $$('[data-show]', view).forEach(b => b.onclick = () => showMatch(past.find(m => m.id === b.dataset.show), () => renderSetup(view, loadLive(), setTitle)));
}

// ================================================================ SKORBORD
function renderBoard(view, m) {
  cleanup();
  document.body.classList.add('sb-mode');
  const players = m.statsOn ? store.teamPlayers(m.teamId) : [];
  let selPid = null;
  let lastLog = '';
  let timer = null;

  // Ekran kapanmasın
  let wakeLock = null;
  const lock = async () => { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* yok say */ } };
  lock();
  const onVis = () => { if (document.visibilityState === 'visible') lock(); };
  document.addEventListener('visibilitychange', onVis);
  cleanupFns.push(() => { document.removeEventListener('visibilitychange', onVis); wakeLock?.release?.(); });

  const push = (e) => {
    if (compute(m).finished && e.t !== 'srv') return;
    m.events.push({ ...e, ts: Date.now() });
    saveLive(m);
    const st = compute(m);
    draw();
    if (st.lastNotice) notice(st.lastNotice);
  };
  const undo = () => {
    if (!m.events.length) return;
    const e = m.events.pop();
    saveLive(m);
    lastLog = 'Geri alındı' + (e.act ? `: ${ACT[e.act].label}` : '');
    draw();
  };
  const addPoint = (side) => push({ t: 'pt', side });
  const doAction = (act) => {
    const a = ACT[act]; if (!selPid) return;
    const p = players.find(x => x.id === selPid);
    lastLog = `${p.jersey_no ?? ''} ${p.full_name}: ${a.label}`;
    if (a.point) push({ t: 'pt', side: a.point, pid: selPid, act });
    else push({ t: 'stat', pid: selPid, act });
  };

  function notice(n) {
    const st = compute(m);
    let text;
    if (n.type === 'match') text = `🏆 MAÇ BİTTİ<br>${esc(n.side === 'home' ? m.homeName : m.awayName)} ${st.won.home}-${st.won.away}`;
    else if (n.type === 'set') text = `${n.no}. SET: ${esc(n.side === 'home' ? m.homeName : m.awayName)}<br>${n.score.home}-${n.score.away} · Taraf değiştir`;
    else text = '⇄ TARAF DEĞİŞTİR';
    beep(660, 0.2, 2);
    const b = document.createElement('div');
    b.className = 'sb-banner'; b.innerHTML = text;
    b.onclick = () => b.remove();
    document.body.append(b);
    setTimeout(() => b.remove(), n.type === 'match' ? 6000 : 3500);
  }

  function startTimeout(side) {
    const st = compute(m);
    if (st.to[side] >= m.rules.timeoutsPerSet || st.finished) return;
    push({ t: 'to', side });
    let left = m.rules.timeoutSeconds;
    const ov = document.createElement('div');
    ov.className = 'sb-timer';
    ov.innerHTML = `<div class="lbl">MOLA · ${esc(side === 'home' ? m.homeName : m.awayName)}</div>
      <div class="big">${left}</div><button class="sb-btn">Molayı bitir</button>`;
    document.body.append(ov);
    const big = $('.big', ov);
    const stop = () => { clearInterval(timer); timer = null; ov.remove(); };
    $('button', ov).onclick = stop;
    beep(880, 0.12);
    timer = setInterval(() => {
      left--;
      big.textContent = Math.max(left, 0);
      if (left <= 5) ov.classList.add('ending');
      if (left === 10) beep(880, 0.1);
      if (left <= 0) { beep(1040, 0.35, 3); clearInterval(timer); timer = null; setTimeout(() => ov.remove(), 1600); }
    }, 1000);
    cleanupFns.push(stop);
  }

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const st = compute(m);
    const left = st.swapped ? 'away' : 'home', right = st.swapped ? 'home' : 'away';
    if (e.key === 'ArrowLeft') addPoint(left);
    else if (e.key === 'ArrowRight') addPoint(right);
    else if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
  };
  document.addEventListener('keydown', onKey);
  cleanupFns.push(() => document.removeEventListener('keydown', onKey));

  function side(key, st) {
    const name = key === 'home' ? m.homeName : m.awayName;
    const toUsed = st.to[key];
    return `<div class="sb-side ${key} ${st.serve === key && !st.finished ? 'serving' : ''}">
      <div class="sb-name"><span class="sb-serve" title="Servis"></span>${esc(name)}</div>
      <div class="sb-setswon">${Array.from({ length: m.rules.setsToWin }, (_, i) => `<i class="${i < st.won[key] ? 'on' : ''}"></i>`).join('')}</div>
      <button class="sb-score" data-pt="${key}" aria-label="${esc(name)} sayı ekle">${st.cur[key]}</button>
      <div class="sb-ctrl">
        <button class="sb-btn" data-minus="${key}" aria-label="Sayı düzelt">−1</button>
        <button class="sb-btn" data-to="${key}" ${toUsed >= m.rules.timeoutsPerSet || st.finished ? 'disabled' : ''}>⏱ Mola
          <span class="sb-to">${Array.from({ length: m.rules.timeoutsPerSet }, (_, i) => `<i class="${i < toUsed ? 'used' : ''}"></i>`).join('')}</span></button>
      </div>
    </div>`;
  }

  function draw() {
    const st = compute(m);
    const [L, Rr] = st.swapped ? ['away', 'home'] : ['home', 'away'];
    const canAct = !!selPid && !st.finished;
    view.innerHTML = `
      <div class="sb">
        <div class="sb-top">
          <button class="sb-btn" id="sb-exit">← Çık</button>
          <div class="sp">${st.finished ? 'MAÇ BİTTİ' : `${st.setNo}. SET${st.isDeciding ? ` · ${m.rules.tiebreakPoints} SAYI` : ''}`}</div>
          ${document.fullscreenEnabled ? '<button class="sb-btn" id="sb-fs" aria-label="Tam ekran">⛶</button>' : ''}
        </div>
        <div class="sb-sets">${st.sets.map((s, i) =>
          `<span class="sb-set">${i + 1}. set <b class="${s.home > s.away ? 'w' : ''}">${s.home}</b>-<b class="${s.away > s.home ? 'w' : ''}">${s.away}</b></span>`).join('')}</div>
        <div class="sb-board">${side(L, st)}${side(Rr, st)}</div>
        <div class="sb-bottom">
          <button class="sb-btn" id="sb-undo" ${m.events.length ? '' : 'disabled'}>↶ Geri al</button>
          <button class="sb-btn" id="sb-swap">⇄ Taraf</button>
          <button class="sb-btn" id="sb-srv">🏐 Servis değiştir</button>
          ${players.length ? '<button class="sb-btn" id="sb-statsbtn">📊 İstatistik</button>' : ''}
          ${st.finished ? '<button class="sb-btn" id="sb-finish" style="background:#1f7a45;border-color:#1f7a45">💾 Kaydet ve bitir</button>' : ''}
        </div>
        ${players.length ? `
        <div class="sb-stats" id="sb-stats">
          <h4><span>CANLI İSTATİSTİK</span><span>${selPid ? 'Eylem seç' : 'Önce oyuncu seç'}</span></h4>
          <div class="sb-players">${players.map(p => `<button class="sb-p ${p.id === selPid ? 'sel' : ''}" data-pid="${p.id}">
            <b>${p.jersey_no ?? '–'}</b><small>${esc(p.full_name.split(' ')[0])}</small></button>`).join('')}</div>
          <div class="sb-actions">${ACTIONS.map(a => `<button class="${a.cls}" data-act="${a.key}" ${canAct ? '' : 'disabled'}>${a.label}</button>`).join('')}</div>
          <div class="sb-log">${esc(lastLog)}</div>
        </div>` : ''}
      </div>`;

    $$('[data-pt]', view).forEach(b => b.onclick = () => { lastLog = ''; addPoint(b.dataset.pt); });
    $$('[data-minus]', view).forEach(b => b.onclick = () => {
      // Bu taraf için verilen son sayıyı geri al (yalnızca mevcut sette)
      const k = b.dataset.minus;
      const st2 = compute(m);
      if (st2.cur[k] === 0) return;
      for (let i = m.events.length - 1; i >= 0; i--) {
        if (m.events[i].t === 'pt' && m.events[i].side === k) { m.events.splice(i, 1); break; }
      }
      saveLive(m); draw();
    });
    $$('[data-to]', view).forEach(b => b.onclick = () => startTimeout(b.dataset.to));
    $('#sb-undo', view).onclick = undo;
    $('#sb-swap', view).onclick = () => push({ t: 'swap' });
    $('#sb-srv', view).onclick = () => push({ t: 'srv', side: compute(m).serve === 'home' ? 'away' : 'home' });
    $('#sb-fs', view)?.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
    });
    $('#sb-exit', view).onclick = () => {
      m.playing = false; saveLive(m); cleanup();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      render(view, {}, { setTitle: () => {} });
    };
    $('#sb-statsbtn', view)?.addEventListener('click', () => $('#sb-stats', view).classList.toggle('force'));
    $$('[data-pid]', view).forEach(b => b.onclick = () => { selPid = selPid === b.dataset.pid ? null : b.dataset.pid; draw(); });
    $$('[data-act]', view).forEach(b => b.onclick = () => doAction(b.dataset.act));
    $('#sb-finish', view)?.addEventListener('click', () => finishMatch(view, m));
  }
  draw();
}

// ================================================================ KAYDETME
function toRow(m) {
  const st = compute(m);
  return {
    team_id: m.teamId, date: m.date, home_name: m.homeName, away_name: m.awayName,
    home_sets: st.won.home, away_sets: st.won.away, sets: st.sets, events: m.events, finished: st.finished,
  };
}
const PENDING_KEY = 'abvoley-pending-matches';
function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch { return []; } }
function savePending(a) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(a)); } catch { /* yok say */ } }
async function flushPending() {
  const list = loadPending(); const left = [];
  for (const row of list) { try { await db.insert('matches', row); } catch { left.push(row); } }
  savePending(left);
  toast(left.length ? `${left.length} maç hâlâ kaydedilemedi` : 'Maçlar kaydedildi ✓', left.length ? 'err' : 'ok');
}

async function finishMatch(view, m) {
  const row = toRow(m);
  try {
    const [saved] = await db.insert('matches', row);
    toast('Maç kaydedildi ✓');
    clearLive(); cleanup();
    showMatch(saved, () => render(view, {}, { setTitle: () => {} }));
    render(view, {}, { setTitle: () => {} });
  } catch (e) {
    savePending([...loadPending(), row]);
    clearLive(); cleanup();
    toast('İnternet yok: maç telefonda saklandı, sonra tekrar denenecek', 'err');
    render(view, {}, { setTitle: () => {} });
  }
}

// ================================================================ MAÇ ÖZETİ
function showMatch(m, onDeleted) {
  if (!m) return;
  const players = store.teamPlayers(m.team_id, { includeInactive: true });
  const rows = players.map(p => ({ p, s: playerMatchStats([m], p.id) })).filter(x => x.s.matches);
  const tot = playerMatchStats([{ events: (m.events || []).filter(e => e.pid) .map(e => ({ ...e, pid: 'x' })) }], 'x');
  const body = `
    <div style="text-align:center">
      <div class="muted small">${fmtDate(m.date, { day: true })}</div>
      <div style="font-size:20px;font-weight:700;margin:4px 0">${esc(m.home_name)} – ${esc(m.away_name)}</div>
      <div class="num" style="font-size:54px;font-weight:800;line-height:1;color:${m.home_sets > m.away_sets ? 'var(--ok)' : 'var(--bad)'}">${m.home_sets} - ${m.away_sets}</div>
      <div class="muted">${(m.sets || []).map((s, i) => `${i + 1}. set ${s.home}-${s.away}`).join(' · ')}</div>
    </div>
    ${rows.length ? `<div class="table-wrap"><table class="t">
      <thead><tr><th>Oyuncu</th><th class="c">Servis</th><th class="c">%</th><th class="c">As</th><th class="c">Smaç</th><th class="c">Blok</th><th class="c">Hata</th></tr></thead>
      <tbody>${rows.map(({ p, s }) => `<tr><td>${p.jersey_no ?? ''} ${esc(p.full_name)}</td>
        <td class="c num">${s.serveIn}/${s.serveTotal}</td><td class="c"><span class="rate ${rateClass(s.servePct)}">${s.servePct ?? '–'}</span></td>
        <td class="c num">${s.ace}</td><td class="c num">${s.kill}</td><td class="c num">${s.block}</td><td class="c num">${s.error}</td></tr>`).join('')}
        <tr style="font-weight:700"><td>Takım</td><td class="c num">${tot.serveIn}/${tot.serveTotal}</td><td class="c">${tot.servePct ?? '–'}</td>
        <td class="c num">${tot.ace}</td><td class="c num">${tot.kill}</td><td class="c num">${tot.block}</td><td class="c num">${tot.error}</td></tr>
      </tbody></table></div>` : '<p class="muted">Bu maçta oyuncu istatistiği tutulmadı.</p>'}`;
  openModal({
    title: `${CLUB_NAME} · Maç özeti`, body, wide: true,
    actions: [
      { label: 'Sil', cls: 'btn-ghost', onClick: async (close) => {
        if (!await confirmBox('Bu maç kaydı silinsin mi?', { ok: 'Sil', danger: true })) return;
        try { await db.remove('matches', m.id); close(); toast('Silindi'); onDeleted?.(); } catch (e) { toast(errMsg(e), 'err'); }
      } },
      { label: 'Kapat', cls: 'btn-primary' },
    ],
  });
}
