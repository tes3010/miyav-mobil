// Veri katmanı: Supabase (gerçek) veya yerel deneme modu (?demo=1).
// Tüm sayfalar yalnızca buradaki fonksiyonları kullanır.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const DEMO = new URLSearchParams(location.search).has('demo');

let sb = null;
if (!DEMO) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

// ---------------------------------------------------------------- Yerel (demo)
const LS_KEY = 'abvoley-demo-db';
const local = {
  load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
  },
  save(d) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch { /* yok say */ }
  },
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2));

function matches(row, q) {
  for (const [k, v] of Object.entries(q.eq || {})) if (row[k] !== v) return false;
  for (const [k, v] of Object.entries(q.in || {})) if (!v.includes(row[k])) return false;
  for (const [k, v] of Object.entries(q.gte || {})) if (!(row[k] >= v)) return false;
  for (const [k, v] of Object.entries(q.lte || {})) if (!(row[k] <= v)) return false;
  return true;
}
function sortRows(rows, order) {
  if (!order) return rows;
  const list = Array.isArray(order) ? order : [order];
  return rows.sort((a, b) => {
    for (const o of list) {
      const [col, dir] = o.split(' ');
      const av = a[col] ?? '', bv = b[col] ?? '';
      if (av < bv) return dir === 'desc' ? 1 : -1;
      if (av > bv) return dir === 'desc' ? -1 : 1;
    }
    return 0;
  });
}

// ---------------------------------------------------------------- Ortak API
export const db = {
  async select(table, q = {}) {
    if (DEMO) {
      const d = local.load();
      return sortRows((d[table] || []).filter(r => matches(r, q)).map(r => ({ ...r })), q.order);
    }
    let req = sb.from(table).select(q.columns || '*');
    for (const [k, v] of Object.entries(q.eq || {})) req = req.eq(k, v);
    for (const [k, v] of Object.entries(q.in || {})) req = req.in(k, v);
    for (const [k, v] of Object.entries(q.gte || {})) req = req.gte(k, v);
    for (const [k, v] of Object.entries(q.lte || {})) req = req.lte(k, v);
    if (q.order) {
      for (const o of (Array.isArray(q.order) ? q.order : [q.order])) {
        const [col, dir] = o.split(' ');
        req = req.order(col, { ascending: dir !== 'desc', nullsFirst: false });
      }
    }
    const { data, error } = await req;
    if (error) throw error;
    return data;
  },

  async insert(table, rows) {
    const arr = Array.isArray(rows) ? rows : [rows];
    if (DEMO) {
      const d = local.load();
      const now = new Date().toISOString();
      const out = arr.map(r => ({ id: uid(), created_at: now, ...r }));
      d[table] = [...(d[table] || []), ...out];
      local.save(d);
      return out;
    }
    const { data, error } = await sb.from(table).insert(arr).select();
    if (error) throw error;
    return data;
  },

  async update(table, id, patch) {
    if (DEMO) {
      const d = local.load();
      const row = (d[table] || []).find(r => r.id === id);
      if (row) Object.assign(row, patch);
      local.save(d);
      return row;
    }
    const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // onConflict: virgülle ayrılmış benzersiz sütunlar (ör. 'player_id,date')
  async upsert(table, rows, onConflict) {
    const arr = Array.isArray(rows) ? rows : [rows];
    if (DEMO) {
      const d = local.load();
      const keys = onConflict.split(',');
      d[table] = d[table] || [];
      const out = [];
      for (const r of arr) {
        const ex = d[table].find(x => keys.every(k => x[k] === r[k]));
        if (ex) { Object.assign(ex, r); out.push(ex); }
        else { const n = { id: uid(), created_at: new Date().toISOString(), ...r }; d[table].push(n); out.push(n); }
      }
      local.save(d);
      return out;
    }
    const { data, error } = await sb.from(table).upsert(arr, { onConflict }).select();
    if (error) throw error;
    return data;
  },

  async remove(table, id) {
    if (DEMO) {
      const d = local.load();
      d[table] = (d[table] || []).filter(r => r.id !== id);
      // basit kademeli silme
      if (table === 'players') {
        for (const t of ['attendance', 'drill_results', 'measurements']) {
          d[t] = (d[t] || []).filter(r => r.player_id !== id);
        }
      }
      local.save(d);
      return;
    }
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  },

  async removeWhere(table, eq) {
    if (DEMO) {
      const d = local.load();
      d[table] = (d[table] || []).filter(r => !matches(r, { eq }));
      local.save(d);
      return;
    }
    let req = sb.from(table).delete();
    for (const [k, v] of Object.entries(eq)) req = req.eq(k, v);
    const { error } = await req;
    if (error) throw error;
  },
};

// ---------------------------------------------------------------- Giriş
export const auth = {
  async getUser() {
    if (DEMO) return { id: 'demo', email: 'demo@deneme' };
    const { data } = await sb.auth.getSession();
    return data.session?.user || null;
  },
  async signIn(email, password) {
    if (DEMO) return { id: 'demo', email };
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signOut() {
    if (DEMO) return;
    await sb.auth.signOut();
  },
  onChange(cb) {
    if (DEMO) return;
    sb.auth.onAuthStateChange((_e, session) => cb(session?.user || null));
  },
};
