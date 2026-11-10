# Akdeniz Bilgi S.K. Voleybol — Kurulum

Tek seferlik 3 adım. Toplam ~5 dakika.

## 1. Veritabanını kur
1. supabase.com → projen (`akdeniz-voleybol`) → sol menüden **SQL Editor**
2. **New query** → bu klasördeki `supabase-kurulum.sql` dosyasının **tamamını** kopyala, yapıştır
3. **Run** → "Success. No rows returned" görünce tamam.

## 2. Giriş hesabını aç ve dışarıdan kaydı kapat
1. **Authentication → Users → Add user → Create new user**
   - E-posta ve şifreni yaz, **Auto Confirm User** işaretli olsun → **Create user**
2. **Authentication → Sign In / Providers** (bazı ekranlarda **Settings**)
   - **Allow new users to sign up** → **kapat** → Save
   - Böylece uygulamaya sadece senin eklediğin hesaplar girebilir.

## 3. Uygulamayı yayınla (GitHub Pages)
1. GitHub → `miyav-mobil` deposu → **Settings → Pages**
2. **Source: Deploy from a branch**, Branch: `main` (veya uygulamanın olduğu dal), klasör `/ (root)` → Save
3. Birkaç dakika sonra adres: **https://tes3010.github.io/miyav-mobil/voleybol/**

## Telefona / tablete uygulama gibi ekleme
- **iPhone / iPad (Safari):** Paylaş → **Ana Ekrana Ekle**
- **Android (Chrome):** ⋮ menü → **Ana ekrana ekle / Uygulamayı yükle**
- **Bilgisayar (Chrome / Edge):** adres çubuğundaki ⊕ yükle simgesi

## Deneme modu
Adresin sonuna `?demo=1` eklersen (ör. `.../voleybol/?demo=1`) giriş istemeden, verileri sadece o tarayıcıda tutan
deneme modunda açılır. Gerçek verilere dokunmaz.

## Güvenlik notları
- `js/config.js` içindeki **publishable** anahtar herkese açık olacak şekilde tasarlanmıştır; veriler giriş + RLS kurallarıyla korunur.
- **Secret / service_role** anahtarını asla koda veya kimseyle paylaşma.
- Oyuncu listesi Excel dosyasını depoya yükleme; uygulamanın içinden yükle.
