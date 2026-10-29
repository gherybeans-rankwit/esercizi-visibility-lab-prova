// Archivio del prototipo. Le tabelle sono quelle del piano di sviluppo
// (events, participants, properties, exercises, submissions, questions,
// model_runs, model_responses, evaluations, consent_records) e vivono nel
// localStorage del browser. In produzione diventano tabelle PostgreSQL.
//
// Versione a schede: nessuna API. Il partecipante apre il motore in un'altra
// scheda, senza account. Una riga di model_runs è un'apertura del motore,
// model_responses è il testo che il partecipante incolla.

(function () {
  const D = window.LAB_DATA;
  const KEY = 'labportale.pagine.v1';
  const SESSION_KEY = 'labportale.pagine.sessione';
  const ADMIN_KEY = 'labportale.admin';
  const TABLES = ['events', 'properties', 'participants', 'consent_records', 'exercises', 'questions', 'submissions', 'model_runs', 'model_responses', 'evaluations'];

  let db = null;
  const listeners = new Set();

  // ---------- utilità ----------
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function uid(prefix, n = 8) {
    const buf = new Uint32Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(buf);
    else buf.forEach((_, i) => { buf[i] = Math.random() * 1e9; });
    let s = '';
    buf.forEach(v => { s += ALPHA[v % ALPHA.length]; });
    return prefix + s;
  }
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  }
  const nowIso = () => new Date().toISOString();

  // ---------- persistenza ----------
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        db = JSON.parse(raw);
        TABLES.forEach(t => { db[t] = db[t] || []; });
        return;
      }
    } catch (e) { /* storage non disponibile: si lavora in memoria */ }
    db = seed();
    persist();
  }
  // Il Lab di oggi arriva da evento.js, uguale su tutti i PC: si crea o si
  // aggiorna a ogni apertura, così un cambio di nome o di domanda arriva a tutti.
  function syncConfigEvent() {
    const cfg = window.LAB_EVENTO;
    if (!cfg || !cfg.codice) return;
    const code = String(cfg.codice).trim().toLowerCase();
    let ev = byId('events', 'E-' + code);
    if (!ev) {
      ev = insert('events', { id: 'E-' + code, code, name: cfg.nome || 'AI Visibility Lab', date: new Date().toISOString().slice(0, 10), place: '', territory_label: '', status: 'aperto', capacity: 50, models: Object.keys(D.MODELS), consent_version: D.CONSENT_VERSION, territory_question_id: null, created_at: nowIso() });
    }
    ev.name = cfg.nome || ev.name;
    ev.status = 'aperto';
    const text = (cfg.domanda_esercizio_2 || '').trim();
    const cur = territoryQuestion(ev);
    if (text && (!cur || cur.text !== text)) {
      let q = find('questions', x => x.event_id === ev.id && x.exercise_id === 'territorio' && x.text === text);
      if (!q) q = insert('questions', { id: uid('Q-'), event_id: ev.id, exercise_id: 'territorio', participant_id: null, key: null, text, source: 'evento', position: filter('questions', x => x.event_id === ev.id && x.exercise_id === 'territorio').length, created_at: nowIso() });
      ev.territory_question_id = q.id;
    }
  }
  const configEvent = () => (window.LAB_EVENTO ? byId('events', 'E-' + String(window.LAB_EVENTO.codice).trim().toLowerCase()) : null);
  function save() {
    const ok = persist();
    listeners.forEach(fn => fn({ type: 'saved', ok, at: new Date() }));
    return ok;
  }
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    load();
    syncConfigEvent();
    listeners.forEach(fn => fn({ type: 'external' }));
  });

  // ---------- accesso alle tabelle ----------
  const all = t => db[t];
  const find = (t, pred) => db[t].find(pred);
  const filter = (t, pred) => db[t].filter(pred);
  const byId = (t, id) => db[t].find(r => r.id === id);
  function insert(t, row) { db[t].push(row); return row; }
  function update(t, id, patch) {
    const r = byId(t, id);
    if (r) Object.assign(r, patch);
    return r;
  }

  // ---------- eventi ----------
  const eventByCode = code => find('events', e => e.code === String(code || '').trim().toLowerCase());
  const territoryQuestion = ev => byId('questions', ev.territory_question_id);

  function createEvent(data) {
    const ev = insert('events', {
      id: uid('E-', 6),
      code: data.code,
      name: data.name,
      date: data.date,
      place: data.place,
      territory_label: data.territory_label || data.place,
      status: data.status || 'aperto',
      capacity: Number(data.capacity) || 50,
      models: data.models || Object.keys(D.MODELS),
      consent_version: data.consent_version || D.CONSENT_VERSION,
      territory_question_id: null,
      created_at: nowIso()
    });
    (data.prompts || []).forEach((p, i) => {
      const q = insert('questions', { id: uid('Q-'), event_id: ev.id, exercise_id: 'territorio', participant_id: null, key: null, text: p, source: 'evento', position: i, created_at: nowIso() });
      if (i === 0) ev.territory_question_id = q.id;
    });
    return ev;
  }

  // ---------- partecipanti ----------
  // Un partecipante è solo nome e comune della struttura, legati a questo browser:
  // niente account, niente codici. L'informativa si firma su carta all'ingresso.
  function createParticipant(ev, form, at) {
    const created = at || nowIso();
    const nameKey = (form.name.trim() + '|' + form.comune.trim()).toLowerCase();
    let prop = find('properties', p => p.event_id === ev.id && (p.name + '|' + p.comune).toLowerCase() === nameKey);
    if (!prop) {
      prop = insert('properties', { id: uid('S-', 6), event_id: ev.id, name: form.name.trim(), comune: form.comune.trim(), type: form.type || '', created_at: created });
    }
    const p = insert('participants', {
      id: uid('P-', 5), event_id: ev.id, property_id: prop.id,
      created_at: created, last_seen_at: created,
      current_step: 'faq', progress: { faq: false, territorio: false, hotel: false, posizionamento: false }
    });
    D.FAQ_DEFAULT.forEach((f, i) => {
      // Le domande partono vuote: le scrive il partecipante.
      insert('questions', { id: uid('Q-'), event_id: ev.id, exercise_id: 'faq', participant_id: p.id, key: f.key, text: '', source: 'sistema', position: i, created_at: created });
    });
    return p;
  }


  // ---------- risposte del partecipante ----------
  function getSub(pid, ex, qid, field) {
    const s = find('submissions', r => r.participant_id === pid && r.exercise_id === ex && r.question_id === (qid || null) && r.field === field);
    return s ? s.value : '';
  }
  function setSub(p, ex, qid, field, value) {
    let s = find('submissions', r => r.participant_id === p.id && r.exercise_id === ex && r.question_id === (qid || null) && r.field === field);
    if (s) { s.value = value; s.updated_at = nowIso(); }
    else s = insert('submissions', { id: uid('R-'), participant_id: p.id, event_id: p.event_id, exercise_id: ex, question_id: qid || null, field, value, updated_at: nowIso() });
    touch(p);
    return s;
  }
  // Una valutazione per risposta incollata e, nell'esercizio 3, per domanda.
  function getEval(pid, runId, qid) {
    return find('evaluations', r => r.participant_id === pid && r.run_id === runId && r.question_id === (qid || null));
  }
  function setEval(p, ex, runId, qid, patch) {
    let e = getEval(p.id, runId, qid);
    if (e) Object.assign(e, patch, { updated_at: nowIso() });
    else e = insert('evaluations', Object.assign({ id: uid('V-'), participant_id: p.id, event_id: p.event_id, exercise_id: ex, run_id: runId, question_id: qid || null, rating: '', note: '' }, patch, { updated_at: nowIso() }));
    touch(p);
    return e;
  }
  function touch(p) { p.last_seen_at = nowIso(); }

  function faqQuestions(pid) {
    return filter('questions', q => q.participant_id === pid && q.exercise_id === 'faq').sort((a, b) => a.position - b.position);
  }

  // ---------- aperture dei motori ----------
  function runOf(o, create, at) {
    let run = find('model_runs', r => r.participant_id === o.pid && r.exercise_id === o.ex && r.question_id === o.qid && r.engine === o.engine);
    if (!run && create) {
      const m = D.MODELS[o.engine];
      run = insert('model_runs', {
        id: uid('M-'), event_id: o.ev.id, participant_id: o.pid, exercise_id: o.ex, question_id: o.qid,
        provider: m.provider, engine: o.engine, channel: m.channel, prompt: o.prompt,
        params: JSON.stringify({ account: 'nessuno', domanda: o.ex === 'hotel' ? 'scritta dal partecipante' : 'copiata dal portale e incollata dal partecipante', ricerca_web: 'decide il motore' }),
        opened_at: null, opens: 0, pasted_at: null, status: 'non_aperta', created_at: at || nowIso()
      });
    }
    return run || null;
  }
  function openRun(o, p) {
    const run = runOf(o, true);
    const t = nowIso();
    if (!run.opened_at) run.opened_at = t;
    run.last_opened_at = t;
    run.opens = (run.opens || 0) + 1;
    if (run.status === 'non_aperta' || run.status === 'non_disponibile') run.status = responseFor(run.id) ? 'incollata' : 'aperta';
    touch(p);
    return run;
  }
  const responseFor = runId => find('model_responses', r => r.run_id === runId);
  function pasteRun(o, p, text) {
    const run = runOf(o, true);
    const clean = String(text || '').slice(0, 20000);
    let resp = responseFor(run.id);
    if (clean.trim()) {
      if (resp) Object.assign(resp, { text: clean, updated_at: nowIso() });
      else resp = insert('model_responses', { id: uid('A-'), run_id: run.id, text: clean, created_at: nowIso(), updated_at: nowIso() });
      run.pasted_at = nowIso();
      run.status = 'incollata';
    } else if (resp) {
      db.model_responses = db.model_responses.filter(r => r !== resp);
      run.pasted_at = null;
      run.status = run.opened_at ? 'aperta' : 'non_aperta';
    }
    touch(p);
    return run;
  }
  function setUnavailable(o, p, on) {
    const run = runOf(o, true);
    run.status = on ? 'non_disponibile' : (responseFor(run.id) ? 'incollata' : run.opened_at ? 'aperta' : 'non_aperta');
    touch(p);
    return run;
  }

  // Nomi alternativi di un comune (frazioni note): da riempire per evento se serve.
  const ALIASES = {};
  function aliases(comune) { return ALIASES[comune] || [comune]; }
  function mentions(text, comune) {
    const names = aliases(comune).filter(Boolean).map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return names.length > 0 && new RegExp('(^|[^\\p{L}])(' + names.join('|') + ')(?!\\p{L})', 'iu').test(text);
  }

  // ---------- domande composte ----------
  function hotelPrompt(prop, qs) {
    return 'Scritta dal partecipante. Domande: ' + qs.map((q, i) => (i + 1) + ') ' + (q.text.trim() || '(da scrivere)')).join(' ');
  }
  // Esercizio 3: una riga «sistema» tiene il testo delle tre domande (è la domanda
  // delle schede motore); le tre domande del partecipante sono righe «partecipante».
  function hotelQuestion(ev, p) {
    return find('questions', x => x.participant_id === p.id && x.exercise_id === 'hotel' && x.source === 'sistema');
  }
  function setHotelQuestion(ev, p, text, at) {
    let q = hotelQuestion(ev, p);
    if (q) q.text = text;
    else q = insert('questions', { id: uid('Q-'), event_id: ev.id, exercise_id: 'hotel', participant_id: p.id, key: null, text, source: 'sistema', position: 0, created_at: at || nowIso() });
    return q;
  }
  // «Nome (territorio)», senza ripetere il territorio quando coincide con il nome
  // (una destinazione come «Montagna Pistoiese»). Vale per hotel e destinazioni.
  function nameWithPlace(prop) {
    const n = (prop.name || '').trim();
    const c = (prop.comune || '').trim();
    if (!c || n.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(n.toLowerCase())) return n;
    return n + ' (' + c + ')';
  }
  function positioningQuestion(ev, p, prop, at) {
    let q = find('questions', x => x.participant_id === p.id && x.exercise_id === 'posizionamento');
    if (!q) {
      q = insert('questions', { id: uid('Q-'), event_id: ev.id, exercise_id: 'posizionamento', participant_id: p.id, key: null, text: 'A che tipo di viaggiatore consiglieresti ' + nameWithPlace(prop) + '? Rispondi in poche righe e spiega perché.', source: 'sistema', position: 0, created_at: at || nowIso() });
    }
    return q;
  }
  function selectedHotelQs(pid) {
    return filter('questions', q => q.participant_id === pid && q.exercise_id === 'hotel' && q.source === 'partecipante').sort((a, b) => a.position - b.position);
  }
  // L'esercizio 3 non dipende dall'1: tre domande del partecipante, vuote. Le caselle
  // ancora vuote si riempiono con le domande (e risposte) che ha scritto nell'1.
  function ensureHotelSetup(ev, p, prop) {
    let own = selectedHotelQs(p.id);
    for (let i = own.length; i < 3; i++) {
      insert('questions', { id: uid('Q-'), event_id: ev.id, exercise_id: 'hotel', participant_id: p.id, key: null, text: '', source: 'partecipante', position: i, created_at: nowIso() });
    }
    own = selectedHotelQs(p.id);
    const used = new Set(own.map(q => q.text.trim()).filter(Boolean));
    const pool = faqQuestions(p.id).filter(q => q.text.trim() && !used.has(q.text.trim()));
    own.forEach(q => {
      if (q.text.trim() || getSub(p.id, 'hotel', q.id, 'risposta').trim() || !pool.length) return;
      const f = pool.shift();
      q.text = f.text.trim();
      const a = getSub(p.id, 'faq', f.id, 'risposta').trim();
      if (a) setSub(p, 'hotel', q.id, 'risposta', a);
    });
    return setHotelQuestion(ev, p, hotelPrompt(prop, own));
  }

  // ---------- avanzamento ----------
  // Un motore che non si apre si salta, ma serve almeno un motore con le risposte.
  function exerciseQuestion(ev, p, ex) {
    if (ex === 'territorio') return territoryQuestion(ev);
    if (ex === 'hotel') return hotelQuestion(ev, p);
    if (ex === 'posizionamento') return find('questions', x => x.participant_id === p.id && x.exercise_id === 'posizionamento');
    return null;
  }
  function usableModels(ev, p, ex) {
    const q = exerciseQuestion(ev, p, ex);
    if (!q) return null;
    return ev.models.filter(m => { const r = runOf({ pid: p.id, ex, qid: q.id, engine: m }, false); return !(r && r.status === 'non_disponibile'); });
  }
  function allOff(p, ex) {
    if (ex === 'faq') return false;
    const ev = byId('events', p.event_id);
    const u = usableModels(ev, p, ex);
    return !!u && u.length === 0;
  }
  function computeProgress(p) {
    const ev = byId('events', p.event_id);
    const runFor = (ex, qid, m) => runOf({ pid: p.id, ex, qid, engine: m }, false);
    const done = (ex, check) => {
      const q = exerciseQuestion(ev, p, ex);
      const u = usableModels(ev, p, ex);
      return !!q && !!u && u.length > 0 && u.every(m => check(q, runFor(ex, q.id, m), m));
    };
    const sel = selectedHotelQs(p.id);
    // Esercizi 2, 3 e 4: finiti quando ogni motore aperto ha risposta incollata e
    // valutazione, e il partecipante ha premuto «Invia».
    const pasted = r => !!r && !!responseFor(r.id) && responseFor(r.id).text.trim() !== '';
    const sent = ex => getSub(p.id, ex, null, 'inviato') !== '';
    p.progress = {
      // Esercizio 1: finito quando c'è il testo delle FAQ scritto da ChatGPT.
      faq: getSub(p.id, 'faq', null, 'faq_chatgpt').trim() !== '',
      territorio: sent('territorio') && done('territorio', (q, r, m) => pasted(r) && getSub(p.id, 'territorio', q.id, 'citato_' + m) !== ''),
      hotel: sent('hotel') && sel.length > 0 && sel.every(x => x.text.trim()) && done('hotel', (q, r) => pasted(r) && sel.every(x => { const e = getEval(p.id, r.id, x.id); return e && e.rating; })),
      posizionamento: sent('posizionamento') && done('posizionamento', (q, r) => pasted(r) && !!getEval(p.id, r.id, null) && !!getEval(p.id, r.id, null).rating)
    };
    return p.progress;
  }

  // ---------- export CSV ----------
  function toCSV(rows, cols) {
    const sep = ';';
    const cell = v => {
      if (v == null) return '';
      let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      // Excel legge come formula le celle che iniziano con = + - @: le teniamo come testo.
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const columns = cols || Array.from(rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set()));
    return '﻿' + [columns.join(sep)].concat(rows.map(r => columns.map(c => cell(r[c])).join(sep))).join('\r\n');
  }

  // ---------- dati dimostrativi ----------
  // Simula partecipanti che hanno aperto i motori e incollato le risposte.
  function seed() {
    db = {};
    TABLES.forEach(t => { db[t] = []; });
    D.EXERCISES.forEach(e => insert('exercises', { id: e.id, position: e.n, title: e.long }));
    if (window.LAB_EVENTO) return db;

    const today = new Date();
    const Q2 = ['Cosa vedere a {comune} e dintorni in un weekend, e dove dormire?', 'Quali sono i posti più belli da visitare vicino a {comune}?'];
    createEvent({
      code: 'prova', name: 'Lab di prova', date: today.toISOString().slice(0, 10), place: 'Da definire',
      prompts: Q2, status: 'aperto', capacity: 50
    });
    const ev = createEvent({
      code: 'esempio', name: 'Lab di esempio (dati inventati)', date: today.toISOString().slice(0, 10), place: 'Da definire',
      prompts: Q2, status: 'chiuso', capacity: 50
    });
    const tq = territoryQuestion(ev);
    const r = rng(20261029);
    // L'attività dimostrativa finisce pochi minuti prima del caricamento.
    const start = new Date(today.getTime() - 125 * 60000);
    const minutes = m => new Date(start.getTime() + m * 60000).toISOString();
    const stages = ['faq', 'faq', 'faq', 'territorio', 'territorio', 'territorio', 'territorio', 'hotel', 'hotel', 'hotel', 'hotel', 'hotel', 'hotel', 'posizionamento', 'posizionamento', 'posizionamento', 'posizionamento', 'posizionamento', 'fine', 'fine', 'fine', 'fine', 'fine', 'fine'];
    const order = ['faq', 'territorio', 'hotel', 'posizionamento', 'fine'];
    let noteIdx = 0;

    // Apre, incolla (quasi sempre) e restituisce la riga; a volte il motore non si apre.
    const visit = (o, text, t) => {
      const run = runOf(o, true, minutes(t));
      if (r() < 0.04) { run.status = 'non_disponibile'; return null; }
      Object.assign(run, { opened_at: minutes(t), last_opened_at: minutes(t), opens: 1, status: 'aperta' });
      if (r() < 0.9) {
        insert('model_responses', { id: uid('A-'), run_id: run.id, text, created_at: minutes(t + 2), updated_at: minutes(t + 2) });
        Object.assign(run, { pasted_at: minutes(t + 2), status: 'incollata' });
      }
      return run;
    };

    stages.forEach((stage, i) => {
      const n = String(i + 1).padStart(2, '0');
      const name = 'Struttura di esempio ' + n;
      const comune = D.DEMO_COMUNI[Math.floor(r() * D.DEMO_COMUNI.length)];
      const type = ['Agriturismo', 'Hotel', 'B&B', 'Agriturismo', 'Casa vacanze'][Math.floor(r() * 5)];
      const t0 = 2 + Math.floor(r() * 12);
      const p = createParticipant(ev, { name, comune, type }, minutes(t0));
      const prop = byId('properties', p.property_id);
      const vars = { nome: name, comune };
      const reached = order.indexOf(stage);
      let t = t0 + 3;

      const qs = faqQuestions(p.id);
      const answered = reached === 0 ? 3 + Math.floor(r() * 6) : 10;
      qs.slice(0, answered).forEach(q => {
        insert('submissions', { id: uid('R-'), participant_id: p.id, event_id: ev.id, exercise_id: 'faq', question_id: q.id, field: 'risposta', value: 'Risposta dimostrativa.', updated_at: minutes(t) });
      });
      t += 20;
      if (reached >= 1) insert('submissions', { id: uid('R-'), participant_id: p.id, event_id: ev.id, exercise_id: 'faq', question_id: null, field: 'faq_chatgpt', value: 'Domande frequenti di ' + name + ' (testo di esempio scritto da ChatGPT).', updated_at: minutes(t) });

      if (reached >= 2) {
        t += 12;
        const q2 = tq.text.replace(/\{comune\}/g, comune);
        ev.models.forEach(m => {
          const text = fill(D.TERRITORY[m][r() < 0.4 ? 0 : 1], vars);
          const run = visit({ ev, pid: p.id, ex: 'territorio', qid: tq.id, engine: m, prompt: q2 }, text, t);
          if (run) insert('submissions', { id: uid('R-'), participant_id: p.id, event_id: ev.id, exercise_id: 'territorio', question_id: tq.id, field: 'citato_' + m, value: mentions(text, comune) ? 'si' : 'no', updated_at: minutes(t + 3) });
        });
        if (r() > 0.55 && noteIdx < D.DEMO_NOTES.length) {
          insert('submissions', { id: uid('R-'), participant_id: p.id, event_id: ev.id, exercise_id: 'territorio', question_id: tq.id, field: 'cosa_manca', value: D.DEMO_NOTES[noteIdx++], updated_at: minutes(t + 4) });
        }
      }

      if (reached >= 3) {
        t += 15;
        const sel = qs.slice(0, 3);
        sel.forEach(q => insert('submissions', { id: uid('R-'), participant_id: p.id, event_id: ev.id, exercise_id: 'hotel', question_id: q.id, field: 'selezionata', value: 'si', updated_at: minutes(t) }));
        insert('submissions', { id: uid('R-'), participant_id: p.id, event_id: ev.id, exercise_id: 'hotel', question_id: null, field: 'inviata', value: minutes(t), updated_at: minutes(t) });
        const hq = setHotelQuestion(ev, p, hotelPrompt(prop, sel), minutes(t));
        ev.models.forEach((m, mi) => {
          // Ogni motore dà una variante diversa per ogni domanda.
          const variants = sel.map(q => (hash(p.id + q.key) + mi) % 3);
          const text = sel.map((q, k) => (k + 1) + '. ' + fill(D.HOTEL_ANSWERS[q.key][variants[k]], vars)).join('\n');
          const run = visit({ ev, pid: p.id, ex: 'hotel', qid: hq.id, engine: m, prompt: hq.text }, text, t);
          if (!run) return;
          sel.forEach((q, k) => {
            const x = r();
            const v = variants[k];
            const rating = v === 2 ? (x < 0.55 ? 'corretta' : 'errata') : v === 1 ? (x < 0.6 ? 'incompleta' : x < 0.85 ? 'errata' : 'corretta') : (x < 0.85 ? 'incompleta' : 'errata');
            insert('evaluations', { id: uid('V-'), participant_id: p.id, event_id: ev.id, exercise_id: 'hotel', run_id: run.id, question_id: q.id, rating, note: '', updated_at: minutes(t + 5) });
          });
        });
      }

      if (reached >= 4) {
        t += 15;
        const q = positioningQuestion(ev, p, prop, minutes(t));
        const set = D.POSITIONING[type] || D.POSITIONING._generic;
        ev.models.forEach(m => {
          const run = visit({ ev, pid: p.id, ex: 'posizionamento', qid: q.id, engine: m, prompt: q.text }, fill(set[m], vars), t);
          if (!run) return;
          const x = r();
          insert('evaluations', { id: uid('V-'), participant_id: p.id, event_id: ev.id, exercise_id: 'posizionamento', run_id: run.id, question_id: null, rating: x < 0.35 ? 'si' : x < 0.8 ? 'in_parte' : 'no', note: '', updated_at: minutes(t + 4) });
        });
      }
      p.current_step = stage;
      p.last_seen_at = minutes(Math.min(t + 5, 110));
      computeProgress(p);
    });
    return db;
  }

  // ---------- sessioni ----------
  const session = {
    get() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch (e) { /* solo in memoria */ } },
    clear() { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* niente */ } }
  };
  const admin = {
    get() { try { return sessionStorage.getItem(ADMIN_KEY); } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem(ADMIN_KEY, v); } catch (e) { /* niente */ } },
    clear() { try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) { /* niente */ } }
  };

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* niente */ }
    session.clear();
    db = seed();
    persist();
  }

  load();
  syncConfigEvent();
  persist();

  window.Store = {
    TABLES, all, find, filter, byId, insert, update, save, reset, hash, fill, uid,
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    eventByCode, configEvent, territoryQuestion, createEvent, createParticipant,
    getSub, setSub, getEval, setEval, faqQuestions, runOf, openRun, pasteRun, setUnavailable, responseFor,
    aliases, mentions, nameWithPlace, hotelPrompt, hotelQuestion, setHotelQuestion, positioningQuestion, selectedHotelQs, ensureHotelSetup,
    computeProgress, allOff, toCSV, session, admin
  };
})();
