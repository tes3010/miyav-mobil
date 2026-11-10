// Antrenman arşivi — 6. aşamada doldurulacak
export async function render(view, _p, { setTitle }) {
  setTitle('Antrenman Arşivi');
  view.innerHTML = `
    <div class="card soon">
      <div class="ico">📁</div>
      <h3>Antrenman arşivi</h3>
      <p class="muted">PDF yükleme, "bugün neye ağırlık verdik" notları ve Claude analizini yapıştırıp
        konu dağılımı grafikleri. 6. aşamada geliyor.</p>
    </div>`;
}
