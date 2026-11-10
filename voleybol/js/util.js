// Küçük yardımcılar: HTML kaçışı, tarih, bildirim, pencere (modal)

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- Tarih
// Yerel saate göre YYYY-AA-GG (toISOString UTC'ye çevirdiği için kullanılmaz)
export function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d);
}
// Haftanın pazartesisi
export function weekStart(s) {
  const d = parseDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoDate(d);
}
export function monthStart(s) { return s.slice(0, 8) + '01'; }
export function monthEnd(s) {
  const d = parseDate(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return isoDate(d);
}
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const TR_DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export function fmtDate(s, { day = false } = {}) {
  if (!s) return '';
  const d = parseDate(s);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}${day ? ', ' + TR_DAYS[d.getDay()] : ''}`;
}
export function fmtShort(s) {
  const d = parseDate(s);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export const dayShort = (s) => TR_DAYS_SHORT[parseDate(s).getDay()];
export const monthName = (s) => `${TR_MONTHS[parseDate(s).getMonth()]} ${parseDate(s).getFullYear()}`;

// Türkçe büyük/küçük harf duyarsız karşılaştırma için
export const norm = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

// ---------------------------------------------------------------- Bildirim
export function toast(msg, type = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3000);
}

export function errMsg(e) {
  const m = e?.message || String(e);
  if (/fetch|network|Failed/i.test(m)) return 'İnternet bağlantısı yok gibi görünüyor.';
  if (/relation .* does not exist|schema cache/i.test(m)) return 'Veritabanı kurulmamış. KURULUM adımındaki SQL kodunu çalıştırın.';
  return m;
}

// ---------------------------------------------------------------- Pencere
// openModal({title, body, actions:[{label, cls, onClick(close) }]}) → kapatma fonksiyonu
export function openModal({ title, body, actions = [], wide = false, onOpen }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Kapat">✕</button></div>
      <div class="modal-body"></div>
      <div class="modal-actions"></div>
    </div>`;
  const bodyEl = $('.modal-body', wrap);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  const act = $('.modal-actions', wrap);
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.cls || ''}`;
    b.textContent = a.label;
    b.onclick = () => a.onClick ? a.onClick(close, wrap) : close();
    act.append(b);
  }
  document.body.append(wrap);
  onOpen?.(wrap, close);
  const first = $('input, select, textarea', bodyEl);
  if (first) setTimeout(() => first.focus(), 50);
  return close;
}

export function confirmBox(message, { ok = 'Evet', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal({
      title: 'Onay',
      body: `<p>${esc(message)}</p>`,
      actions: [
        { label: 'Vazgeç', cls: 'btn-ghost', onClick: (c) => { c(); resolve(false); } },
        { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', onClick: (c) => { c(); resolve(true); } },
      ],
    });
  });
}
