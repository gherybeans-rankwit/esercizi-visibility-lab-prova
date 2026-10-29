// Il server che riceve le risposte (Supabase, in UE). La chiave è pubblica per
// costruzione: i dati li proteggono le regole del database (supabase/migrations).
// Senza url e key le pagine funzionano come nella Fase 1: tutto resta sul PC.
// Aperte da localhost le pagine usano la prova in locale: prove/rete.mjs sulla
// porta 54399, davanti a Supabase locale.
window.LAB_SERVER = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? { url: 'http://127.0.0.1:54399', key: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' }
  : { url: 'https://fvmehezybvpehkxnzphc.supabase.co', key: 'sb_publishable_tfEvLyfSH3mHd11PTfYwoA_ijcxIxBd' };
