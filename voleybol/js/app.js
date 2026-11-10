// Uygulama giriş noktası: oturum, menü ve sayfa yönlendirme
import { auth, DEMO } from './db.js';
import { store } from './store.js';
import { $, esc, errMsg, toast } from './util.js';
import * as home from './pages/home.js';
import * as team from './pages/team.js';
import * as player from './pages/player.js';
import * as reports from './pages/reports.js';
import * as scoreboard from './pages/scoreboard.js';
import * as archive from './pages/archive.js';
import * as settings from './pages/settings.js';

const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  teams: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.1 4.4 1.8 5 4.4"/></svg>',
  score: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3c-2 3-2.5 6 0 9s2 6 0 9M3.5 9c3.5 1 7 .5 8.5-3M20.5 15c-3.5-1-7-.5-8.5 3"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

const NAV = [
  { key: 'home', label: 'Ana Sayfa', href: '#/', icon: ICONS.home },
  { key: 'team', label: 'Takımlar', href: () => `#/takim/${lastTeam()}`, icon: ICONS.teams },
  { key: 'scoreboard', label: 'Skorbord', href: '#/skorbord', icon: ICONS.score },
  { key: 'archive', label: 'Arşiv', href: '#/arsiv', icon: ICONS.archive },
  { key: 'reports', label: 'Raporlar', href: '#/raporlar', icon: ICONS.reports },
];

function lastTeam() {
  let id = null;
  try { id = localStorage.getItem('abvoley-last-team'); } catch { /* yok say */ }
  return store.team(id) ? id : store.teams[0]?.id || '';
}

// '#/takim/123/yoklama' → { page, params }
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case undefined: return { key: 'home', mod: home, params: {} };
    case 'takim': return { key: 'team', mod: team, params: { id: parts[1] || lastTeam(), tab: parts[2] || 'oyuncular' } };
    case 'oyuncu': return { key: 'team', mod: player, params: { id: parts[1] } };
    case 'skorbord': return { key: 'scoreboard', mod: scoreboard, params: {} };
    case 'arsiv': return { key: 'archive', mod: archive, params: {} };
    case 'raporlar': return { key: 'reports', mod: reports, params: { sub: parts[1] } };
    case 'ayarlar': return { key: 'settings', mod: settings, params: {} };
    default: return { key: 'home', mod: home, params: {} };
  }
}

function renderNav(activeKey, teamId) {
  const link = (n) => {
    const href = typeof n.href === 'function' ? n.href() : n.href;
    return `<a href="${href}" class="${n.key === activeKey ? 'active' : ''}">${n.icon}<span>${n.label}</span></a>`;
  };
  // Masaüstü yan menüde takımlar alt alta
  const teamLinks = store.teams.map(t =>
    `<a class="nav-sub ${activeKey === 'team' && teamId === t.id ? 'active' : ''}" href="#/takim/${t.id}">${esc(t.name)}</a>`).join('');
  $('#nav').innerHTML = NAV.map(n => link(n) + (n.key === 'team' ? teamLinks : '')).join('');
  $('#bottomnav').innerHTML = NAV.map(link).join('');
}

let current = null;
async function route() {
  const r = parseRoute();
  if (current?.cleanup) { try { current.cleanup(); } catch { /* yok say */ } }
  document.body.classList.remove('sb-mode');
  const view = $('#view');
  view.innerHTML = '';
  if (r.key === 'team' && r.mod === team) {
    try { localStorage.setItem('abvoley-last-team', r.params.id); } catch { /* yok say */ }
  }
  renderNav(r.key, r.mod === team ? r.params.id : null);
  const setTitle = (t) => { $('#page-title').textContent = t; document.title = `${t} · AB Voleybol`; };
  current = r.mod;
  try {
    await r.mod.render(view, r.params, { setTitle });
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card empty"><b>Bir sorun oluştu</b>${esc(errMsg(e))}</div>`;
  }
  view.focus({ preventScroll: true });
  if (!location.hash.includes('/yoklama')) window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- Açılış
async function start(user) {
  store.user = user;
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#demo-badge').hidden = !DEMO;
  try {
    await store.loadAll();
  } catch (e) {
    console.error(e);
    toast(errMsg(e), 'err');
  }
  window.addEventListener('hashchange', route);
  await route();
}

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  const form = $('#login-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    $('#login-err').textContent = '';
    try {
      const user = await auth.signIn(form.email.value.trim(), form.password.value);
      await start(user);
    } catch (err) {
      $('#login-err').textContent = /invalid/i.test(err.message) ? 'E-posta veya şifre hatalı.' : errMsg(err);
    } finally {
      btn.disabled = false;
    }
  };
}

(async function boot() {
  try {
    const user = await auth.getUser();
    if (user) await start(user); else showLogin();
  } catch (e) {
    console.error(e);
    showLogin();
  }
  $('#boot').remove();
  auth.onChange((u) => { if (!u && store.user) location.reload(); });

  if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
