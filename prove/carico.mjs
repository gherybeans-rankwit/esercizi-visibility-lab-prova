// Prova di carico: tanti PC finti fanno i quattro esercizi insieme, con la logica
// vera delle pagine (assets/store.js e assets/sync.js) e la rete che cade. Ogni
// esercizio è una pagina nuova, come nel portale: il codice del PC si ricarica e
// riparte dal suo localStorage.
//   node prove/carico.mjs [pc=60] [minuti=4] [locale|online]
// Con «locale» usa prove/.locale.json e la rete finta di prove/rete.mjs (porta
// 54399, controllo 54398); con «online» usa prove/.online.json (stessi campi:
// api, key, users) e, se c'è, la rete finta indicata in «rete».
// Alla fine confronta, riga per riga, quello che ogni PC ha salvato con quello
// che c'è sul server, e scrive il riepilogo in prove/risultati/.
import vm from 'node:vm';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.argv[2] || 60);
const MINUTES = Number(process.argv[3] || 4);
const WHERE = process.argv[4] || 'locale';
const conf = JSON.parse(readFileSync(path.join(ROOT, 'prove', WHERE === 'online' ? '.online.json' : '.locale.json'), 'utf8'));
const SERVER = WHERE === 'online' ? (conf.rete ? conf.rete.url : conf.api) : 'http://127.0.0.1:54399';
const CONTROL = WHERE === 'online' ? (conf.rete ? conf.rete.controllo : null) : 'http://127.0.0.1:54398';
const KEY = conf.key;
const T0 = Date.now();
const SPAN = MINUTES * 60000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const log = (...a) => console.log(((Date.now() - T0) / 1000).toFixed(0).padStart(4) + 's', ...a);
const SOURCES = ['assets/data.js', 'assets/store.js', 'assets/sync.js'].map(f => [f, readFileSync(path.join(ROOT, f), 'utf8')]);
const COMUNI = ['Abetone Cutigliano', 'San Marcello Piteglio', 'Marliana', 'Sambuca Pistoiese', 'Pescia', 'Pistoia', 'Montale', 'Serravalle Pistoiese'];
const LOREM = 'Sulla Montagna Pistoiese ci sono boschi, borghi in pietra e sentieri per tutti. A {comune} si mangia bene e si dorme in agriturismi tranquilli. Il ponte sospeso, la funivia e le feste d’autunno attirano famiglie e camminatori. ';

// ---------- rete ----------
async function net(mode, p) {
  if (!CONTROL) return;
  try { await fetch(CONTROL + '/' + mode + (p ? '?p=' + p : '')); log('rete:', mode, p || ''); } catch (e) { log('controllo della rete non raggiungibile'); }
}
async function chaos() {
  if (!CONTROL) return;
  // Le stesse cadute, in proporzione alla durata: a caso, staccata, muta, risposte perse.
  const plan = [[0.12, 'caso', 0.3], [0.22, 'giu'], [0.30, 'su'], [0.42, 'muta'], [0.50, 'su'], [0.58, 'caso', 0.5], [0.68, 'su'], [0.74, 'persa'], [0.80, 'su'], [0.86, 'giu'], [0.92, 'su']];
  for (const [at, mode, p] of plan) {
    await sleep(Math.max(0, T0 + at * SPAN - Date.now()));
    await net(mode, p);
  }
}

// ---------- un PC finto ----------
// Un contesto JavaScript per pagina, con timer propri che si spengono quando si
// «cambia pagina». localStorage e sessionStorage restano quelli del PC.
function makeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear(), _map: m };
}
const stats = { requests: 0, failed: 0, maxMs: 0, totalMs: 0 };
async function countedFetch(url, opts) {
  const t = Date.now();
  stats.requests++;
  try {
    const r = await fetch(url, opts);
    const ms = Date.now() - t;
    stats.totalMs += ms;
    stats.maxMs = Math.max(stats.maxMs, ms);
    return r;
  } catch (e) { stats.failed++; throw e; }
}
function openPage(pc, page) {
  if (pc.timers) pc.timers.forEach(h => { clearTimeout(h); clearInterval(h); });
  const timers = new Set();
  const doc = { body: { dataset: { page } }, visibilityState: 'visible', addEventListener: () => {} };
  const ctx = {
    console: { log() {}, warn: (...a) => pc.warnings.push(a.join(' ')), error: (...a) => pc.warnings.push(a.join(' ')) },
    setTimeout: (fn, ms) => { const h = setTimeout(() => { timers.delete(h); fn(); }, ms); timers.add(h); return h; },
    clearTimeout: h => { clearTimeout(h); timers.delete(h); },
    setInterval: (fn, ms) => { const h = setInterval(fn, ms); timers.add(h); return h; },
    clearInterval: h => { clearInterval(h); timers.delete(h); },
    fetch: countedFetch, AbortController, crypto: globalThis.crypto,
    localStorage: pc.local, sessionStorage: pc.sessionStore, document: doc, navigator: { onLine: true },
    addEventListener: () => {}
  };
  ctx.window = ctx;
  ctx.LAB_EVENTO = { codice: 'lab', nome: 'AI Visibility Lab', domanda_esercizio_2: 'Cosa vedere sulla Montagna Pistoiese in un weekend, e dove dormire?' };
  ctx.LAB_SERVER = { url: SERVER, key: KEY };
  vm.createContext(ctx);
  for (const [f, src] of SOURCES) vm.runInContext(src, ctx, { filename: f });
  pc.timers = timers;
  pc.S = ctx.Store;
  pc.Y = ctx.Sync;
  return ctx;
}

async function participant(i) {
  const pc = { local: makeStorage(), sessionStore: makeStorage(), warnings: [], sends: [], n: i + 1 };
  const comune = COMUNI[i % COMUNI.length];
  const name = 'Struttura di prova ' + String(i + 1).padStart(2, '0');
  const at = f => sleep(Math.max(0, T0 + f * SPAN + rnd(0, 15000) - Date.now()));
  const pause = () => sleep(rnd(300, 1600));
  const save = () => { const s = pc.S.session.get(); const p = s && pc.S.byId('participants', s.participant_id); if (p) pc.S.computeProgress(p); pc.S.save(); };
  const longText = n => LOREM.replace('{comune}', comune).repeat(n);
  // Si «apre una pagina»: si chiede l'evento al server, poi si lavora.
  const page = async () => { openPage(pc, 'esercizio'); try { await pc.Y.refreshEvent(''); } catch (e) { /* vale evento.js */ } };
  const send = async ex => {
    const { S, Y } = pc;
    const p = S.byId('participants', S.session.get().participant_id);
    S.setSub(p, ex, null, 'inviato', new Date().toISOString());
    save();
    const t = Date.now();
    await Y.flushNow();
    const row = S.find('submissions', r => r.participant_id === p.id && r.exercise_id === ex && r.field === 'inviato');
    pc.sends.push({ ex, ok: Y.rowState('submissions', row) === 'ok', ms: Date.now() - t });
  };
  const engines = async (ev, p, ex, qid, prompt, rate) => {
    const { S } = pc;
    for (const m of ev.models) {
      const o = { ev, pid: p.id, ex, qid, engine: m, prompt };
      if (Math.random() < 0.04) { S.setUnavailable(o, p, true); save(); continue; }
      S.openRun(o, p); save(); await pause();
      S.pasteRun(o, p, longText(Math.ceil(rnd(2, 12)))); save(); await pause();
      // Ogni tanto si svuota e si incolla di nuovo: sul server la risposta vecchia va cancellata.
      if (Math.random() < 0.15) { S.pasteRun(o, p, ''); save(); await pause(); S.pasteRun(o, p, longText(3) + ' Seconda risposta.'); save(); }
      rate(o, S.runOf(o, true)); save(); await pause();
    }
  };

  await sleep(rnd(0, 12000));
  // Ingresso ed esercizio 1
  await page();
  let { S } = pc;
  const ev0 = S.configEvent();
  const p0 = S.createParticipant(ev0, { name, comune });
  S.session.set({ participant_id: p0.id, event_id: ev0.id });
  save();
  pc.pid = p0.id;
  const qs = S.faqQuestions(p0.id);
  const nq = Math.floor(rnd(2, 7));
  for (let k = 0; k < nq; k++) {
    const qtext = 'Domanda ' + (k + 1) + ' di ' + name + ': c’è il parcheggio?';
    for (let c = 1; c <= 3; c++) { S.update('questions', qs[k].id, { text: qtext.slice(0, Math.ceil(qtext.length * c / 3)) }); save(); await pause(); }
    const a = 'Sì, gratuito, a cento metri dalla struttura. Si arriva anche in autobus.';
    for (let c = 1; c <= 4; c++) { S.setSub(S.byId('participants', p0.id), 'faq', qs[k].id, 'risposta', a.slice(0, Math.ceil(a.length * c / 4))); save(); await pause(); }
  }
  S.setSub(S.byId('participants', p0.id), 'faq', null, 'faq_chatgpt', longText(10)); save();

  // Esercizio 2
  await at(0.25);
  await page(); S = pc.S;
  let ev = S.configEvent();
  let p = S.byId('participants', S.session.get().participant_id);
  const tq = S.territoryQuestion(ev);
  await engines(ev, p, 'territorio', tq.id, tq.text, o => { S.setSub(S.byId('participants', p.id), 'territorio', tq.id, 'citato_' + o.engine, Math.random() < 0.5 ? 'si' : 'no'); });
  S.setSub(S.byId('participants', p.id), 'territorio', tq.id, 'cosa_manca', 'Manca la festa della castagna di ' + comune + '.'); save();
  await send('territorio');

  // Esercizio 3
  await at(0.5);
  await page(); S = pc.S;
  ev = S.configEvent();
  p = S.byId('participants', S.session.get().participant_id);
  let prop = S.byId('properties', p.property_id);
  S.ensureHotelSetup(ev, p, prop); save();
  const own = S.selectedHotelQs(p.id);
  own.forEach((q, k) => { if (!q.text.trim()) S.update('questions', q.id, { text: 'Domanda sulla struttura ' + (k + 1) }); S.setSub(p, 'hotel', q.id, 'risposta', 'Risposta ' + (k + 1)); });
  const hq = S.setHotelQuestion(ev, p, S.hotelPrompt(prop, S.selectedHotelQs(p.id))); save();
  await engines(ev, p, 'hotel', hq.id, hq.text, (o, run) => { own.forEach(q => S.setEval(S.byId('participants', p.id), 'hotel', run.id, q.id, { rating: pickOne(['corretta', 'incompleta', 'errata']) })); });
  S.setSub(S.byId('participants', p.id), 'hotel', null, 'nota', 'Gli orari della reception.'); save();
  await send('hotel');

  // Esercizio 4
  await at(0.75);
  await page(); S = pc.S;
  ev = S.configEvent();
  p = S.byId('participants', S.session.get().participant_id);
  prop = S.byId('properties', p.property_id);
  const pq = S.positioningQuestion(ev, p, prop); save();
  await engines(ev, p, 'posizionamento', pq.id, pq.text, (o, run) => { S.setEval(S.byId('participants', p.id), 'posizionamento', run.id, null, { rating: pickOne(['si', 'in_parte', 'no']), note: 'Mancano le famiglie.' }); });
  S.setSub(S.byId('participants', p.id), 'posizionamento', pq.id, 'frase', 'Coppie che camminano.'); save();
  await send('posizionamento');
  // Si torna alla pagina iniziale e si resta lì.
  await page();
  return pc;
}

// ---------- verifica ----------
const SKIP = new Set(['from_server', 'device_id', 'rev', 'received_at']);
const isIso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(v);
const norm = v => {
  if (v === undefined || v === null) return null;
  if (isIso(v)) return new Date(v).getTime();
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {});
  return v;
};
function localRows(pc) {
  const d = pc.S.snapshot();
  const pid = pc.pid;
  const out = [];
  const runs = new Set(d.model_runs.filter(r => r.participant_id === pid).map(r => r.id));
  out.push(...d.participants.filter(r => r.id === pid).map(r => ['participants', r]));
  const prop = d.participants.find(r => r.id === pid).property_id;
  out.push(...d.properties.filter(r => r.id === prop).map(r => ['properties', r]));
  for (const t of ['questions', 'submissions', 'model_runs', 'evaluations', 'consent_records']) out.push(...d[t].filter(r => r.participant_id === pid).map(r => [t, r]));
  out.push(...d.model_responses.filter(r => runs.has(r.run_id)).map(r => ['model_responses', r]));
  return out;
}
// Si legge il server come il pannello: con un utente di prova del team o, online,
// con la chiave segreta del progetto (campo «secret», solo in prove/.online.json).
async function serverDump(evId) {
  let headers;
  if (conf.secret) {
    headers = { apikey: conf.secret, 'Content-Type': 'application/json' };
    if (!/^sb_/.test(conf.secret)) headers.Authorization = 'Bearer ' + conf.secret;
  } else {
    const u = conf.users.find(x => x.role === 'team') || conf.users[0];
    const tok = await (await fetch(conf.api + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.password }) })).json();
    headers = { apikey: KEY, Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' };
  }
  const r = await fetch(conf.api + '/rest/v1/rpc/lab_admin_event', { method: 'POST', headers, body: JSON.stringify({ p_event: evId, p_since: null }) });
  if (!r.ok) throw new Error('lab_admin_event ' + r.status + ' ' + await r.text());
  return r.json();
}

// ---------- via ----------
log(`${N} PC, ${MINUTES} minuti, server ${SERVER}${CONTROL ? ', rete finta attiva' : ''}`);
await net('su');
const chaosDone = chaos();
const results = await Promise.allSettled(Array.from({ length: N }, (_, i) => participant(i)));
await chaosDone;
await net('su');
const pcs = results.filter(r => r.status === 'fulfilled').map(r => r.value);
const crashed = results.filter(r => r.status === 'rejected').map(r => String(r.reason && r.reason.stack || r.reason));
log(`esercizi finiti da ${pcs.length} PC su ${N}${crashed.length ? '; errori: ' + crashed.length : ''}`);
crashed.slice(0, 3).forEach(c => console.log(c));

// Rete tornata: ogni PC finisce di mandare da solo (nuovi tentativi). Si aspetta al massimo 90 secondi.
const pendingSends = () => pcs.filter(pc => pc.sends.some(s => {
  const row = pc.S.find('submissions', r => r.participant_id === pc.pid && r.exercise_id === s.ex && r.field === 'inviato');
  return pc.Y.rowState('submissions', row) !== 'ok';
}));
const tWait = Date.now();
while (Date.now() - tWait < 90000) {
  if (!pendingSends().length) break;
  await sleep(2000);
}
// Un ultimo giro per le righe salvate dopo l'ultimo «Invia» (pagina iniziale).
await Promise.all(pcs.map(pc => pc.Y.flushNow()));
log(`invii ancora in attesa dopo il ritorno della rete: ${pendingSends().length}`);

const evId = pcs[0] && pcs[0].S.configEvent().id;
const dump = await serverDump(evId);
const server = {};
for (const t of Object.keys(dump.tables)) for (const r of dump.tables[t]) server[t + '|' + r.id] = r;
let rowsChecked = 0;
const diffs = [];
const seen = new Set();
for (const pc of pcs) {
  for (const [t, row] of localRows(pc)) {
    rowsChecked++;
    const k = t + '|' + row.id;
    seen.add(k);
    const s = server[k];
    if (!s) { diffs.push(`${pc.pid} ${k}: manca sul server`); continue; }
    for (const f of Object.keys(row)) {
      if (SKIP.has(f)) continue;
      if (JSON.stringify(norm(row[f])) !== JSON.stringify(norm(s[f]))) diffs.push(`${pc.pid} ${k}.${f}: PC ${JSON.stringify(row[f]).slice(0, 60)} / server ${JSON.stringify(s[f]).slice(0, 60)}`);
    }
  }
}
const pids = new Set(pcs.map(pc => pc.pid));
const extra = Object.keys(server).filter(k => !seen.has(k) && !(k.startsWith('questions|') && server[k].participant_id == null) && pids.has(server[k].participant_id || (k.startsWith('participants|') ? server[k].id : '')));
const sends = pcs.flatMap(pc => pc.sends);
const immediate = sends.filter(s => s.ok).length;
const summary = {
  quando: new Date().toISOString(), dove: WHERE, pc: N, minuti: MINUTES, pc_finiti: pcs.length, errori_nei_pc: crashed.length,
  richieste: stats.requests, richieste_fallite: stats.failed, tempo_medio_ms: Math.round(stats.totalMs / Math.max(1, stats.requests - stats.failed)), tempo_massimo_ms: stats.maxMs,
  invia_premuti: sends.length, invia_confermati_subito: immediate, invia_confermati_dopo: sends.length - immediate - pendingSends().length, invia_mai_confermati: pendingSends().length,
  righe_controllate: rowsChecked, righe_diverse_o_mancanti: diffs.length, righe_in_piu_sul_server: extra.length,
  partecipanti_sul_server: dump.tables.participants.filter(p => pids.has(p.id)).length,
  avvisi_dai_pc: pcs.reduce((n, pc) => n + pc.warnings.length, 0)
};
console.log(JSON.stringify(summary, null, 2));
diffs.slice(0, 15).forEach(d => console.log('  diverso:', d));
extra.slice(0, 10).forEach(k => console.log('  in più sul server:', k));
pcs.flatMap(pc => pc.warnings).slice(0, 5).forEach(w => console.log('  avviso:', w));
mkdirSync(path.join(ROOT, 'prove', 'risultati'), { recursive: true });
writeFileSync(path.join(ROOT, 'prove', 'risultati', `carico-${WHERE}-${N}pc-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`), JSON.stringify({ summary, diffs, extra }, null, 2));
process.exit(diffs.length || extra.length || summary.invia_mai_confermati || crashed.length ? 1 : 0);
