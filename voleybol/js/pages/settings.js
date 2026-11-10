// Ayarlar: maç kuralları, takım adları, oturum
import { db, auth, DEMO } from '../db.js';
import { store } from '../store.js';
import { $, $$, esc, toast, errMsg, confirmBox } from '../util.js';
import { DEFAULT_MATCH_RULES } from '../config.js';
import { matchRules } from './scoreboard.js';
import { downloadTemplate } from '../import.js';

export async function render(view, _p, { setTitle }) {
  setTitle('Ayarlar');
  const R = matchRules();
  view.innerHTML = `
    <div class="stack">
      <form class="card" id="rules">
        <div class="card-head"><h3>Maç kuralları</h3><button type="button" class="btn btn-sm btn-ghost" id="r-def">Varsayılana dön</button></div>
        <div class="form-grid">
          <label>Kazanmak için set<input name="setsToWin" type="number" min="1" max="3" value="${R.setsToWin}"></label>
          <label>Set sayısı<input name="setPoints" type="number" min="5" max="30" value="${R.setPoints}"></label>
          <label>Son set sayısı<input name="tiebreakPoints" type="number" min="5" max="30" value="${R.tiebreakPoints}"></label>
          <label>Sette mola<input name="timeoutsPerSet" type="number" min="0" max="5" value="${R.timeoutsPerSet}"></label>
          <label>Mola süresi (sn)<input name="timeoutSeconds" type="number" min="10" max="120" value="${R.timeoutSeconds}"></label>
        </div>
        <p class="small muted">Gelişim ligi: 3 setten 2 alan kazanır, setler 25, 3. set 15 sayı.</p>
        <button class="btn btn-primary" type="submit">Kaydet</button>
      </form>

      <form class="card" id="teams">
        <div class="card-head"><h3>Takımlar</h3></div>
        <div class="stack">${store.teams.map(t => `
          <div class="row">
            <input name="n-${t.id}" value="${esc(t.name)}" style="flex:1;min-width:140px">
            <select name="c-${t.id}" style="width:auto">
              <option value="midi" ${t.category === 'midi' ? 'selected' : ''}>Midi</option>
              <option value="mini" ${t.category === 'mini' ? 'selected' : ''}>Mini</option>
            </select>
          </div>`).join('')}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn btn-primary" type="submit">Kaydet</button>
          <button class="btn" type="button" id="add-team">+ Takım ekle</button>
        </div>
      </form>

      <div class="card">
        <div class="card-head"><h3>Oyuncu listesi</h3></div>
        <p class="muted small" style="margin-top:0">Excel'den yükleme için örnek dosya. Yükleme, takım sayfasındaki "Excel'den yükle" butonundan yapılır.</p>
        <button class="btn" id="tpl">⬇ Excel şablonunu indir</button>
      </div>

      <div class="card">
        <div class="card-head"><h3>Hesap</h3></div>
        <p class="muted" style="margin-top:0">${DEMO ? 'Deneme modu: veriler sadece bu tarayıcıda.' : esc(store.user?.email || '')}</p>
        <div class="row">
          ${DEMO ? '<button class="btn" id="reset-demo">Deneme verilerini sil</button>' : '<button class="btn btn-danger" id="logout">Çıkış yap</button>'}
        </div>
      </div>
    </div>`;

  const saveSettings = async (patch) => {
    const data = { ...(store.settings || {}), ...patch };
    const row = { data, updated_at: new Date().toISOString() };
    if (!DEMO) row.owner = store.user.id;
    await db.upsert('settings', row, 'owner');
    store.settings = data;
  };

  $('#rules', view).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const rules = Object.fromEntries(Object.keys(DEFAULT_MATCH_RULES).map(k => [k, Math.max(0, Number(f[k].value) || DEFAULT_MATCH_RULES[k])]));
    try { await saveSettings({ matchRules: rules }); toast('Kurallar kaydedildi'); } catch (err) { toast(errMsg(err), 'err'); }
  };
  $('#r-def', view).onclick = () => {
    const f = $('#rules', view);
    for (const [k, v] of Object.entries(DEFAULT_MATCH_RULES)) f[k].value = v;
  };

  $('#teams', view).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      for (const t of store.teams) {
        const name = f[`n-${t.id}`].value.trim(), category = f[`c-${t.id}`].value;
        if (name && (name !== t.name || category !== t.category)) await db.update('teams', t.id, { name, category });
      }
      await store.loadAll();
      toast('Takımlar kaydedildi');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) { toast(errMsg(err), 'err'); }
  };
  $('#add-team', view).onclick = async () => {
    try {
      await db.insert('teams', { name: 'Yeni takım', category: 'mini', sort: store.teams.length + 1 });
      await store.loadAll();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) { toast(errMsg(err), 'err'); }
  };
  $('#tpl', view).onclick = () => downloadTemplate().catch(e => toast(errMsg(e), 'err'));
  $('#logout', view)?.addEventListener('click', async () => {
    if (await confirmBox('Çıkış yapılsın mı?', { ok: 'Çıkış' })) { await auth.signOut(); location.reload(); }
  });
  $('#reset-demo', view)?.addEventListener('click', async () => {
    if (await confirmBox('Tüm deneme verileri silinsin mi?', { ok: 'Sil', danger: true })) {
      localStorage.removeItem('abvoley-demo-db'); location.reload();
    }
  });
  void $$;
}
