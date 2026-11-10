// Supabase bağlantı bilgileri.
// Publishable key herkese açık olacak şekilde tasarlanmıştır; veriler giriş + RLS kurallarıyla korunur.
// ASLA buraya secret / service_role anahtarı yazmayın.
export const SUPABASE_URL = 'https://hwofvfnoyennwzrtrupb.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_xvxqHV0g_hUnHnSs4JKm2A_jI1DkdT1';

export const CLUB_NAME = 'Akdeniz Bilgi S.K.';

export const DEFAULT_TEAMS = [
  { name: 'Midi A', category: 'midi', sort: 1 },
  { name: 'Midi B', category: 'midi', sort: 2 },
  { name: 'Mini A', category: 'mini', sort: 3 },
  { name: 'Mini B', category: 'mini', sort: 4 },
  { name: 'Mini C', category: 'mini', sort: 5 },
];

// Gelişim ligi kuralları (ayarlardan değiştirilebilir)
export const DEFAULT_MATCH_RULES = {
  setsToWin: 2,        // 3 setten 2 alan kazanır
  setPoints: 25,       // 1. ve 2. set
  tiebreakPoints: 15,  // 3. set
  timeoutsPerSet: 2,
  timeoutSeconds: 30,
};
