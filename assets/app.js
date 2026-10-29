// Portale del Lab: pagine del partecipante e pannello RankWit.
// Pagine: index.html?evento=codice (ingresso ed elenco degli esercizi),
//         esercizio-1.html … esercizio-4.html?evento=codice (un esercizio per pagina),
//         admin.html#/admin/eventi · #/admin/nuovo · #/admin/e/:id?tab=

(function () {
  const S = window.Store;
  const D = window.LAB_DATA;
  const app = document.getElementById('app');
  const STEPS = ['faq', 'territorio', 'hotel', 'posizionamento'];
  const STAGE_LABEL = { faq: 'FAQ', territorio: 'Territorio', hotel: 'Struttura', posizionamento: 'Posizionamento', fine: 'Ha finito' };
  const RATE_HOTEL = [['corretta', 'Corretta'], ['incompleta', 'Incompleta'], ['errata', 'Errata']];
  const RATE_POS = [['si', 'Sì'], ['in_parte', 'In parte'], ['no', 'No']];

  // ---------- utilità ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escText = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmtDate = iso => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = iso => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const mark = key => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (window.ENGINE_MARKS[key] || '') + '</svg>';
  const CHECK = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ARROW = '<span class="arrow" aria-hidden="true">→</span>';
  const BACK = '<span class="arrow" aria-hidden="true">←</span>';

  function ago(iso) {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'adesso';
    if (m < 60) return m + ' min fa';
    const sameDay = new Date(iso).toDateString() === new Date().toDateString();
    return sameDay ? 'alle ' + fmtTime(iso) : fmtDate(iso);
  }
  function debounce(fn, ms) {
    let t;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  }
  function toast(msg, ms) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms || 3800);
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }
  // ---------- salvataggio ----------
  // Si salva sul PC; sync.js lo manda a RankWit. Se il server non risponde, accanto
  // all'ora compare «in attesa di rete»: le risposte partono quando torna.
  const SY = window.Sync && window.Sync.enabled ? window.Sync : null;
  let lastSave = null;
  function setSave(state, at) {
    lastSave = { state, at: at || new Date() };
    const el = $('#save');
    if (!el) return;
    el.classList.toggle('is-saving', state === 'saving');
    el.classList.toggle('is-error', state === 'error');
    const t = $('.save-text', el);
    const net = SY && SY.state().failing ? ', in attesa di rete' : '';
    t.textContent = state === 'saving' ? 'Salvo…' : state === 'error' ? 'Questo browser non salva: alla fine scarica il documento' : 'Salvato alle ' + fmtTime(at || new Date()) + net;
  }
  S.onChange(e => { if (e.type === 'saved') setSave(e.ok ? 'saved' : 'error', e.at); });
  // Si salva subito a ogni modifica: con due schede aperte nello stesso browser
  // un salvataggio rimandato si perderebbe quando l'altra scheda ricarica i dati.
  // L'avanzamento si ricalcola prima, così arriva aggiornato anche al pannello.
  function queueSave() {
    const sess = S.session.get();
    const p = sess && S.byId('participants', sess.participant_id);
    if (p) S.computeProgress(p);
    S.save();
  }

  // ---------- pagine ----------
  // Ogni file HTML dichiara cosa mostra: index.html (ingresso ed elenco degli
  // esercizi), esercizio-1.html … esercizio-4.html, admin.html (pannello).
  const PAGE = document.body.dataset.page || 'home';
  const EX_N = Number(document.body.dataset.ex || 0);
  // Con evento.js c'è un solo Lab: gli indirizzi non portano il codice.
  const codeParam = ev => (!ev || (S.configEvent() && S.configEvent().id === ev.id) ? '' : '?evento=' + encodeURIComponent(ev.code));
  const exLink = (ev, n) => 'esercizio-' + n + '.html' + codeParam(ev);
  const homeLink = ev => 'index.html' + codeParam(ev);

  // ---------- router ----------
  let cleanups = [];
  function onCleanup(fn) { cleanups.push(fn); }
  function parse() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = h.split('?');
    return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function render() {
    cleanups.forEach(fn => fn());
    cleanups = [];
    if (PAGE === 'admin') {
      const { parts, query } = parse();
      adminRoute(parts[0] === 'admin' ? parts.slice(1) : parts, query);
    } else {
      participantPage();
    }
    window.scrollTo(0, 0);
  }
  // Solo il pannello usa le rotte con #/. Gli altri # (per esempio #main) non ridisegnano.
  window.addEventListener('hashchange', () => { if (PAGE === 'admin' && /^#\/|^$/.test(location.hash)) render(); });
  document.addEventListener('click', e => {
    const a = e.target.closest('a.skip');
    if (!a) return;
    e.preventDefault();
    const m = document.getElementById('main');
    if (m) m.focus();
  });

  // =====================================================================
  // PARTECIPANTE
  // =====================================================================
  const brand = href => '<a class="brand" href="' + href + '"><img src="assets/brand/rankwit-ai-black.svg" alt="RankWit AI"></a>';

  function currentEvent() {
    const code = (new URLSearchParams(location.search).get('evento') || '').trim().toLowerCase();
    const sess = S.session.get();
    const sev = sess ? S.byId('events', sess.event_id) : null;
    // Chi ha iniziato oggi resta nel suo evento anche se nel frattempo l'evento in
    // corso è cambiato (per esempio: alla prima pagina il server non rispondeva e
    // valeva evento.js). Così non riscrive il nome e non perde le risposte.
    const sp = sev && sev.status === 'aperto' ? S.byId('participants', sess.participant_id) : null;
    if (!code && sp && sp.created_at && new Date(sp.created_at).toDateString() === new Date().toDateString()) return { code, ev: sev };
    return { code, ev: code ? S.eventByCode(code) : (S.configEvent() || sev) };
  }
  // Se chi conduce cambia lo stato dell'evento, la pagina si aggiorna da sola.
  const openSig = ev => (ev ? ev.status : '');
  let shownSig = '';
  S.onChange(e => {
    if (e.type !== 'external' || PAGE === 'admin') return;
    if (openSig(currentEvent().ev) !== shownSig) render();
  });

  function participantPage() {
    const { code, ev } = currentEvent();
    shownSig = openSig(ev);
    if (!ev) return viewHome(code);
    document.title = (EX_N ? 'Esercizio ' + EX_N + ' · ' : '') + ev.name + ' · RankWit AI';
    if (ev.status === 'bozza') return viewMessage(ev, 'Il Lab non è ancora aperto', 'Il portale si apre il giorno dell’evento.');
    const sess = S.session.get();
    const p = sess && sess.event_id === ev.id ? S.byId('participants', sess.participant_id) : null;
    if (!p) {
      if (ev.status === 'chiuso') return viewMessage(ev, 'Il Lab è chiuso', 'Le iscrizioni a questo evento sono chiuse.');
      return viewName(ev);
    }
    const prop = S.byId('properties', p.property_id);
    p.last_seen_at = new Date().toISOString();
    if (!EX_N) { S.save(); return viewLobby(ev, p, prop); }
    const ex = D.EXERCISES[EX_N - 1];
    p.current_step = ex.id;
    S.save();
    ({ faq: viewFaq, territorio: viewTerritorio, hotel: viewHotel, posizionamento: viewPos })[ex.id](ev, p, prop);
  }

  function viewHome(code) {
    document.title = 'Portale del Lab · RankWit AI';
    const sess = S.session.get();
    const sp = sess && S.byId('participants', sess.participant_id);
    const sev = sp && S.byId('events', sp.event_id);
    app.innerHTML = `
      <header class="bar"><div class="bar-in">${brand('index.html')}
        </div></header>
      <main class="home"><div class="card">
        <span class="label">AI Visibility Lab</span>
        <h1>Entra nel Lab</h1>
        <p class="muted">Scrivi il codice dell’evento. Lo trovi sulla slide e sul quaderno.</p>
        <form id="go" novalidate>
          <label class="sr" for="code">Codice dell’evento</label>
          <input id="code" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="codice" value="${esc(code || '')}" aria-describedby="go-err">
          <button class="btn primary" type="submit">Entra</button>
        </form>
        <p id="go-err" class="err" ${code ? '' : 'hidden'}>${code ? 'Non troviamo un evento con il codice «' + esc(code) + '». Controlla la slide o chiedi in sala.' : ''}</p>
        ${sev ? `<p class="note info" style="margin-top:20px">Hai già iniziato <strong>${esc(sev.name)}</strong>. <a href="${homeLink(sev)}">Torna agli esercizi</a></p>` : ''}
      </div></main>`;
    $('#go').addEventListener('submit', e => {
      e.preventDefault();
      const c = $('#code').value.trim().toLowerCase().replace(/^.*lab\.rankwit\.ai\//, '').split('/')[0];
      if (!c) {
        $('#go-err').hidden = false;
        $('#go-err').textContent = 'Scrivi il codice dell’evento.';
        $('#code').focus();
        return;
      }
      location.search = '?evento=' + encodeURIComponent(c);
    });
  }

  function shellP(ev, p, inner) {
    app.innerHTML = `
      <header class="bar">
        <div class="bar-in">${brand(homeLink(ev))}
          <div class="bar-event"><span class="mono">AI Visibility Lab${EX_N ? ' · Esercizio ' + EX_N + ' di 4' : ''}</span><strong>${esc(ev.name)}</strong></div>
          <div class="bar-right">${p ? `
            <span class="who-chip" title="Chi rappresenti">${esc((S.byId('properties', p.property_id) || {}).name || '')}</span>
            <span class="muted small who-town">${esc((S.byId('properties', p.property_id) || {}).comune || '')}</span>
            <span class="save" id="save" role="status" aria-live="polite"><span class="save-text">Salvato</span></span>` : ''}
          </div>
        </div>
      </header>
      <main id="main" class="wrap" tabindex="-1">${inner}</main>`;
  }
  function viewMessage(ev, title, text) {
    shellP(ev, null, `<div class="card narrow" style="margin:40px auto"><h1>${esc(title)}</h1><p class="muted" style="margin-top:10px">${text}</p></div>`);
  }
  const exHead = (ex, text) => `<div class="head"><span class="label">Esercizio ${ex.n} di 4</span><h1>${esc(ex.long)}</h1>${text ? `<p>${text}</p>` : ''}</div>`;

  // «Invia» vale quando il server ha confermato: fino ad allora si dice che si sta
  // inviando o che la rete non risponde (e sync.js riprova da solo).
  let waiting = null;
  function sendWait(p, exId) {
    const row = S.find('submissions', r => r.participant_id === p.id && r.exercise_id === exId && r.question_id === null && r.field === 'inviato');
    const st = SY && row && row.value ? SY.rowState('submissions', row) : 'ok';
    waiting = st === 'ok' ? null : { pid: p.id, exId };
    if (st === 'failing') return '<p class="alert"><strong>Non riesco a inviare: la rete non risponde.</strong> Riprovo da solo, lascia aperta la pagina.</p>';
    if (st === 'sending') return '<p class="note">Invio in corso…</p>';
    return '';
  }
  if (SY) {
    let wasFailing = false;
    SY.onChange(st => {
      // L'indicatore cambia solo quando la rete cade o torna.
      if (st.failing !== wasFailing && lastSave && lastSave.state === 'saved') setSave('saved', lastSave.at);
      wasFailing = st.failing;
      if (!waiting) return;
      const w = waiting;
      refreshStatus(w.pid, w.exId);
      if (!waiting) toast('Inviato.');
    });
  }

  // Fine esercizio: niente link al successivo, si aspetta la sala.
  function statusHtml(p, exId) {
    S.computeProgress(p);
    waiting = null;
    if (S.allOff(p, exId)) return '<p class="alert"><strong>Nessun motore ha risposto.</strong> Chiedi aiuto in sala, poi premi «Riprova» su una delle schede.</p>';
    if (exId === 'faq' && !p.progress.faq) return '<p class="note">Per chiudere l’esercizio incolla qui sopra il testo che ha scritto ChatGPT (passo 3).</p>';
    const wait = exId !== 'faq' ? sendWait(p, exId) : '';
    if (wait) return wait;
    if (STEPS.every(s => p.progress[s])) return `<p class="note info"><strong>Hai finito tutti gli esercizi.</strong> Il riepilogo è nella <a href="${homeLink(currentEvent().ev)}">pagina iniziale</a>.</p>`;
    // Esercizi con i motori: si chiudono con «Invia».
    if (exId !== 'faq') {
      return S.getSub(p.id, exId, null, 'inviato')
        ? '<p class="note info"><strong>Inviato.</strong> Aspetta le indicazioni in sala per il prossimo esercizio.</p>'
        : '<p class="muted small">Quando hai incollato le risposte dei tre motori e risposto alle domande, premi «Invia».</p>';
    }
    return p.progress[exId]
      ? '<p class="note info"><strong>Fatto.</strong> Aspetta le indicazioni in sala per il prossimo esercizio.</p>'
      : '<p class="muted small">Le risposte si salvano da sole. Quando hai finito, aspetta le indicazioni in sala.</p>';
  }
  const statusBox = (p, exId) => `<div class="ex-status section" id="ex-status" aria-live="polite">${statusHtml(p, exId)}</div>`;
  // «Invia» per gli esercizi 2, 3 e 4: chiude l'esercizio e manda tutto a RankWit.
  const sendBox = (p, exId) => `<div class="send-box section"><button class="btn primary" type="button" id="send">Invia</button><div class="ex-status" id="ex-status" aria-live="polite">${statusHtml(p, exId)}</div></div>`;
  function exQuestion(ev, p, exId) {
    if (exId === 'territorio') return S.territoryQuestion(ev);
    if (exId === 'hotel') return S.hotelQuestion(ev, p);
    return S.find('questions', x => x.participant_id === p.id && x.exercise_id === 'posizionamento');
  }
  // Per ogni motore che si è aperto servono la risposta incollata e la valutazione.
  function missingFor(ev, p, exId) {
    const q = exQuestion(ev, p, exId);
    if (!q) return ['la domanda dell’esercizio'];
    const sel = S.selectedHotelQs(p.id);
    const out = [];
    if (exId === 'hotel') sel.forEach((x, i) => { if (!x.text.trim()) out.push('scrivi la domanda ' + (i + 1) + ' in cima'); });
    ev.models.forEach(m => {
      const name = D.MODELS[m].short;
      const r = S.runOf({ pid: p.id, ex: exId, qid: q.id, engine: m }, false);
      if (r && r.status === 'non_disponibile') return;
      const resp = r ? S.responseFor(r.id) : null;
      if (!resp || !resp.text.trim()) out.push(name + ': incolla la risposta');
      let rated;
      if (exId === 'territorio') rated = S.getSub(p.id, 'territorio', q.id, 'citato_' + m) !== '';
      else if (exId === 'hotel') rated = !!r && sel.every(x => { const e = S.getEval(p.id, r.id, x.id); return e && e.rating; });
      else rated = !!r && !!(S.getEval(p.id, r.id, null) || {}).rating;
      if (!rated) out.push(name + ': rispondi alla domanda sotto la risposta');
    });
    return out;
  }
  function bindSend(ev, pid, exId) {
    $('#send').addEventListener('click', () => {
      const p = S.byId('participants', pid);
      if (S.allOff(p, exId)) { refreshStatus(pid, exId); return; }
      const miss = missingFor(ev, p, exId);
      if (miss.length) {
        waiting = null;
        $('#ex-status').innerHTML = `<div class="alert"><strong>Manca ancora:</strong><ul>${miss.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
        return;
      }
      S.setSub(p, exId, null, 'inviato', new Date().toISOString());
      queueSave();
      refreshStatus(pid, exId);
      if (!SY) { toast('Inviato.'); return; }
      // «Inviato» solo quando il server conferma; se la rete non risponde lo dice
      // il riquadro qui sotto, e quando l'invio riesce arriva lo stesso avviso.
      SY.flushNow().then(() => {
        if (!waiting) return;
        refreshStatus(pid, exId);
        if (!waiting) toast('Inviato.');
      });
    });
  }
  function refreshStatus(pid, exId) {
    const el = $('#ex-status');
    const p = S.byId('participants', pid);
    if (el && p) el.innerHTML = statusHtml(p, exId);
  }

  // ---------- nome della struttura ----------
  // Si scrive una volta, sulla prima pagina che si apre; poi resta fisso su questo
  // computer per tutti gli esercizi. Nessun account, nessun codice.
  function viewName(ev) {
    shellP(ev, null, `
      <div class="card narrow name-card">
        <span class="label">Prima di iniziare</span>
        <h1>La tua struttura o destinazione</h1>
        <p class="muted" style="margin-top:8px">Lo scrivi una volta sola: resta su questo computer per tutti gli esercizi.</p>
        <form id="name-form" class="stack" novalidate style="margin-top:20px">
          <label class="field"><span>Nome della struttura o della destinazione</span><input type="text" id="f-name" autocomplete="organization" placeholder="Per esempio: Hotel Il Glicine, oppure Montagna Pistoiese"></label>
          <label class="field"><span>Comune</span><input type="text" id="f-comune" aria-describedby="f-comune-hint"><small id="f-comune-hint">Il tuo comune, non la zona. Per esempio: Abetone Cutigliano</small></label>
          <p class="err" id="name-err" role="alert" hidden></p>
          <div><button class="btn primary" type="submit">Inizia ${ARROW}</button></div>
        </form>
      </div>`);
    $('#f-name').focus();
    $('#name-form').addEventListener('submit', e => {
      e.preventDefault();
      const missing = [];
      [['#f-name', 'il nome della struttura o della destinazione'], ['#f-comune', 'il comune']].forEach(([sel, label]) => {
        const bad = !$(sel).value.trim();
        $(sel).setAttribute('aria-invalid', bad ? 'true' : 'false');
        if (bad) missing.push(label);
      });
      if (missing.length) {
        $('#name-err').hidden = false;
        $('#name-err').textContent = 'Scrivi ' + missing.join(' e ') + '.';
        $('[aria-invalid=true]').focus();
        return;
      }
      const p = S.createParticipant(ev, { name: $('#f-name').value, comune: $('#f-comune').value });
      S.session.set({ participant_id: p.id, event_id: ev.id });
      S.save();
      render();
    });
  }

  // ---------- elenco degli esercizi ----------
  function viewLobby(ev, p, prop) {
    S.computeProgress(p);
    const allDone = STEPS.every(s => p.progress[s]);
    if (allDone && p.current_step !== 'fine') { p.current_step = 'fine'; S.save(); }
    shellP(ev, p, `
      <div class="head"><span class="label">${esc(prop.name)} · ${esc(prop.comune)}</span><h1>Gli esercizi di oggi</h1>
        <p>Si fanno in ordine, uno alla volta. Chi conduce il Lab ti dice quando passare al prossimo.</p></div>
      <div class="ex-list">${D.EXERCISES.map(x => {
        const done = p.progress[x.id];
        return `<div class="ex-row is-open ${done ? 'is-done' : ''}">
          <span class="ex-n">${done ? CHECK : x.n}</span>
          <div><strong>${esc(x.long)}</strong><span class="small muted">${done ? 'Fatto' : 'Da fare'}</span></div>
          <a class="btn ghost small" href="${exLink(ev, x.n)}">${done ? 'Rivedi' : 'Apri'}</a>
        </div>`;
      }).join('')}</div>
      ${allDone ? summaryBlock(ev, p, prop) : ''}`);
    const dl = $('#dl');
    if (dl) dl.addEventListener('click', () => download(faqFile(prop), faqDoc(prop, S.getSub(p.id, 'faq', null, 'faq_chatgpt')), 'text/html;charset=utf-8'));
  }

  // Riepilogo, quando tutti e quattro gli esercizi sono fatti.
  function summaryBlock(ev, p, prop) {
    const pid = p.id;
    const qs = S.faqQuestions(pid);
    const nFaq = qs.filter(q => S.getSub(pid, 'faq', q.id, 'risposta').trim()).length;
    const tq = S.territoryQuestion(ev);
    const usable = tq ? ev.models.filter(m => { const r = S.runOf({ pid, ex: 'territorio', qid: tq.id, engine: m }, false); return !(r && r.status === 'non_disponibile'); }) : [];
    const cited = usable.filter(m => S.getSub(pid, 'territorio', tq.id, 'citato_' + m) === 'si').length;
    const evals = ex => S.filter('evaluations', e => e.participant_id === pid && e.exercise_id === ex && e.rating);
    const h = evals('hotel');
    const pos = evals('posizionamento');
    const posQ = S.find('questions', q => q.participant_id === pid && q.exercise_id === 'posizionamento');
    const frase = posQ ? S.getSub(pid, 'posizionamento', posQ.id, 'frase').trim() : '';
    return `
      <div class="section"><h2 style="margin-bottom:14px">Hai finito gli esercizi</h2>
      <div class="tiles">
        <div class="tile"><span class="label">FAQ</span><p class="big">${nFaq}</p><p>${nFaq === 1 ? 'domanda' : 'domande'} con una risposta</p></div>
        <div class="tile"><span class="label">Territorio</span><p class="big">${cited}/${usable.length}</p><p>motori citano ${esc(prop.comune)}</p></div>
        <div class="tile"><span class="label">Su di te</span><p class="big">${h.filter(e => e.rating === 'corretta').length}/${h.length}</p><p>risposte corrette su di te</p></div>
        <div class="tile"><span class="label">Posizionamento</span><p class="big">${pos.filter(e => e.rating === 'si').length}/${pos.length}</p><p>descrizioni in cui ti ritrovi</p></div>
      </div></div>
      ${frase ? `<div class="section"><p class="label" style="margin-bottom:10px">La tua frase</p><blockquote class="quote">${esc(frase)}</blockquote></div>` : ''}
      <p class="note info section">Le risposte dei motori cambiano da una richiesta all’altra. Quello che hai visto oggi è un esempio, non un giudizio definitivo.</p>
      ${S.getSub(pid, 'faq', null, 'faq_chatgpt').trim() ? '<div class="section"><button class="btn primary" type="button" id="dl">Scarica il documento FAQ</button></div>' : ''}`;
  }

  // ---------- 1. FAQ ----------
  const EXT = '<span class="arrow" aria-hidden="true">↗</span>';
  function copySync(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    return ok;
  }
  // Scrivono domande e risposte; le copiano in ChatGPT, che scrive le FAQ per il
  // sito; incollano qui il testo e lo scaricano come documento.
  function faqItems(pid) {
    return S.faqQuestions(pid).map(q => ({ q: q.text.trim(), a: S.getSub(pid, 'faq', q.id, 'risposta').trim() })).filter(x => x.q && x.a);
  }
  function faqPrompt(prop, items) {
    return 'Mi occupo di ' + S.nameWithPlace(prop) + '. Qui sotto trovi le domande che ci fanno ospiti e visitatori, con le nostre risposte.\n' +
      'Riscrivile come una pagina «Domande frequenti» per il nostro sito, in italiano: domande chiare, risposte brevi e precise. Non aggiungere informazioni che non abbiamo scritto.\n' +
      'In fondo, a parte, aggiungi il codice JSON-LD di tipo FAQPage da dare a chi gestisce il sito.\n\n' +
      items.map((x, i) => (i + 1) + '. Domanda: ' + x.q + '\n   Risposta: ' + x.a).join('\n');
  }
  const faqFile = prop => 'faq-' + (prop.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'struttura') + '.html';
  // Il testo di ChatGPT arriva con un po' di markdown: titoli, elenchi, grassetti, codice.
  function mdToHtml(md) {
    const out = [];
    let list = null;
    let code = null;
    let para = [];
    const inline = t => escText(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
    String(md || '').replace(/\r\n?/g, '\n').split('\n').forEach(line => {
      if (code !== null) {
        if (/^\s*```/.test(line)) { out.push('<pre><code>' + escText(code.join('\n')) + '</code></pre>'); code = null; }
        else code.push(line);
        return;
      }
      if (/^\s*```/.test(line)) { flushPara(); closeList(); code = []; return; }
      const h = line.match(/^\s*(#{1,4})\s+(.*)$/);
      if (h) { flushPara(); closeList(); const n = Math.max(2, Math.min(h[1].length, 4)); out.push('<h' + n + '>' + inline(h[2]) + '</h' + n + '>'); return; }
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        const kind = ul ? 'ul' : 'ol';
        if (list !== kind) { closeList(); out.push('<' + kind + '>'); list = kind; }
        out.push('<li>' + inline((ul || ol)[1]) + '</li>');
        return;
      }
      if (!line.trim()) { flushPara(); closeList(); return; }
      closeList();
      para.push(line.trim());
    });
    if (code !== null) out.push('<pre><code>' + escText(code.join('\n')) + '</code></pre>');
    flushPara();
    closeList();
    return out.join('\n');
  }
  function faqDoc(prop, text) {
    return '<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Domande frequenti · ' + escText(prop.name) + '</title>\n' +
      '<style>body{font:17px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#111}h2,h3,h4{line-height:1.25}pre{background:#f4f4f6;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:14px}</style>\n</head>\n<body>\n' +
      mdToHtml(text) + '\n</body>\n</html>\n';
  }

  function viewFaq(ev, p, prop) {
    const pid = p.id;
    const qs = S.faqQuestions(pid);
    shellP(ev, p, `
      ${exHead(D.EXERCISES[0], 'Scrivi le domande che ti fanno ospiti e visitatori e, sotto, le tue risposte, come le daresti al telefono o allo sportello. Non serve riempirle tutte: anche due vanno benissimo. Non scrivere nomi o dati di persone. Poi, in fondo alla pagina, ti fai scrivere le FAQ da ChatGPT.')}
      <p class="counter" id="faq-count" aria-live="polite"></p>
      <div class="faq-list" style="margin-top:12px">
        ${qs.map((q, i) => `
          <div class="faq-item">
            <span class="num" id="n-${q.id}">${String(i + 1).padStart(2, '0')}</span>
            <label class="sr" for="q-${q.id}">Domanda ${i + 1}</label>
            <input type="text" id="q-${q.id}" data-q="${q.id}" value="${esc(q.text)}" placeholder="Scrivi una domanda che ti fanno ospiti o visitatori">
            <label class="sr" for="a-${q.id}">Risposta alla domanda ${i + 1}</label>
            <textarea id="a-${q.id}" data-a="${q.id}" rows="2" placeholder="La tua risposta">${esc(S.getSub(pid, 'faq', q.id, 'risposta'))}</textarea>
          </div>`).join('')}
      </div>
      <section class="section faq-gpt">
        <h2>Fatti scrivere le FAQ da ChatGPT</h2>
        <div class="step"><span class="sn">1</span><div>
          <p><strong>Copia questo testo.</strong> Contiene le tue domande e risposte e la richiesta per ChatGPT.</p>
          <pre class="prompt" id="faq-prompt" tabindex="0"></pre>
          <div class="row"><button class="btn primary" type="button" id="faq-copy">Copia il testo</button><span class="muted small" id="faq-hint"></span></div>
        </div></div>
        <div class="step"><span class="sn">2</span><div>
          <p><strong>Incollalo in ChatGPT e premi Invio.</strong></p>
          <p style="margin-top:10px"><a class="btn ghost" href="https://chatgpt.com/" target="rw-chatgpt">Apri ChatGPT ${EXT}</a></p>
        </div></div>
        <div class="step"><span class="sn">3</span><div>
          <label class="paste" for="faq-gpt"><span>Copia la risposta di ChatGPT e incollala qui</span></label>
          <textarea id="faq-gpt" rows="8" placeholder="Sotto la risposta c’è il pulsante Copia">${esc(S.getSub(pid, 'faq', null, 'faq_chatgpt'))}</textarea>
        </div></div>
        <div class="step"><span class="sn">4</span><div>
          <p><strong>Scarica il documento</strong> e mettilo sul sito, o mandalo a chi lo gestisce.</p>
          <p style="margin-top:10px"><button class="btn primary" type="button" id="faq-dl">Scarica il documento</button></p>
        </div></div>
      </section>
      ${statusBox(p, 'faq')}`);

    const main = $('#main');
    const full = q => !!(q.text.trim() && S.getSub(pid, 'faq', q.id, 'risposta').trim());
    function refresh() {
      const n = qs.filter(full).length;
      // Nessun minimo: anche una o due domande vanno bene.
      $('#faq-count').textContent = n === 1 ? '1 domanda con risposta' : n + ' domande con risposta';
      qs.forEach(q => $('#n-' + q.id).classList.toggle('is-done', full(q)));
      $('#faq-prompt').textContent = n ? faqPrompt(prop, faqItems(pid)) : 'Il testo compare qui quando scrivi la prima risposta.';
      $('#faq-copy').disabled = n === 0;
      $('#faq-hint').textContent = n === 0 ? '' : n === 1 ? 'Nel testo entra la domanda con la risposta.' : 'Nel testo entrano le ' + n + ' domande con una risposta.';
      $('#faq-dl').disabled = !S.getSub(pid, 'faq', null, 'faq_chatgpt').trim();
    }
    main.addEventListener('input', e => {
      const t = e.target;
      const cur = S.byId('participants', pid);
      if (t.dataset.a) S.setSub(cur, 'faq', t.dataset.a, 'risposta', t.value);
      else if (t.dataset.q) S.update('questions', t.dataset.q, { text: t.value });
      else if (t.id === 'faq-gpt') { S.setSub(cur, 'faq', null, 'faq_chatgpt', t.value); refreshStatus(pid, 'faq'); }
      else return;
      queueSave();
      refresh();
    });
    $('#faq-copy').addEventListener('click', () => toast(copySync(faqPrompt(prop, faqItems(pid))) ? 'Testo copiato. Ora incollalo in ChatGPT.' : 'Seleziona il testo e copialo a mano.'));
    $('#faq-dl').addEventListener('click', () => {
      const text = S.getSub(pid, 'faq', null, 'faq_chatgpt');
      if (!text.trim()) return;
      download(faqFile(prop), faqDoc(prop, text), 'text/html;charset=utf-8');
      S.setSub(S.byId('participants', pid), 'faq', null, 'faq_scaricata', new Date().toISOString());
      S.save();
    });
    refresh();
  }

  // ---------- schede dei motori (esercizi 2, 3 e 4) ----------
  // Il motore si apre vuoto in un'altra scheda, senza account: niente parte da
  // solo. Il partecipante scrive o incolla la domanda, copia la risposta e la
  // incolla qui. Il portale non può leggere l'altra scheda.
  let cards = new Map();

  function citeHint(o, resp) {
    if (!resp || !resp.text.trim()) return '';
    return S.mentions(resp.text, o.comune) ? 'Nel testo incollato c’è «' + esc(o.comune) + '».' : 'Nel testo incollato non trovo «' + esc(o.comune) + '».';
  }
  function seg(name, options, checked, data) {
    return `<div class="seg" role="radiogroup" aria-labelledby="${name}-l">${options.map(([val, lab]) => `<label><input type="radio" name="${name}" value="${val}" ${data} ${checked === val ? 'checked' : ''}><span>${lab}</span></label>`).join('')}</div>`;
  }

  function tabCard(o) {
    cards.set(o.key, o);
    const m = D.MODELS[o.engine];
    const run = S.runOf(o, false);
    const resp = run ? S.responseFor(run.id) : null;
    const k = esc(o.key);
    const head = `<div class="engine-head">${mark(o.engine)}<strong>${esc(m.name)}</strong><span class="tag">senza account</span></div>`;
    if (run && run.status === 'non_disponibile') {
      return `<article class="engine is-off" data-card="${k}">${head}
        <div class="engine-body"><p><strong>Segnato come non disponibile.</strong></p><p class="small muted" style="margin-top:6px">Vai avanti con gli altri motori: le loro risposte restano valide.</p></div>
        <div class="engine-foot"><button class="btn ghost small" type="button" data-unavail="${k}" data-on="0">Riprova con ${esc(m.short)}</button></div></article>`;
    }
    const opened = run && run.opened_at;
    const id = 'c' + S.hash(o.key);
    let rates = '';
    if (o.cite) {
      rates = `<div class="rate-row"><span class="ask" id="${id}-cit-l">Compare ${esc(o.comune)}?</span>${seg(id + '-cit', [['si', 'Sì'], ['no', 'No']], S.getSub(o.pid, 'territorio', o.qid, 'citato_' + o.engine), `data-cite-key="${k}"`)}</div>`;
    } else {
      rates = o.rows.map((row, i) => {
        const e = run ? S.getEval(o.pid, run.id, row.qid) : null;
        return `<div class="rate-row"><span class="ask" id="${id}-${i}-l">${esc(row.label)}</span>${seg(id + '-' + i, o.options, e ? e.rating : '', `data-rate-key="${k}" data-qid="${row.qid || ''}"`)}</div>`;
      }).join('');
      if (o.note) {
        const e = run ? S.getEval(o.pid, run.id, null) : null;
        rates += `<label class="sr" for="${id}-note">${esc(o.note)}</label><textarea id="${id}-note" rows="2" data-note-key="${k}" placeholder="${esc(o.note)}">${esc(e ? e.note : '')}</textarea>`;
      }
    }
    return `<article class="engine" data-card="${k}" aria-label="${esc(m.name)}">${head}
      <div class="engine-body steps-in">
        <div class="step"><span class="sn">1</span><div>
          <a class="btn ${opened ? 'ghost' : 'primary'} small" href="${esc(m.home)}" target="rw-${o.engine}" data-open="${k}">${opened ? 'Riapri' : 'Apri'} ${esc(m.short)} ${EXT}</a>
          <p class="small muted" style="margin-top:8px">${esc(o.step1)}</p>
        </div></div>
        <div class="step"><span class="sn">2</span><label class="paste"><span>Copia la risposta e incollala qui</span>
          <textarea rows="4" data-paste="${k}" placeholder="Sotto la risposta c’è il pulsante Copia">${esc(resp ? resp.text : '')}</textarea></label></div>
        ${o.cite ? `<p class="hint small" data-hint="${k}">${citeHint(o, resp)}</p>` : ''}
      </div>
      <div class="engine-foot"><div class="step"><span class="sn">3</span><div class="rates">${rates}${o.hint ? `<p class="small muted">${esc(o.hint)}</p>` : ''}</div></div>
        <button class="linkbtn" type="button" data-unavail="${k}" data-on="1">Non si apre o non risponde</button></div>
    </article>`;
  }

  function bindTabCards(ev, pid, exId) {
    const main = $('#main');
    const cur = () => S.byId('participants', pid);
    const after = () => { queueSave(); refreshStatus(pid, exId); };
    // Ridisegna la scheda e rimette il fuoco su un pulsante equivalente.
    const redraw = (key, focusSel) => {
      const o = cards.get(key);
      const el = document.querySelector('[data-card="' + key + '"]');
      if (!o || !el) return;
      const hadFocus = el.contains(document.activeElement);
      el.outerHTML = tabCard(o);
      const fresh = document.querySelector('[data-card="' + key + '"]');
      const target = fresh && (fresh.querySelector(focusSel) || fresh.querySelector('a, button'));
      if (hadFocus && target) target.focus({ preventScroll: true });
    };
    main.addEventListener('click', e => {
      const a = e.target.closest('[data-open]');
      if (a) {
        S.openRun(cards.get(a.dataset.open), cur());
        S.save();
        setTimeout(() => redraw(a.dataset.open, '[data-open]'), 400);
        return;
      }
      const u = e.target.closest('[data-unavail]');
      if (u) {
        S.setUnavailable(cards.get(u.dataset.unavail), cur(), u.dataset.on === '1');
        after();
        redraw(u.dataset.unavail, '[data-unavail]');
      }
    });
    main.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.paste) {
        const o = cards.get(t.dataset.paste);
        const run = S.pasteRun(o, cur(), t.value);
        const h = document.querySelector('[data-hint="' + t.dataset.paste + '"]');
        if (h) h.innerHTML = citeHint(o, S.responseFor(run.id));
        queueSave();
      } else if (t.dataset.noteKey) {
        const o = cards.get(t.dataset.noteKey);
        S.setEval(cur(), o.ex, S.runOf(o, true).id, null, { note: t.value });
        queueSave();
      }
    });
    main.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.rateKey) {
        const o = cards.get(t.dataset.rateKey);
        S.setEval(cur(), o.ex, S.runOf(o, true).id, t.dataset.qid || null, { rating: t.value });
        after();
      } else if (t.dataset.citeKey) {
        const o = cards.get(t.dataset.citeKey);
        S.runOf(o, true);
        S.setSub(cur(), 'territorio', o.qid, 'citato_' + o.engine, t.value);
        after();
      }
    });
  }

  // La domanda definita sta in cima: si copia e si incolla nei tre motori.
  function copyBox(text) {
    return `<div class="copybox">
      <p class="copy-title">Copia questa domanda e incollala nei tre motori. Poi guarda cosa rispondono.</p>
      <p class="q">${esc(text)}</p>
      <button class="btn primary" type="button" data-copy-q>Copia la domanda</button>
    </div>`;
  }
  function bindCopyQ(text) {
    $$('[data-copy-q]').forEach(b => b.addEventListener('click', () => toast(copySync(text) ? 'Domanda copiata. Ora incollala nei tre motori.' : 'Seleziona la domanda e copiala a mano.')));
  }
  const tabsNote = n => `<p class="note info small tabs-note"><strong>Non serve accedere né registrarti:</strong> se un motore te lo chiede, chiudi quella finestra. I motori si aprono in un’altra scheda: per tornare qui clicca la scheda «Esercizio ${n}» in alto nel browser.</p>`;
  const fillQ = (text, prop) => text.replace(/\{comune\}/g, () => prop.comune);
  const STEP1_PASTE = 'Si apre vuoto in un’altra scheda. Incolla la domanda e premi Invio.';

  // ---------- 2. territorio ----------
  function viewTerritorio(ev, p, prop) {
    const pid = p.id;
    const ex = D.EXERCISES[1];
    const tq = S.territoryQuestion(ev);
    cards = new Map();
    if (!tq) {
      shellP(ev, p, exHead(ex) + '<p class="note">Chi conduce il Lab non ha ancora scritto la domanda per il territorio.</p>');
      return;
    }
    const text = fillQ(tq.text, prop);
    const opts = ev.models.map(m => ({ key: 'territorio|' + m, ev, pid, ex: 'territorio', qid: tq.id, engine: m, prompt: text, step1: STEP1_PASTE, cite: true, comune: prop.comune }));
    shellP(ev, p, `
      ${exHead(ex)}
      ${copyBox(text)}
      ${tabsNote(2)}
      <p class="muted small" style="margin-top:12px">${/\{comune\}/.test(tq.text) ? `Per ogni motore incolla qui la risposta e segna se compare ${esc(prop.comune)}.` : `La domanda parla di tutta la zona: conta se l’AI nomina proprio il tuo comune, <strong>${esc(prop.comune)}</strong>. Per ogni motore incolla qui la risposta e segna se compare.`} Ognuno riceve risposte un po’ diverse: è normale.</p>
      <div class="grid-3" style="margin-top:16px">${opts.map(tabCard).join('')}</div>
      <label class="field section"><span>Cosa manca, secondo te?</span>
        <textarea id="t-note" rows="3" placeholder="Un luogo, una festa, un’esperienza o una fonte che l’AI non usa">${esc(S.getSub(pid, 'territorio', tq.id, 'cosa_manca'))}</textarea></label>
      ${sendBox(p, 'territorio')}`);
    bindTabCards(ev, pid, 'territorio');
    bindSend(ev, pid, 'territorio');
    bindCopyQ(text);
    $('#t-note').addEventListener('input', e => { S.setSub(S.byId('participants', pid), 'territorio', tq.id, 'cosa_manca', e.target.value); queueSave(); });
  }

  // ---------- 3. struttura ----------
  // Sempre aperto: tre domande del partecipante, modificabili in ogni momento, che
  // scrive lui nei motori. Non serve aver fatto l'esercizio 1.
  function viewHotel(ev, p, prop) {
    const pid = p.id;
    const ex = D.EXERCISES[2];
    cards = new Map();
    const hq = S.ensureHotelSetup(ev, p, prop);
    S.save();
    const qs3 = S.selectedHotelQs(pid);
    const label = (q, i) => (q.text.trim() ? (i + 1) + '. ' + q.text.trim() : 'Domanda ' + (i + 1));
    const rows = qs3.map((q, i) => ({ qid: q.id, label: label(q, i) }));
    const opts = ev.models.map(m => ({ key: 'hotel|' + m, ev, pid, ex: 'hotel', qid: hq.id, engine: m, prompt: hq.text, hint: 'Se il motore non lo sa, scegli «Incompleta».', step1: 'Si apre vuoto in un’altra scheda. Scrivi tu le domande.', rows, options: RATE_HOTEL }));
    shellP(ev, p, `
      ${exHead(ex, 'Scrivi tre domande che un viaggiatore potrebbe fare su di te e, sotto ognuna, la tua risposta: ti serve per capire se l’AI risponde giusto.')}
      <div class="copybox is-write">
        <p class="copy-title">Scrivi tu queste tre domande nei tre motori, come le scriverebbe un viaggiatore. Ricordati di scrivere il nome della struttura o della destinazione.</p>
        <div class="q3-list">${qs3.map((q, i) => `
          <div class="q3">
            <label class="field"><span>Domanda ${i + 1}</span><input type="text" data-h3q="${q.id}" value="${esc(q.text)}" placeholder="Una domanda che un viaggiatore potrebbe fare"></label>
            <label class="field"><span>La tua risposta</span><textarea rows="2" data-h3a="${q.id}" placeholder="Come risponderesti tu">${esc(S.getSub(pid, 'hotel', q.id, 'risposta'))}</textarea></label>
          </div>`).join('')}</div>
      </div>
      ${tabsNote(3)}
      <p class="muted small" style="margin-top:12px">Puoi farle in un messaggio solo o una alla volta. Incolla qui tutto quello che rispondono e confronta con le tue risposte.</p>
      <div class="grid-3" style="margin-top:16px">${opts.map(tabCard).join('')}</div>
      <label class="field section"><span>Cosa dovrebbe sapere l’AI? <span class="muted">(facoltativo)</span></span>
        <textarea rows="2" id="h-note">${esc(S.getSub(pid, 'hotel', null, 'nota'))}</textarea></label>
      ${sendBox(p, 'hotel')}`);
    bindTabCards(ev, pid, 'hotel');
    bindSend(ev, pid, 'hotel');
    $('#h-note').addEventListener('input', e => { S.setSub(S.byId('participants', pid), 'hotel', null, 'nota', e.target.value); queueSave(); });
    $('.q3-list').addEventListener('input', e => {
      const t = e.target;
      const cur = S.byId('participants', pid);
      if (t.dataset.h3a) { S.setSub(cur, 'hotel', t.dataset.h3a, 'risposta', t.value); queueSave(); return; }
      if (!t.dataset.h3q) return;
      // Domanda cambiata: si aggiornano il testo per i motori e le etichette delle valutazioni.
      S.update('questions', t.dataset.h3q, { text: t.value });
      const now = S.selectedHotelQs(pid);
      const sys = S.setHotelQuestion(ev, cur, S.hotelPrompt(prop, now));
      ev.models.forEach(m => { const r = S.runOf({ pid, ex: 'hotel', qid: sys.id, engine: m }, false); if (r) r.prompt = sys.text; });
      const idx = now.findIndex(q => q.id === t.dataset.h3q);
      cards.forEach(o => { if (o.ex === 'hotel' && o.rows[idx]) { o.rows[idx].label = label(now[idx], idx); o.prompt = sys.text; } });
      $$('[data-card^="hotel|"]').forEach(card => { const ask = card.querySelectorAll('.rate-row .ask')[idx]; if (ask) ask.textContent = label(now[idx], idx); });
      queueSave();
    });
  }

  // ---------- 4. posizionamento ----------
  function viewPos(ev, p, prop) {
    const pid = p.id;
    const ex = D.EXERCISES[3];
    cards = new Map();
    const q = S.positioningQuestion(ev, p, prop);
    S.save();
    const opts = ev.models.map(m => ({ key: 'posizionamento|' + m, ev, pid, ex: 'posizionamento', qid: q.id, engine: m, prompt: q.text, step1: STEP1_PASTE, rows: [{ qid: null, label: 'Ti ci ritrovi?' }], options: RATE_POS, note: 'Chi manca o chi non c’entra?' }));
    shellP(ev, p, `
      ${exHead(ex)}
      ${copyBox(q.text)}
      ${tabsNote(4)}
      <div class="grid-3" style="margin-top:20px">${opts.map(tabCard).join('')}</div>
      <label class="field section"><span>In una frase: a chi vorresti che l’AI ti consigliasse?</span>
        <textarea id="pos-frase" rows="2" placeholder="Per esempio: coppie che camminano e cercano cucina di casa, da aprile a ottobre">${esc(S.getSub(pid, 'posizionamento', q.id, 'frase'))}</textarea>
        <small>Ti serve per scrivere la descrizione del sito e dei profili online.</small></label>
      ${sendBox(p, 'posizionamento')}`);
    bindTabCards(ev, pid, 'posizionamento');
    bindSend(ev, pid, 'posizionamento');
    bindCopyQ(q.text);
    $('#pos-frase').addEventListener('input', e => { S.setSub(S.byId('participants', pid), 'posizionamento', q.id, 'frase', e.target.value); queueSave(); });
  }

  // =====================================================================
  // PANNELLO RANKWIT
  // =====================================================================
  // I dati arrivano dal server (funzioni lab_admin_* in supabase/migrations) e
  // stanno in memoria nello Store: le viste di avanzamento, risultati ed export
  // sono quelle del prototipo. Accesso con Supabase Auth: solo chi è invitato e
  // scritto nella tabella lab.staff. Ruolo «team»: vede tutto e scarica i file
  // anonimi; ruolo «dati»: scarica anche i file con nomi e comuni e cancella.
  let ui = { names: false, filter: 'tutti', tables: {}, ident: false };
  const A = { client: null, ready: false, me: null, token: 0, meta: {}, loaded: {}, setPassword: false };
  const POLL = 10000;
  const isData = () => !!A.me && A.me.role === 'dati';
  const siteBase = () => location.href.replace(/admin\.html.*$/, '').replace(/[?#].*$/, '');
  const shortUrl = u => u.replace(/^https?:\/\//, '');
  const partLink = ev => siteBase() + homeLink(ev);
  const partExLink = (ev, n) => siteBase() + exLink(ev, n);

  async function call(name, args) {
    const { data, error } = await A.client.rpc(name, args || {});
    if (error) throw new Error(error.message || 'Il server non risponde.');
    return data;
  }
  const errText = e => (/fetch|network|Failed/i.test(String(e && e.message)) ? 'Il server non risponde. Controlla la connessione e riprova.' : String((e && e.message) || e));

  async function adminBoot() {
    const cfg = window.LAB_SERVER || {};
    if (!window.supabase || !cfg.url || !cfg.key) {
      app.innerHTML = '<main class="home"><div class="card"><h1>Pannello non configurato</h1><p class="muted" style="margin-top:8px">Manca l’indirizzo del server in server.js.</p></div></main>';
      return;
    }
    // Link dell'email di invito o di nuova password: si sceglie la password.
    A.setPassword = /type=(invite|recovery)/.test(location.hash);
    A.client = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'labportale.pannello' }
    });
    A.client.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') A.setPassword = true;
      if (event === 'SIGNED_OUT') A.me = null;
    });
    await A.client.auth.getSession();
    A.ready = true;
    if (A.setPassword) history.replaceState(null, '', location.pathname + '#/admin/password');
    render();
  }

  function adminRoute(parts, query) {
    document.title = 'Area RankWit · Portale del Lab';
    if (!A.ready) return;
    const token = ++A.token;
    if (parts[0] === 'esci') {
      A.client.auth.signOut().finally(() => { A.me = null; go('#/admin'); });
      return;
    }
    A.client.auth.getSession().then(async ({ data }) => {
      if (token !== A.token) return;
      const session = data && data.session;
      if (!session) return viewLogin();
      if (parts[0] === 'password' || A.setPassword) return viewSetPassword();
      if (!A.me) {
        try { A.me = await call('lab_admin_me'); } catch (e) {
          // Accesso scaduto o non più valido: si rientra.
          if (/jwt|token/i.test(e.message)) { await A.client.auth.signOut(); return viewLogin(); }
          return shellError(e);
        }
        if (token !== A.token) return;
      }
      if (!A.me) return viewNoAccess(session.user && session.user.email);
      if (!parts[0] || parts[0] === 'eventi') return viewEvents(token);
      if (parts[0] === 'nuovo') return viewNewEvent();
      if (parts[0] === 'e' && parts[1]) return openEvent(parts[1], query.get('tab') || 'avanzamento', token);
      go('#/admin/eventi');
    });
  }
  function shellA(inner) {
    app.innerHTML = `
      <header class="bar"><div class="bar-in">${brand('#/admin/eventi')}
        <div class="bar-event"><span class="mono">Area RankWit</span><strong>Portale del Lab</strong></div>
        <nav class="admin-nav" aria-label="Pannello"><a href="#/admin/eventi" class="is-current">Eventi</a></nav>
        <div class="bar-right"><span class="small">${esc(A.me ? A.me.email : '')}${isData() ? ' · dati' : ''}</span><a href="#/admin/esci">Esci</a></div>
      </div></header>
      <main id="main" class="wrap">${inner}</main>`;
  }
  function shellError(e) {
    shellA(`<div class="card narrow" style="margin:40px auto"><h1>Qualcosa non va</h1><p class="muted" style="margin-top:10px">${esc(errText(e))}</p><p style="margin-top:16px"><button class="btn ghost" type="button" id="retry">Riprova</button></p></div>`);
    $('#retry').addEventListener('click', render);
  }
  // Accesso, password e accesso negato: una scheda stretta come quella del nome
  // nelle pagine dei partecipanti (fuori da .home, che ha lo stile del vecchio codice).
  function authCard(inner) {
    app.innerHTML = `
      <header class="bar"><div class="bar-in">${brand('index.html')}</div></header>
      <main id="main" class="wrap"><div class="card" style="max-width:460px;margin:24px auto 0">${inner}</div></main>`;
  }
  function viewNoAccess(mail) {
    authCard(`
      <span class="label">Area RankWit</span><h1>Accesso non abilitato</h1>
      <p class="muted" style="margin-top:8px">L’indirizzo ${esc(mail || '')} non ha accesso al pannello. Chiedi a chi gestisce il Lab.</p>
      <p style="margin-top:20px"><a class="btn ghost" href="#/admin/esci">Esci</a></p>`);
  }

  function viewLogin() {
    authCard(`
      <span class="label">Area RankWit</span><h1>Accedi</h1>
      <p class="muted" style="margin-top:8px">Solo per il team RankWit. Per avere l’accesso chiedi a chi gestisce il Lab.</p>
      <form id="login" class="stack" novalidate style="margin-top:20px">
        <label class="field"><span>Email</span><input type="email" id="l-mail" autocomplete="username" placeholder="nome@rankwit.ai"></label>
        <label class="field"><span>Password</span><input type="password" id="l-pass" autocomplete="current-password"></label>
        <p class="err" id="l-err" role="alert" hidden></p>
        <div class="row"><button class="btn primary" type="submit">Entra</button><button class="linkbtn" type="button" id="l-forgot" style="margin-left:auto">Password dimenticata?</button></div>
      </form>`);
    const err = msg => { $('#l-err').hidden = !msg; $('#l-err').textContent = msg || ''; };
    $('#login').addEventListener('submit', async e => {
      e.preventDefault();
      const mail = $('#l-mail').value.trim().toLowerCase();
      if (!mail || !$('#l-pass').value) { err('Scrivi email e password.'); return; }
      $('#login button[type=submit]').disabled = true;
      const { error } = await A.client.auth.signInWithPassword({ email: mail, password: $('#l-pass').value });
      $('#login button[type=submit]').disabled = false;
      if (error) { err(/invalid/i.test(error.message) ? 'Email o password non corretti.' : errText(error)); return; }
      A.me = null;
      go('#/admin/eventi');
    });
    $('#l-forgot').addEventListener('click', async () => {
      const mail = $('#l-mail').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+$/.test(mail)) { err('Scrivi prima la tua email.'); $('#l-mail').focus(); return; }
      const { error } = await A.client.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
      err(error ? errText(error) : '');
      if (!error) toast('Se l’indirizzo ha accesso, ti arriva un’email per scegliere una nuova password.', 6000);
    });
  }

  function viewSetPassword() {
    authCard(`
      <span class="label">Area RankWit</span><h1>Scegli la password</h1>
      <p class="muted" style="margin-top:8px">La usi per entrare nel pannello con la tua email.</p>
      <form id="pw" class="stack" novalidate style="margin-top:20px">
        <label class="field"><span>Nuova password</span><input type="password" id="p-1" autocomplete="new-password"><small>Almeno 10 caratteri.</small></label>
        <label class="field"><span>Ripeti la password</span><input type="password" id="p-2" autocomplete="new-password"></label>
        <p class="err" id="p-err" role="alert" hidden></p>
        <div><button class="btn primary" type="submit">Salva la password</button></div>
      </form>`);
    $('#p-1').focus();
    $('#pw').addEventListener('submit', async e => {
      e.preventDefault();
      const a = $('#p-1').value;
      const b = $('#p-2').value;
      const err = msg => { $('#p-err').hidden = false; $('#p-err').textContent = msg; };
      if (a.length < 10) return err('Serve una password di almeno 10 caratteri.');
      if (a !== b) return err('Le due password non sono uguali.');
      const { error } = await A.client.auth.updateUser({ password: a });
      if (error) return err(errText(error));
      A.setPassword = false;
      toast('Password salvata.');
      go('#/admin/eventi');
    });
  }

  // ---------- dati dal server ----------
  function putEvent(row) {
    const ev = Object.assign({}, row);
    ['in_corso', 'n_participants', 'n_done'].forEach(k => delete ev[k]);
    S.adminMerge({ events: [ev] });
  }
  function setCurrent(id, on) {
    const cur = S.configEvent();
    if (on) S.setServerCurrent(id);
    else if (cur && cur.id === id) S.setServerCurrent(null);
  }
  async function loadEvents() {
    const list = await call('lab_admin_events');
    let current = null;
    list.forEach(e => {
      A.meta[e.id] = { in_corso: e.in_corso, n_participants: e.n_participants, n_done: e.n_done };
      if (e.in_corso) current = e.id;
      putEvent(e);
    });
    S.setServerCurrent(current);
    return list;
  }
  // Tutte le righe la prima volta, poi solo quelle arrivate dopo (con un minuto di margine).
  async function loadEvent(id) {
    const since = A.loaded[id] ? new Date(new Date(A.loaded[id]).getTime() - 60000).toISOString() : null;
    const res = await call('lab_admin_event', { p_event: id, p_since: since });
    if (!res || !res.event) return false;
    putEvent(res.event);
    A.meta[id] = Object.assign(A.meta[id] || {}, { in_corso: !!res.in_corso });
    setCurrent(id, !!res.in_corso);
    S.adminMerge(res.tables, res.deleted);
    A.loaded[id] = res.now;
    return true;
  }

  // Chi ha finito i quattro esercizi conta come «Ha finito», ovunque si trovi.
  function stageOf(p) {
    if (STEPS.every(s => p.progress && p.progress[s])) return 'fine';
    return p.current_step && p.current_step !== 'fine' ? p.current_step : 'faq';
  }
  function eventStats(ev) {
    const ps = S.filter('participants', p => p.event_id === ev.id);
    ps.forEach(S.computeProgress);
    const done = ps.filter(p => STEPS.every(s => p.progress[s]));
    return { ps, done };
  }

  async function viewEvents(token) {
    let list;
    try { list = await loadEvents(); } catch (e) { if (token === A.token) shellError(e); return; }
    if (token !== A.token) return;
    const evs = list.map(e => S.byId('events', e.id)).filter(Boolean);
    shellA(`
      <div class="row head"><h1>Eventi</h1><span class="spacer"></span><a class="btn primary" href="#/admin/nuovo">Nuovo evento</a></div>
      ${evs.length ? `<div class="table-wrap"><table class="t">
        <thead><tr><th>Evento</th><th>Data</th><th>Link per i partecipanti</th><th>Stato</th><th class="num">Partecipanti</th><th class="num">Hanno finito</th></tr></thead>
        <tbody>${evs.map(ev => {
          const m = A.meta[ev.id] || {};
          return `<tr><td><a href="#/admin/e/${ev.id}"><strong>${esc(ev.name)}</strong></a><br><span class="muted small">${esc(ev.place || (ev.source === 'pc' ? 'Creato da un PC con evento.js' : ''))}</span></td>
            <td>${ev.date ? fmtDate(ev.date) : ''}</td><td class="mono" style="text-transform:none">${esc(homeLink(ev))}${m.in_corso ? ' <span class="tag accent">in corso</span>' : ''}</td>
            <td><span class="status ${ev.status}">${esc(ev.status)}</span></td>
            <td class="num">${m.n_participants || 0} / ${ev.capacity}</td><td class="num">${m.n_done || 0}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="empty">Ancora nessun evento. Crea il primo con «Nuovo evento».</div>'}
      <p class="muted small" style="margin-top:12px">I link senza codice (per esempio esercizio-2.html) aprono l’evento in corso: quello aperto con la data di oggi o, se non c’è, il più recente.</p>`);
  }

  function viewNewEvent() {
    shellA(`
      <p><a href="#/admin/eventi">${BACK} Eventi</a></p>
      <div class="head" style="margin-top:12px"><h1>Nuovo evento</h1></div>
      <form class="card stack" id="nev" novalidate style="max-width:860px">
        <div class="form-grid">
          <label class="field full"><span>Nome dell’evento</span><input type="text" id="n-name" placeholder="AI Visibility Lab · Montagna Pistoiese"><small>Compare in alto in ogni pagina dei partecipanti.</small></label>
          <label class="field"><span>Data</span><input type="date" id="n-date"></label>
          <label class="field"><span>Luogo</span><input type="text" id="n-place" placeholder="Città (PR)"></label>
          <label class="field"><span>Codice</span><input type="text" id="n-code" placeholder="citta" style="font-family:var(--mono)"><small id="n-url">index.html?evento=…</small></label>
          <label class="field full"><span>Domanda per l’esercizio 2</span><textarea id="n-prompt" rows="2">Cosa vedere a {comune} e dintorni in un weekend, e dove dormire?</textarea><small>{comune} diventa il comune di ciascun partecipante. Per una domanda uguale per tutti, scrivi il nome del territorio.</small></label>
          <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:15px;margin-bottom:8px">Motori</legend>
            <div class="row">${Object.keys(D.MODELS).map(k => `<label class="check"><input type="checkbox" name="n-model" value="${k}" checked><span>${D.MODELS[k].name}</span></label>`).join('')}</div></fieldset>
          <label class="field"><span>Posti</span><input type="number" id="n-cap" value="50" min="1"></label>
          <label class="field"><span>Versione dell’informativa</span><input type="text" id="n-consent" value="${esc(D.CONSENT_VERSION)}"></label>
          <label class="field"><span>Stato</span><select id="n-status"><option value="bozza">Bozza</option><option value="aperto">Aperto</option></select></label>
        </div>
        <p class="err" id="n-err" role="alert" hidden></p>
        <div><button class="btn primary" type="submit">Crea l’evento</button></div>
      </form>`);
    const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 30);
    let codeTouched = false;
    const syncUrl = () => { $('#n-url').textContent = 'index.html?evento=' + ($('#n-code').value || '…'); };
    $('#n-place').addEventListener('input', () => {
      if (!codeTouched) { $('#n-code').value = slug($('#n-place').value.replace(/\(.*?\)/g, '')); syncUrl(); }
    });
    $('#n-code').addEventListener('input', () => { codeTouched = true; syncUrl(); });
    $('#nev').addEventListener('submit', async e => {
      e.preventDefault();
      const code = $('#n-code').value.trim().toLowerCase();
      const models = $$('input[name=n-model]:checked').map(i => i.value);
      const problems = [];
      if (!$('#n-name').value.trim()) problems.push('il nome');
      if (!$('#n-date').value) problems.push('la data');
      if (!$('#n-place').value.trim()) problems.push('il luogo');
      if (!/^[a-z0-9-]{3,30}$/.test(code)) problems.push('il codice, da 3 a 30 lettere o numeri');
      else if (S.eventByCode(code)) problems.push('il codice, già usato da un altro evento');
      if (!$('#n-prompt').value.trim()) problems.push('la domanda per l’esercizio 2');
      if (!models.length) problems.push('serve almeno un motore');
      const showErr = msg => { $('#n-err').hidden = false; $('#n-err').textContent = msg; };
      if (problems.length) return showErr('Controlla: ' + problems.join('; ') + '.');
      $('#nev button[type=submit]').disabled = true;
      try {
        const res = await call('lab_admin_save_event', { p: {
          code, name: $('#n-name').value.trim(), date: $('#n-date').value, place: $('#n-place').value.trim(),
          territory_label: $('#n-place').value.trim(), prompts: [$('#n-prompt').value.trim()],
          models, capacity: Number($('#n-cap').value) || 50,
          consent_version: $('#n-consent').value.trim(), status: $('#n-status').value
        } });
        S.applyServerEvent(res);
        toast('Evento creato.');
        go('#/admin/e/' + res.event.id);
      } catch (err) {
        $('#nev button[type=submit]').disabled = false;
        showErr(/già usato/.test(err.message) ? 'Controlla: il codice, già usato da un altro evento.' : errText(err));
      }
    });
  }

  async function openEvent(id, tab, token) {
    let ok;
    try { ok = await loadEvent(id); } catch (e) { if (token === A.token) shellError(e); return; }
    if (token !== A.token) return;
    if (!ok) { go('#/admin/eventi'); return; }
    viewEvent(S.byId('events', id), tab);
  }
  // Salva campi dell'evento sul server, poi ridisegna.
  async function saveEvent(ev, patch, msg) {
    try {
      const res = await call('lab_admin_save_event', { p: Object.assign({ id: ev.id }, patch) });
      S.applyServerEvent(res);
      if (msg) toast(msg);
      return true;
    } catch (e) {
      toast(errText(e), 6000);
      return false;
    }
  }

  function viewEvent(ev, tab) {
    const st = eventStats(ev);
    const runs = S.filter('model_runs', r => r.event_id === ev.id);
    const opened = runs.filter(r => r.opened_at);
    const pasted = runs.filter(r => r.status === 'incollata');
    const offRuns = runs.filter(r => r.status === 'non_disponibile');
    const nEval = S.filter('evaluations', e => e.event_id === ev.id && e.rating).length;
    const byStage = ['faq', 'territorio', 'hotel', 'posizionamento', 'fine'].map(s => [s, st.ps.filter(p => stageOf(p) === s).length]);
    const maxStage = Math.max(1, ...byStage.map(x => x[1]));
    const url = partLink(ev);
    const current = !!(A.meta[ev.id] || {}).in_corso;
    const tabs = [['avanzamento', 'Avanzamento'], ['domande', 'Domande e motori'], ['risultati', 'Risultati'], ['export', 'Export']];
    shellA(`
      <p><a href="#/admin/eventi">${BACK} Eventi</a></p>
      <div class="row" style="margin-top:12px;align-items:flex-start">
        <div><h1>${esc(ev.name)}</h1><p class="muted" style="margin-top:6px">${ev.date ? fmtDate(ev.date) : ''}${ev.place ? ' · ' + esc(ev.place) : ''}</p></div>
        <span class="spacer"></span>
        <label class="row small"><span class="muted">Stato</span>
          <select id="ev-status" style="width:auto">${['bozza', 'aperto', 'chiuso'].map(s => `<option value="${s}" ${ev.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      <div class="row" style="margin-top:16px">
        <div class="url-box"><span>${esc(shortUrl(url))}</span><button class="btn ghost small" type="button" id="copy-url">Copia</button></div>
        <a class="btn ghost small" href="${homeLink(ev)}" target="_blank" rel="noopener">Apri come partecipante</a>
        ${current ? '<span class="tag accent">in corso</span>' : ''}
      </div>
      <section class="card section">
        <div class="row"><h2>Gli esercizi</h2><span class="spacer"></span><span class="muted small">Si fanno in ordine. Dai il link di un esercizio quando è il momento: nessuna pagina porta alla successiva.</span></div>
        <div class="ex-admin">${D.EXERCISES.map(x => {
          const n = st.ps.filter(p => p.progress[x.id]).length;
          return `<div class="ex-admin-row">
            <span class="ex-n">${x.n}</span>
            <div><strong>${esc(x.long)}</strong><span class="mono" style="text-transform:none;display:block">${esc(shortUrl(partExLink(ev, x.n)))}</span></div>
            <span class="small muted">${n} di ${st.ps.length} hanno finito</span>
            <div class="row ex-actions">
              <button class="btn ghost small" type="button" data-exlink="${x.n}">Copia link</button>
              <a class="btn ghost small" href="${exLink(ev, x.n)}" target="_blank" rel="noopener">Vedi</a>
            </div>
          </div>`;
        }).join('')}</div>
        <p class="muted small" style="margin-top:12px">${current ? 'È l’evento in corso: i link senza codice aprono questo evento.' : ev.status === 'aperto' ? 'I link contengono il codice dell’evento. L’evento in corso, per i link senza codice, è un altro.' : 'Per far entrare i partecipanti metti lo stato su «aperto».'}</p>
      </section>
      <div class="kpis section">
        <div class="kpi"><span class="label">Partecipanti</span><p class="v">${st.ps.length} <small>/ ${ev.capacity}</small></p><p>posti occupati</p></div>
        <div class="kpi"><span class="label">Hanno finito</span><p class="v">${st.done.length}</p><p>${pct(st.done.length, st.ps.length)}% dei partecipanti</p></div>
        <div class="kpi"><span class="label">Valutazioni</span><p class="v">${nEval}</p><p>risposte dell’AI giudicate</p></div>
        <div class="kpi"><span class="label">Risposte incollate</span><p class="v">${pasted.length} <small>/ ${opened.length} aperture</small></p><p>${offRuns.length} volte un motore non si è aperto</p></div>
      </div>
      <div class="card" style="margin-top:14px"><span class="label">Dove sono adesso</span>
        <div class="stage-bars">${byStage.map(([s, n]) => `<div><span>${STAGE_LABEL[s]}</span><span><b style="width:${(n / maxStage) * 100}%" title="${STAGE_LABEL[s]}: ${n}"></b></span><span class="num">${n}</span></div>`).join('')}</div></div>
      <nav class="tabs" aria-label="Sezioni dell’evento">${tabs.map(([k, l]) => `<a href="#/admin/e/${ev.id}?tab=${k}" class="${tab === k ? 'is-current' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
      <div id="tab"></div>`);
    $('#ev-status').addEventListener('change', async e => {
      if (await saveEvent(ev, { status: e.target.value }, 'Stato: ' + e.target.value + '.')) render();
    });
    $('#copy-url').addEventListener('click', async () => toast(await copy(url) ? 'Indirizzo copiato.' : 'Non riesco a copiare.'));
    $$('[data-exlink]').forEach(b => b.addEventListener('click', async () => toast(await copy(partExLink(ev, Number(b.dataset.exlink))) ? 'Link dell’esercizio ' + b.dataset.exlink + ' copiato.' : 'Non riesco a copiare.')));
    ({ avanzamento: tabProgress, domande: tabQuestions, risultati: tabResults, export: tabExport }[tab] || tabProgress)(ev);
    // Aggiornamento dal vivo: ogni 10 secondi le righe nuove dal server. Si ridisegna
    // solo se è cambiato qualcosa, tenendo la posizione; la scheda delle domande no,
    // per non disturbare chi scrive.
    const token = A.token;
    let stopped = false;
    let timer = null;
    const tick = async () => {
      if (stopped) return;
      const before = A.loaded[ev.id];
      let changed = false;
      try {
        const n0 = S.TABLES.reduce((n, t) => n + S.all(t).length, 0);
        const sig0 = JSON.stringify(S.byId('events', ev.id));
        const res = await call('lab_admin_event', { p_event: ev.id, p_since: new Date(new Date(before).getTime() - 60000).toISOString() });
        if (stopped || token !== A.token) return;
        if (!res || !res.event) { go('#/admin/eventi'); return; }
        putEvent(res.event);
        A.meta[ev.id] = Object.assign(A.meta[ev.id] || {}, { in_corso: !!res.in_corso });
        setCurrent(ev.id, !!res.in_corso);
        const fresh = Object.keys(res.tables).some(t => res.tables[t].some(r => !r.received_at || r.received_at > before)) || res.deleted.length > 0;
        S.adminMerge(res.tables, res.deleted);
        A.loaded[ev.id] = res.now;
        changed = fresh || S.TABLES.reduce((n, t) => n + S.all(t).length, 0) !== n0 || JSON.stringify(S.byId('events', ev.id)) !== sig0;
      } catch (e) { /* si riprova al prossimo giro */ }
      if (stopped || token !== A.token) return;
      if (changed && tab !== 'domande') {
        const y = window.scrollY;
        cleanups.forEach(fn => fn());
        cleanups = [];
        viewEvent(S.byId('events', ev.id), tab);
        window.scrollTo(0, y);
        return;
      }
      if (tab === 'avanzamento') tabProgress(S.byId('events', ev.id));
      timer = setTimeout(tick, POLL);
    };
    timer = setTimeout(tick, POLL);
    onCleanup(() => { stopped = true; clearTimeout(timer); });
  }

  function tabProgress(ev) {
    const { ps } = eventStats(ev);
    const done = p => STEPS.every(s => p.progress[s]);
    const list = ps.filter(p => ui.filter === 'tutti' || (ui.filter === 'finito' ? done(p) : !done(p)))
      .sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1));
    const nDone = ps.filter(done).length;
    const del = ui.names && isData();
    $('#tab').innerHTML = `
      <div class="filters">
        ${[['tutti', 'Tutti', ps.length], ['corso', 'In corso', ps.length - nDone], ['finito', 'Hanno finito', nDone]].map(([k, l, n]) => `<button class="pill" type="button" data-f="${k}" aria-pressed="${ui.filter === k}">${l} · ${n}</button>`).join('')}
        <span class="spacer"></span>
        <label class="check small"><input type="checkbox" id="show-names" ${ui.names ? 'checked' : ''}><span>Mostra struttura e comune</span></label>
      </div>
      ${list.length ? `<div class="table-wrap"><table class="t">
        <thead><tr><th>ID</th>${ui.names ? '<th>Struttura</th><th>Comune</th>' : ''}<th>Esercizi</th><th>Adesso</th><th>Ultimo salvataggio</th>${del ? '<th><span class="sr">Cancella</span></th>' : ''}</tr></thead>
        <tbody>${list.map(p => {
          const prop = S.byId('properties', p.property_id) || {};
          return `<tr><td class="mono" style="text-transform:none">${esc(p.id)}</td>
            ${ui.names ? `<td>${esc(prop.name)}</td><td>${esc(prop.comune)}</td>` : ''}
            <td><span class="dots" aria-label="${STEPS.filter(s => p.progress[s]).length} esercizi su 4">${STEPS.map(s => `<i class="${p.progress[s] ? 'is-done' : p.current_step === s ? 'is-current' : ''}" title="${STAGE_LABEL[s]}"></i>`).join('')}</span></td>
            <td>${STAGE_LABEL[stageOf(p)]}</td><td class="muted">${p.last_seen_at ? ago(p.last_seen_at) : ''}</td>
            ${del ? `<td><button class="linkbtn" type="button" data-del="${esc(p.id)}">Cancella</button></td>` : ''}</tr>`;
        }).join('')}</tbody></table></div>` : '<div class="empty">Nessun partecipante in questo gruppo.</div>'}
      <p class="muted small" style="margin-top:12px">Si aggiorna da solo ogni 10 secondi. I nomi sono nascosti di default: le tabelle di analisi usano solo l’ID.${isData() ? ' Per cancellare i dati di una struttura su richiesta, mostra struttura e comune e premi «Cancella».' : ''}</p>`;
    $$('#tab [data-f]').forEach(b => b.addEventListener('click', () => { ui.filter = b.dataset.f; tabProgress(ev); }));
    $('#show-names').addEventListener('change', e => { ui.names = e.target.checked; tabProgress(ev); });
    $$('#tab [data-del]').forEach(b => b.addEventListener('click', async () => {
      const p = S.byId('participants', b.dataset.del);
      const prop = p ? S.byId('properties', p.property_id) || {} : {};
      if (!p || !confirm('Cancellare tutti i dati di ' + (prop.name || p.id) + (prop.comune ? ' (' + prop.comune + ')' : '') + '? Non si può annullare.')) return;
      try {
        await call('lab_admin_delete_participant', { p_pid: p.id });
        await loadEvent(ev.id);
        toast('Dati cancellati.');
        render();
      } catch (e) { toast(errText(e), 6000); }
    }));
  }

  function tabQuestions(ev) {
    const qs = S.filter('questions', q => q.event_id === ev.id && q.exercise_id === 'territorio' && q.source === 'evento').sort((a, b) => a.position - b.position);
    const sent = q => S.filter('model_runs', r => r.event_id === ev.id && r.exercise_id === 'territorio' && r.question_id === q.id && r.opened_at).sort((a, b) => (a.opened_at < b.opened_at ? -1 : 1));
    $('#tab').innerHTML = `
      <div class="grid-2">
        <section class="card stack">
          <h2>Domanda per il territorio</h2>
          <p class="muted small">Esercizio 2. Una domanda in uso alla volta. Scrivi {comune} dove vuoi il comune di ciascun partecipante. Cambiarla durante l’evento rende le risposte non confrontabili. I PC la ricevono alla pagina successiva che aprono.</p>
          ${qs.map(q => {
            const s = sent(q);
            return `<div class="prompt-row">
              <input type="radio" name="tq" value="${q.id}" ${ev.territory_question_id === q.id ? 'checked' : ''} aria-label="Usa questa domanda">
              <div><input type="text" data-tq="${q.id}" value="${esc(q.text)}" ${s.length ? 'disabled' : ''}>
                <small class="muted">${s.length ? 'Aperta nei motori da ' + new Set(s.map(r => r.participant_id)).size + ' partecipanti, la prima volta alle ' + fmtTime(s[0].opened_at) + '. Per cambiarla aggiungi una domanda nuova.' : 'Nessuno l’ha ancora aperta.'}</small></div>
              ${ev.territory_question_id === q.id ? '<span class="tag accent" style="margin-top:12px">in uso</span>' : '<span></span>'}
            </div>`;
          }).join('')}
          <div class="row"><input type="text" id="tq-new" placeholder="Nuova domanda" style="flex:1;min-width:200px"><button class="btn ghost" type="button" id="tq-add">Aggiungi</button></div>
        </section>
        <section class="card stack">
          <h2>Motori e impostazioni</h2>
          <fieldset style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:8px">Motori</legend>
            <div class="row">${Object.keys(D.MODELS).map(k => `<label class="check"><input type="checkbox" name="s-model" value="${k}" ${ev.models.indexOf(k) >= 0 ? 'checked' : ''}><span>${D.MODELS[k].name}</span></label>`).join('')}</div></fieldset>
          <p class="muted small">Si aprono senza account. La ricerca sul web la decide il motore.</p>
          <div class="form-grid">
            <label class="field full"><span>Nome dell’evento</span><input type="text" id="s-name" value="${esc(ev.name)}"></label>
            <label class="field"><span>Data</span><input type="date" id="s-date" value="${esc(ev.date || '')}"></label>
            <label class="field"><span>Posti</span><input type="number" id="s-cap" value="${ev.capacity}" min="1"></label>
            <label class="field full"><span>Versione dell’informativa</span><input type="text" id="s-consent" value="${esc(ev.consent_version)}"><small>Quella firmata su carta all’ingresso.</small></label>
          </div>
          <div><button class="btn primary" type="button" id="s-save">Salva le impostazioni</button></div>
        </section>
      </div>`;
    const cur = () => S.byId('events', ev.id);
    $$('#tab input[name=tq]').forEach(r => r.addEventListener('change', async () => {
      if (await saveEvent(cur(), { territory_question_id: r.value }, 'Domanda in uso aggiornata.')) tabQuestions(cur());
    }));
    $$('#tab [data-tq]').forEach(i => i.addEventListener('input', debounce(async () => {
      if (!i.value.trim()) return;
      try { S.applyServerEvent(await call('lab_admin_save_question', { p_event: ev.id, p_id: i.dataset.tq, p_text: i.value })); } catch (e) { toast(errText(e), 6000); }
    }, 600)));
    $('#tq-add').addEventListener('click', async () => {
      const t = $('#tq-new').value.trim();
      if (!t) return;
      try {
        S.applyServerEvent(await call('lab_admin_save_question', { p_event: ev.id, p_id: null, p_text: t }));
        tabQuestions(cur());
      } catch (e) { toast(errText(e), 6000); }
    });
    $('#s-save').addEventListener('click', async () => {
      const models = $$('#tab input[name=s-model]:checked').map(i => i.value);
      if (!models.length) { toast('Serve almeno un motore.'); return; }
      if (!$('#s-name').value.trim()) { toast('Serve il nome dell’evento.'); return; }
      if (await saveEvent(cur(), { models, name: $('#s-name').value.trim(), date: $('#s-date').value, capacity: Number($('#s-cap').value) || ev.capacity, consent_version: $('#s-consent').value.trim() || ev.consent_version }, 'Impostazioni salvate.')) render();
    });
  }

  // ---------- risultati ----------
  function tabResults(ev) {
    const tq = S.territoryQuestion(ev);
    const ps = S.filter('participants', p => p.event_id === ev.id);
    const cite = ev.models.map(m => {
      const vals = tq ? S.filter('submissions', s => s.event_id === ev.id && s.question_id === tq.id && s.field === 'citato_' + m && s.value) : [];
      return { m, yes: vals.filter(v => v.value === 'si').length, n: vals.length };
    });
    const stack = (ex, opts) => ev.models.map(m => {
      const runIds = new Set(S.filter('model_runs', r => r.event_id === ev.id && r.exercise_id === ex && r.engine === m).map(r => r.id));
      const evs = S.filter('evaluations', e => e.event_id === ev.id && runIds.has(e.run_id) && e.rating);
      return { m, n: evs.length, parts: opts.map(([k, l, cls]) => ({ k, l, cls, v: evs.filter(e => e.rating === k).length })) };
    });
    const hotel = stack('hotel', [['corretta', 'Corretta', 'c'], ['incompleta', 'Incompleta', 'p'], ['errata', 'Errata', 'w']]);
    const pos = stack('posizionamento', [['si', 'Sì', 'c'], ['in_parte', 'In parte', 'p'], ['no', 'No', 'w']]);
    const notes = S.filter('submissions', s => s.event_id === ev.id && s.field === 'cosa_manca' && s.value.trim()).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

    const who = m => `<span class="who">${mark(m)}${esc(D.MODELS[m].short)}</span>`;
    const chartCite = `<div class="chart">${cite.map(c => `<div class="chart-row">${who(c.m)}
      <div class="onebar"><div class="track" tabindex="0" data-tip="${esc(D.MODELS[c.m].name)}: citato per ${c.yes} partecipanti su ${c.n}"><b style="width:${pct(c.yes, c.n)}%"></b></div><span class="v">${pct(c.yes, c.n)}%</span></div></div>`).join('')}</div>`;
    const chartStack = rows => {
      const legend = rows[0] ? `<div class="legend">${rows[0].parts.map(p => `<span><i style="background:var(--r-${p.cls === 'c' ? 'correct' : p.cls === 'p' ? 'partial' : 'wrong'})"></i>${p.l}</span>`).join('')}</div>` : '';
      return legend + `<div class="chart">${rows.map(r => `<div class="chart-row">${who(r.m)}
        <div class="stackbar">${r.n ? r.parts.filter(p => p.v).map(p => {
          const w = pct(p.v, r.n);
          return `<span class="${p.cls}" style="flex:${p.v}" tabindex="0" data-tip="${esc(D.MODELS[r.m].name)} · ${p.l}: ${p.v} su ${r.n} (${w}%)">${w >= 12 ? w + '%' : ''}</span>`;
        }).join('') : '<span class="muted small" style="color:var(--muted)">Nessuna valutazione</span>'}</div></div>`).join('')}</div>`;
    };
    const tableStack = rows => `<div class="table-wrap"><table class="t"><thead><tr><th>Motore</th>${rows[0].parts.map(p => `<th class="num">${p.l}</th>`).join('')}<th class="num">Totale</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${esc(D.MODELS[r.m].name)}</td>${r.parts.map(p => `<td class="num">${p.v} (${pct(p.v, r.n)}%)</td>`).join('')}<td class="num">${r.n}</td></tr>`).join('')}</tbody></table></div>`;
    const tableCite = `<div class="table-wrap"><table class="t"><thead><tr><th>Motore</th><th class="num">Comune citato</th><th class="num">Risposte</th><th class="num">Quota</th></tr></thead>
      <tbody>${cite.map(c => `<tr><td>${esc(D.MODELS[c.m].name)}</td><td class="num">${c.yes}</td><td class="num">${c.n}</td><td class="num">${pct(c.yes, c.n)}%</td></tr>`).join('')}</tbody></table></div>`;
    const block = (id, title, sub, chart, table) => `
      <section class="card" style="margin-top:16px">
        <div class="row"><div><h2>${title}</h2><p class="muted small" style="margin-top:4px">${sub}</p></div><span class="spacer"></span>
          <button class="btn ghost small" type="button" data-toggle="${id}" aria-pressed="${!!ui.tables[id]}">${ui.tables[id] ? 'Mostra il grafico' : 'Mostra la tabella'}</button></div>
        <div style="margin-top:14px">${ui.tables[id] ? table : chart}</div>
      </section>`;

    $('#tab').innerHTML = `
      <p class="note info">Le risposte dei motori cambiano a ogni richiesta. Questi numeri dicono cosa hanno visto i partecipanti di questo evento: non sono una misura stabile della visibilità.</p>
      ${block('cite', 'Il comune è citato?', 'Esercizio 2 · quota di partecipanti che trovano il proprio comune nella risposta', chartCite, tableCite)}
      ${block('hotel', 'Le risposte sulla struttura', 'Esercizio 3 · valutazioni dei partecipanti, per motore', chartStack(hotel), tableStack(hotel))}
      ${block('pos', 'Ti ci ritrovi?', 'Esercizio 4 · quanto la descrizione dell’AI corrisponde alla struttura', chartStack(pos), tableStack(pos))}
      <section class="section"><h2>Cosa manca, secondo i partecipanti</h2>
        ${notes.length ? `<ul class="notes-list">${notes.map(n => `<li>${esc(n.value)}</li>`).join('')}</ul>` : '<p class="muted">Ancora nessuna nota.</p>'}
        <p class="muted small" style="margin-top:10px">${ps.length} partecipanti, ${notes.length} note dall’esercizio 2.</p></section>`;
    $$('#tab [data-toggle]').forEach(b => b.addEventListener('click', () => { ui.tables[b.dataset.toggle] = !ui.tables[b.dataset.toggle]; tabResults(ev); }));
  }

  // ---------- export ----------
  // Toglie dai testi il nome di ogni struttura dell'evento (anche senza «Hotel»,
  // «B&B»…) e il comune del partecipante: maiuscole o minuscole, solo parole intere.
  const NAME_PREFIX = /^(hotel|albergo|agriturismo|b&b|bed and breakfast|casa vacanze|casa vacanza|case vacanza|residence|ostello|campeggio|camping|relais|locanda|affittacamere)\s+/i;
  const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function wordRe(words) {
    const list = Array.from(new Set(words.map(w => (w || '').trim()).filter(w => w.length >= 3))).sort((a, b) => b.length - a.length).map(reEsc);
    return list.length ? new RegExp('(^|[^\\p{L}\\p{N}])(' + list.join('|') + ')(?![\\p{L}\\p{N}])', 'giu') : null;
  }
  function redactorFor(ev) {
    const names = [];
    S.filter('properties', x => x.event_id === ev.id).forEach(x => {
      names.push(x.name);
      const core = x.name.replace(NAME_PREFIX, '');
      if (core !== x.name && core.trim().length >= 4) names.push(core);
    });
    const reName = wordRe(names);
    const cache = new Map();
    return pid => {
      if (cache.has(pid)) return cache.get(pid);
      const p = pid ? S.byId('participants', pid) : null;
      const prop = p ? S.byId('properties', p.property_id) : null;
      const reTown = prop ? wordRe([prop.comune].concat(S.aliases(prop.comune))) : null;
      const fn = text => {
        if (text == null || text === '') return text;
        let out = String(text);
        if (reName) out = out.replace(reName, (m, pre) => pre + '[struttura]');
        if (reTown) out = out.replace(reTown, (m, pre) => pre + '[comune]');
        return out;
      };
      cache.set(pid, fn);
      return fn;
    };
  }
  const JOINED_COLS = ['evento', 'codice_evento', 'partecipante', 'esercizio', 'motore', 'provider', 'canale', 'prompt', 'parametri', 'aperta_alle', 'aperture', 'incollata_alle', 'esito', 'risposta_incollata', 'comune_citato', 'domanda_valutata', 'valutazione', 'nota'];
  function exportJoined(ev, ident) {
    const when = r => r.opened_at || r.created_at;
    const runs = S.filter('model_runs', r => r.event_id === ev.id).sort((a, b) => (when(a) < when(b) ? -1 : 1));
    const rows = [];
    const cleanFor = redactorFor(ev);
    runs.forEach(r => {
      const resp = S.responseFor(r.id) || {};
      const p = S.byId('participants', r.participant_id);
      const prop = p ? S.byId('properties', p.property_id) : null;
      const clean = ident ? (t => t) : cleanFor(r.participant_id);
      const base = {
        evento: ev.name, codice_evento: ev.code, partecipante: r.participant_id, esercizio: r.exercise_id,
        motore: D.MODELS[r.engine] ? D.MODELS[r.engine].name : r.engine, provider: r.provider, canale: r.channel,
        prompt: clean(r.prompt), parametri: r.params, aperta_alle: r.opened_at || '', aperture: r.opens || 0,
        incollata_alle: r.pasted_at || '', esito: r.status, risposta_incollata: clean(resp.text || ''),
        comune_citato: r.exercise_id === 'territorio' ? S.getSub(r.participant_id, 'territorio', r.question_id, 'citato_' + r.engine) : ''
      };
      if (ident) Object.assign(base, { struttura: prop ? prop.name : '', comune: prop ? prop.comune : '', sito: prop ? prop.website : '' });
      const evs = S.filter('evaluations', e => e.run_id === r.id && (e.rating || e.note));
      if (!evs.length) rows.push(Object.assign({}, base, { domanda_valutata: '', valutazione: '', nota: '' }));
      evs.forEach(e => {
        const q = e.question_id ? S.byId('questions', e.question_id) : null;
        rows.push(Object.assign({}, base, { domanda_valutata: q ? clean(q.text) : '', valutazione: e.rating, nota: clean(e.note || '') }));
      });
    });
    return rows;
  }
  function tabExport(ev) {
    const day = new Date().toISOString().slice(0, 10);
    if (!isData()) ui.ident = false;
    const pids = new Set(S.filter('participants', p => p.event_id === ev.id).map(p => p.id));
    const runIds = new Set(S.filter('model_runs', r => r.event_id === ev.id).map(r => r.id));
    // Senza la spunta, ogni testo libero passa dal filtro che toglie nomi e comuni.
    const cleanFor = redactorFor(ev);
    const scrub = (rows, field, pidOf) => (ui.ident ? rows : rows.map(r => Object.assign({}, r, { [field]: cleanFor(pidOf(r))(r[field]) })));
    const runPid = runId => { const r = S.byId('model_runs', runId); return r ? r.participant_id : null; };
    const tables = {
      events: { label: 'Evento', desc: 'Impostazioni dell’evento: motori, posti, versione dell’informativa.', rows: () => [ev] },
      participants: { label: 'Partecipanti', desc: 'ID interno e avanzamento. Nessun nome.', rows: () => S.filter('participants', p => p.event_id === ev.id).map(p => Object.assign({}, p, { progress: JSON.stringify(p.progress) })) },
      properties: { label: 'Strutture', desc: 'Nome, comune, tipo e sito. Dati identificabili.', ident: true, rows: () => S.filter('properties', p => p.event_id === ev.id) },
      questions: { label: 'Domande', desc: 'Domande dell’evento e delle FAQ di ogni partecipante.', rows: () => scrub(S.filter('questions', q => q.event_id === ev.id), 'text', r => r.participant_id) },
      submissions: { label: 'Risposte dei partecipanti', desc: 'FAQ, osservazioni, note, scelte.', rows: () => scrub(S.filter('submissions', s => pids.has(s.participant_id)), 'value', r => r.participant_id) },
      model_runs: { label: 'Aperture dei motori', desc: 'Motore, canale, domanda esatta, ora della prima apertura, quante volte, ora della risposta incollata, esito.', rows: () => scrub(S.filter('model_runs', r => r.event_id === ev.id), 'prompt', r => r.participant_id) },
      model_responses: { label: 'Risposte incollate', desc: 'Il testo che ogni partecipante ha copiato dal motore.', rows: () => scrub(S.filter('model_responses', r => runIds.has(r.run_id)), 'text', r => runPid(r.run_id)) },
      evaluations: { label: 'Valutazioni', desc: 'Giudizio del partecipante su ogni risposta (nell’esercizio 3, per domanda), con nota.', rows: () => scrub(S.filter('evaluations', e => e.event_id === ev.id), 'note', r => r.participant_id) }
    };
    $('#tab').innerHTML = `
      ${isData() ? `<label class="check" style="margin-bottom:16px"><input type="checkbox" id="ident" ${ui.ident ? 'checked' : ''}><span><strong>Includi i dati identificabili</strong> (nome della struttura, comune, sito). Senza spunta, in tutti i file i nomi delle strutture diventano [struttura] e il comune di ciascuno [comune]. Il filtro riconosce i nomi scritti per intero o senza «Hotel», «B&B» e simili: un soprannome o un errore di battitura resta.</span></label>` : '<p class="note small" style="margin-bottom:16px">In tutti i file i nomi delle strutture diventano [struttura] e il comune di ciascuno [comune]. I file con i dati identificabili li scarica solo chi ha il ruolo «dati».</p>'}
      <div class="export-list">
        <div class="item main"><div><strong>Risposte e valutazioni</strong><p>Una riga per ogni risposta valutata: motore, domanda esatta, ora di apertura e di incolla, testo incollato, comune citato, valutazione e nota.</p></div>
          <span class="muted small">${exportJoined(ev, false).length} righe</span><button class="btn primary small" type="button" data-x="_joined">Scarica CSV</button></div>
        ${Object.keys(tables).map(k => {
          const t = tables[k];
          const off = t.ident && !ui.ident;
          return `<div class="item"><div><strong>${t.label}</strong> <span class="mono" style="text-transform:none">${k}</span><p>${t.desc}</p></div>
            <span class="muted small">${t.rows().length} righe</span><button class="btn ghost small" type="button" data-x="${k}" ${off ? 'disabled title="Spunta i dati identificabili"' : ''}>Scarica CSV</button></div>`;
        }).join('')}
      </div>
      <p class="muted small" style="margin-top:14px">CSV con punto e virgola e codifica UTF-8: si apre direttamente in Excel. I dati si cancellano da soli 12 mesi dopo la data del Lab.</p>`;
    if ($('#ident')) $('#ident').addEventListener('change', e => { ui.ident = e.target.checked; tabExport(ev); });
    $$('#tab [data-x]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.x;
      const suffix = ui.ident ? '-identificabili' : '';
      if (k === '_joined') download('lab-' + ev.code + '-risposte-valutazioni' + suffix + '-' + day + '.csv', S.toCSV(exportJoined(ev, ui.ident), ui.ident ? JOINED_COLS.concat(['struttura', 'comune', 'sito']) : JOINED_COLS));
      else download('lab-' + ev.code + '-' + k + '-' + day + '.csv', S.toCSV(tables[k].rows()));
    }));
  }

  // ---------- suggerimenti sui grafici ----------
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(el) {
    const r = el.getBoundingClientRect();
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
  }
  document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); else tip.hidden = true; });
  document.addEventListener('focusin', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('focusout', () => { tip.hidden = true; });
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

  // ---------- avvio ----------
  // Le pagine prendono il Lab di oggi dal server. Se il PC lo conosce già si parte
  // subito e lo si aggiorna in sottofondo (si ridisegna solo se è cambiato e non si
  // è ancora scritto niente); la prima volta si aspetta il server al massimo 3
  // secondi, poi vale evento.js.
  let touched = false;
  document.addEventListener('input', () => { touched = true; }, true);
  document.addEventListener('change', () => { touched = true; }, true);
  function boot() {
    if (PAGE === 'admin') { adminBoot(); return; }
    if (!SY) { render(); return; }
    const code = (new URLSearchParams(location.search).get('evento') || '').trim().toLowerCase();
    const known = code ? !!S.eventByCode(code) : S.serverCurrentKnown();
    let shown = false;
    const show = () => { if (!shown) { shown = true; render(); } };
    SY.refreshEvent(code)
      .then(changed => { if (shown && changed && !touched) render(); }, () => { /* il server non risponde: vale quello che il PC sa */ })
      .finally(show);
    if (known) show();
    else setTimeout(show, 3000);
  }
  boot();
})();
