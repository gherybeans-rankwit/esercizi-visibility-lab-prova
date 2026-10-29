// Invio delle risposte a RankWit (Fase 2).
// Il localStorage resta la copia sicura. Dopo ogni salvataggio le righe nuove o
// cambiate di questo PC vanno al server, in coda: 2 secondi dopo l'ultima modifica
// (al massimo ogni 6 secondi mentre si scrive), con nuovi tentativi se la rete
// cade. Nessuna libreria: fetch verso le funzioni lab_event e lab_sync del
// database (supabase/migrations). Il PC si riconosce con un id e un segreto
// casuali, creati qui la prima volta: niente login.

(function () {
  const S = window.Store;
  const CFG = window.LAB_SERVER || {};
  const ENABLED = !!(CFG.url && CFG.key) && document.body.dataset.page !== 'admin';
  const STATE_KEY = 'labportale.invio';
  const DEBOUNCE = 2000;
  const MAX_WAIT = 6000;
  const TIMEOUT = 10000;
  const MAX_ROWS = 250;
  const MAX_BYTES = 300000;
  // Il server cancella solo queste righe (per esempio una risposta incollata e poi svuotata).
  const DELETABLE = ['consent_records', 'questions', 'submissions', 'model_runs', 'model_responses', 'evaluations'];

  // ---------- server ----------
  function headers() {
    const h = { 'Content-Type': 'application/json', apikey: CFG.key };
    // Le chiavi nuove (sb_publishable_…) vanno solo in apikey; quelle vecchie anche come token.
    if (!/^sb_/.test(CFG.key)) h.Authorization = 'Bearer ' + CFG.key;
    return h;
  }
  async function rpc(name, body, opts) {
    const o = opts || {};
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), o.timeout || TIMEOUT);
    try {
      const res = await fetch(CFG.url.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: headers(), body: JSON.stringify(body), signal: ctrl.signal, cache: 'no-store', keepalive: !!o.keepalive
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new Error('Il server risponde ' + res.status + ': ' + text.slice(0, 300));
        err.status = res.status;
        throw err;
      }
      return text ? JSON.parse(text) : null;
    } finally {
      clearTimeout(t);
    }
  }

  // ---------- stato dell'invio ----------
  // device: id e segreto del PC; rev: versione dell'ultimo invio; pids: i
  // partecipanti creati su questo PC; acked: per ogni riga, l'impronta dell'ultima
  // versione che il server ha confermato e il partecipante a cui appartiene.
  let mem = null;
  function randomHex(bytes) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const h = randomHex(16);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-' + ((parseInt(h[16], 16) & 3) | 8).toString(16) + h.slice(17, 20) + '-' + h.slice(20);
  }
  function loadState() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch (e) { st = null; }
    if (!st || !st.device || !st.device.id || !st.device.secret) st = mem || { device: { id: uuid(), secret: randomHex(32) }, rev: 0, pids: [], acked: {} };
    st.acked = st.acked || {};
    st.pids = st.pids || [];
    mem = st;
    return st;
  }
  function saveState(st) {
    mem = st;
    try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) { /* resta in memoria per questa pagina */ }
  }
  // Impronta di una riga: due hash a 32 bit e la lunghezza.
  function sig(s) {
    let a = 2166136261;
    let b = 5381;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = (Math.imul(b, 33) ^ c) | 0;
    }
    return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + s.length.toString(36);
  }

  // Tutte le righe dei partecipanti di questo PC, con impronta.
  function collect(st, data) {
    const out = new Map();
    const add = (t, row, pid) => {
      if (!row || !row.id) return;
      const s = JSON.stringify(row);
      out.set(t + '|' + row.id, { t, id: row.id, row, pid: pid || null, h: sig(s), n: s.length });
    };
    const pids = new Set(st.pids);
    const sess = S.session.get();
    if (sess && sess.participant_id) pids.add(sess.participant_id);
    pids.forEach(pid => {
      const p = data.participants.find(x => x.id === pid);
      if (!p) return;
      const ev = data.events.find(e => e.id === p.event_id);
      // Un evento di evento.js (il server non rispondeva): il server lo crea se non lo conosce.
      if (ev && !ev.from_server) {
        add('events', ev);
        data.questions.forEach(q => { if (q.event_id === ev.id && q.participant_id == null && q.source === 'evento') add('questions', q); });
      }
      add('properties', data.properties.find(x => x.id === p.property_id));
      add('participants', p, pid);
      const runs = new Set();
      data.consent_records.forEach(r => { if (r.participant_id === pid) add('consent_records', r, pid); });
      data.questions.forEach(r => { if (r.participant_id === pid) add('questions', r, pid); });
      data.submissions.forEach(r => { if (r.participant_id === pid) add('submissions', r, pid); });
      data.model_runs.forEach(r => { if (r.participant_id === pid) { add('model_runs', r, pid); runs.add(r.id); } });
      data.model_responses.forEach(r => { if (runs.has(r.run_id)) add('model_responses', r, pid); });
      data.evaluations.forEach(r => { if (r.participant_id === pid) add('evaluations', r, pid); });
    });
    return out;
  }

  // Righe rifiutate dal server: non si rimandano uguali per 5 minuti.
  const rejected = new Map();

  // Un giro: manda a pezzi tutto quello che manca, finché non resta niente.
  async function runOnce() {
    for (let round = 0; round < 40; round++) {
      if (navigator.onLine === false) throw new Error('Il PC non è connesso');
      const st = loadState();
      const sess = S.session.get();
      if (sess && sess.participant_id && st.pids.indexOf(sess.participant_id) < 0) st.pids.push(sess.participant_id);
      const data = S.snapshot();
      const cur = collect(st, data);
      const present = new Set(data.participants.map(p => p.id));
      const now = Date.now();
      const rows = [];
      const dels = [];
      let bytes = 0;
      let more = false;
      cur.forEach((x, k) => {
        const a = st.acked[k];
        if (a && a[0] === x.h) return;
        const r = rejected.get(k);
        if (r && r.h === x.h && now - r.at < 300000) return;
        if (rows.length < MAX_ROWS && (!rows.length || bytes + x.n < MAX_BYTES)) { rows.push(x); bytes += x.n; } else more = true;
      });
      // Cancellate: solo se il partecipante c'è ancora. Se sparisse tutto (dati del
      // browser cancellati) non si cancella niente sul server.
      Object.keys(st.acked).forEach(k => {
        if (cur.has(k)) return;
        const t = k.slice(0, k.indexOf('|'));
        if (DELETABLE.indexOf(t) < 0 || !present.has(st.acked[k][1])) return;
        if (dels.length < MAX_ROWS) dels.push({ t, id: k.slice(k.indexOf('|') + 1), k }); else more = true;
      });
      if (!rows.length && !dels.length) { saveState(st); return; }
      st.rev = Math.max((st.rev || 0) + 1, Date.now());
      // Una riga mandata può arrivare al server anche se la conferma si perde: si
      // segna subito (impronta vuota = non confermata), così se poi si cancella sul
      // PC si cancella anche sul server.
      rows.forEach(x => { const k = x.t + '|' + x.id; if (!st.acked[k]) st.acked[k] = ['', x.pid]; });
      saveState(st);
      const res = await rpc('lab_sync', {
        p_device: st.device.id, p_secret: st.device.secret, p_rev: st.rev,
        p_rows: rows.map(x => ({ t: x.t, id: x.id, row: x.row })),
        p_deleted: dels.map(d => ({ t: d.t, id: d.id }))
      });
      const rej = new Map(((res && res.rejected) || []).map(r => [r.t + '|' + r.id + (r.del ? '|del' : ''), r.err]));
      const st2 = loadState();
      rows.forEach(x => {
        const k = x.t + '|' + x.id;
        if (rej.has(k)) {
          rejected.set(k, { h: x.h, at: Date.now() });
          console.warn('Il server ha rifiutato ' + k + ': ' + rej.get(k));
        } else {
          st2.acked[k] = [x.h, x.pid];
          rejected.delete(k);
        }
      });
      dels.forEach(d => { if (!rej.has(d.k + '|del')) delete st2.acked[d.k]; });
      saveState(st2);
      if (!more) return;
    }
  }

  // Una scheda alla volta: con due schede aperte sullo stesso PC si aspetta il turno.
  function withLock(fn) {
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('labportale-invio', fn);
    return fn();
  }

  const status = { sending: false, failing: false, lastOk: null, error: null };
  const listeners = new Set();
  function setStatus(patch) {
    Object.assign(status, patch);
    listeners.forEach(fn => { try { fn(Object.assign({}, status)); } catch (e) { console.error(e); } });
  }

  let timer = null;
  let firstAt = 0;
  let retryTimer = null;
  let backoff = 0;
  let inflight = null;
  let again = false;
  function schedule() {
    const now = Date.now();
    if (!firstAt) firstAt = now;
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(() => {}), Math.max(0, Math.min(DEBOUNCE, firstAt + MAX_WAIT - now)));
  }
  // Manda subito. Se un invio è già in corso, ne parte un altro appena finisce.
  function flush() {
    clearTimeout(timer);
    timer = null;
    firstAt = 0;
    if (inflight) { again = true; return inflight; }
    clearTimeout(retryTimer);
    retryTimer = null;
    setStatus({ sending: true });
    inflight = withLock(runOnce).then(() => {
      backoff = 0;
      setStatus({ sending: false, failing: false, lastOk: new Date(), error: null });
    }, err => {
      // Nuovo tentativo dopo 2, 4, 8, poi ogni 15 secondi.
      backoff = Math.min(15000, backoff ? backoff * 2 : 2000);
      retryTimer = setTimeout(() => flush().catch(() => {}), backoff + Math.random() * 1000);
      setStatus({ sending: false, failing: true, error: String((err && err.message) || err) });
      throw err;
    }).finally(() => {
      inflight = null;
      if (again) {
        again = false;
        if (!status.failing) flush().catch(() => {});
      }
    });
    return inflight;
  }
  // Per «Invia»: risponde true quando il server ha confermato tutto ciò che c'era da mandare.
  async function flushNow() {
    if (!ENABLED) return true;
    if (inflight) { try { await inflight; } catch (e) { /* si riprova qui sotto */ } }
    try { await flush(); } catch (e) { return false; }
    return true;
  }
  // Stato di una riga: «ok» se il server ha questa versione, altrimenti «sending» o «failing».
  function rowState(t, row) {
    if (!ENABLED || !row) return 'ok';
    const a = loadState().acked[t + '|' + row.id];
    if (a && a[0] === sig(JSON.stringify(row))) return 'ok';
    return status.failing ? 'failing' : 'sending';
  }

  // ---------- il Lab di oggi ----------
  function signature(code) {
    const ev = code ? S.eventByCode(code) : S.configEvent();
    if (!ev) return '';
    const q = S.territoryQuestion(ev);
    return JSON.stringify([ev.id, ev.name, ev.status, ev.models, q ? q.text : '']);
  }
  // Chiede al server l'evento in corso (o quello del codice) e lo salva sul PC.
  // Risponde true se è cambiato qualcosa che la pagina mostra.
  async function refreshEvent(code) {
    if (!ENABLED) return false;
    const before = signature(code);
    const data = await rpc('lab_event', { p_code: code || null }, { timeout: 8000 });
    if (data && data.event) {
      S.applyServerEvent(data);
      if (!code) S.setServerCurrent(data.event.id);
    } else if (!code) {
      // Nessun evento aperto sul server: vale evento.js.
      S.setServerCurrent(null);
      S.syncConfigEvent();
    }
    // Si salva senza avvisare la pagina: l'evento non è una risposta da mandare.
    S.persist();
    return signature(code) !== before;
  }

  if (ENABLED) {
    saveState(loadState());
    S.onChange(e => { if (e.type === 'saved') schedule(); });
    window.addEventListener('online', () => flush().catch(() => {}));
    // Quando si passa alla scheda di un motore o si chiude la pagina, si manda subito.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush().catch(() => {}); });
    // Rete di sicurezza: ogni 30 secondi si controlla se è rimasto qualcosa.
    setInterval(() => { if (!inflight && !retryTimer) flush().catch(() => {}); }, 30000);
    // Quello che è rimasto dall'ultima volta.
    setTimeout(() => flush().catch(() => {}), 800);
  }

  window.Sync = {
    enabled: ENABLED, rpc, flush, flushNow, rowState, refreshEvent,
    state: () => Object.assign({}, status),
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
