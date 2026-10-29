// Dati fissi del prototipo: modelli, domande di partenza, risposte simulate.
// Nessuna chiamata vera ai modelli: i testi qui sotto sono scritti a mano e
// vengono scelti in modo deterministico, così lo stesso input dà lo stesso output.

window.LAB_DATA = {
  CONSENT_VERSION: '1.0',

  // Motori aperti senza account. Il link apre la pagina vuota: niente parte da solo.
  MODELS: {
    chatgpt: { name: 'ChatGPT', short: 'ChatGPT', provider: 'OpenAI', channel: 'chatgpt.com senza account', home: 'https://chatgpt.com/' },
    aimode: { name: 'Modalità AI di Google', short: 'Modalità AI', provider: 'Google', channel: 'google.com modalità AI senza account', home: 'https://www.google.com/search?udm=50' },
    gemini: { name: 'Gemini', short: 'Gemini', provider: 'Google', channel: 'gemini.google.com senza account', home: 'https://gemini.google.com/app' }
  },

  EXERCISES: [
    { id: 'faq', n: 1, title: 'FAQ', long: 'Le domande di ospiti e visitatori' },
    { id: 'territorio', n: 2, title: 'Territorio', long: 'Cosa dice l’AI del territorio' },
    { id: 'hotel', n: 3, title: 'Su di te', long: 'Cosa sa l’AI di te' },
    { id: 'posizionamento', n: 4, title: 'Posizionamento', long: 'A chi ti consiglia l’AI' }
  ],

  ROLES: ['Titolare', 'Direzione', 'Marketing e vendite', 'Ricevimento', 'Altro'],
  TYPES: ['Hotel', 'Agriturismo', 'B&B', 'Casa vacanze', 'Campeggio', 'Altro'],

  FAQ_DEFAULT: [
    { key: 'checkin', text: 'A che ora sono il check-in e il check-out?' },
    { key: 'parcheggio', text: 'C’è un parcheggio? Si paga?' },
    { key: 'animali', text: 'Si possono portare animali?' },
    { key: 'colazione', text: 'La colazione è inclusa? Ci sono opzioni senza glutine o vegane?' },
    { key: 'arrivo', text: 'Come si arriva senza auto?' },
    { key: 'cancellazione', text: 'Fino a quando si può cancellare senza pagare?' },
    { key: 'accessibilita', text: 'La struttura è accessibile a chi si muove in sedia a rotelle?' },
    { key: 'bambini', text: 'È adatta a famiglie con bambini piccoli?' },
    { key: 'wifi', text: 'Il Wi-Fi funziona bene anche in camera?' },
    { key: 'dintorni', text: 'Cosa si può fare nei dintorni senza prendere l’auto?' }
  ],

  // Esercizio 2, solo per i partecipanti di esempio: una versione che cita il
  // comune e una che non lo cita.
  TERRITORY: {
    chatgpt: [
      'A {comune} e dintorni puoi partire dal centro storico e dai luoghi più conosciuti, poi scegliere un\u2019escursione nei paesi vicini. Per dormire, le zone più comode sono vicine al centro, con hotel e B&B a pochi minuti a piedi.',
      'Per un weekend in questa zona ti suggerisco i borghi più noti e una camminata nella natura. Per dormire, conviene scegliere il centro più grande della zona, dove ci sono più strutture.'
    ],
    aimode: [
      'Le fonti più citate su {comune} parlano soprattutto dei monumenti principali e della cucina locale. Per dormire indicano strutture in centro, con poche informazioni sui dintorni.',
      'Le fonti più citate per questa zona parlano dei borghi più grandi e dei musei principali. Per dormire indicano soprattutto hotel nelle città vicine.'
    ],
    gemini: [
      'In due giorni a {comune} si vede molto: il primo giorno il centro e i musei, il secondo un borgo vicino o una camminata. Se cerchi tranquillità, guarda gli agriturismi fuori dal centro.',
      'In due giorni si vede molto: il primo giorno una città d\u2019arte vicina, il secondo una camminata. Se cerchi tranquillità, guarda gli agriturismi in campagna.'
    ]
  },

  // Esercizio 3. Tre varianti per domanda: non sa, vaga, precisa (che può essere sbagliata).
  HOTEL_ANSWERS: {
    checkin: [
      'Non trovo orari aggiornati per {nome}. Di solito nelle strutture della zona il check-in è nel primo pomeriggio, ma ti consiglio di chiedere alla struttura.',
      '{nome} indica orari standard per check-in e check-out. Alcuni ospiti nelle recensioni parlano di un arrivo flessibile se avvisi prima.',
      'A {nome} il check-in è dalle 15:00 alle 20:00, il check-out entro le 10:30. Per arrivare in tarda serata serve avvisare.'
    ],
    parcheggio: [
      'Non ho informazioni certe sul parcheggio di {nome}. A {comune} ci sono parcheggi pubblici, alcuni a pagamento.',
      'Secondo alcune recensioni {nome} ha un parcheggio, ma non è chiaro se sia gratuito o da prenotare.',
      '{nome} ha un parcheggio privato gratuito con una decina di posti, non custodito. Non serve prenotarlo.'
    ],
    animali: [
      'Non trovo regole sugli animali per {nome}. Conviene scrivere alla struttura prima di prenotare.',
      'Alcuni portali indicano che {nome} accetta animali su richiesta, forse con un supplemento.',
      '{nome} non accetta animali, tranne i cani guida.'
    ],
    colazione: [
      'Non ho dettagli sulla colazione di {nome}. Molte strutture a {comune} la includono nel prezzo.',
      'La colazione a {nome} è descritta come abbondante, con prodotti locali. Non trovo informazioni su opzioni senza glutine o vegane.',
      'La colazione è inclusa ed è servita a buffet dalle 7:30 alle 10:00. Su richiesta ci sono prodotti senza glutine.'
    ],
    arrivo: [
      'Non trovo indicazioni sui trasporti per {nome}. Per {comune} puoi controllare i treni regionali e gli autobus più vicini.',
      '{comune} si raggiunge in treno o in autobus, ma per arrivare a {nome} potrebbe servire un taxi.',
      'Dalla stazione più vicina a {nome} ci sono circa 2 km. La struttura offre una navetta gratuita su prenotazione.'
    ],
    cancellazione: [
      'Le condizioni di cancellazione di {nome} dipendono dalla tariffa e dal sito su cui prenoti. Controlla la conferma della prenotazione.',
      '{nome} di solito permette di cancellare gratis fino a qualche giorno prima dell’arrivo, ma dipende dalla tariffa.',
      'A {nome} la cancellazione è gratuita fino a 48 ore prima dell’arrivo. Dopo si paga la prima notte.'
    ],
    accessibilita: [
      'Non ho informazioni verificate sull’accessibilità di {nome}. Ti consiglio di chiedere quali camere sono al piano terra.',
      '{nome} è in un edificio storico: alcune recensioni segnalano scale, altre parlano di una camera al piano terra.',
      '{nome} ha una camera accessibile al piano terra con bagno attrezzato e un posto auto riservato.'
    ],
    bambini: [
      'Non trovo informazioni sui servizi per bambini a {nome}.',
      '{nome} piace a famiglie e coppie. Alcuni ospiti parlano di spazi all’aperto adatti ai bambini.',
      '{nome} offre culle gratuite, seggioloni e un’area giochi in giardino. I bambini sotto i 3 anni non pagano.'
    ],
    wifi: [
      'Non ho dati sulla connessione di {nome}.',
      'Il Wi-Fi c’è, ma alcune recensioni dicono che in camera il segnale è debole.',
      '{nome} ha Wi-Fi gratuito in tutta la struttura, in fibra. Gli ospiti lo descrivono stabile anche per lavorare.'
    ],
    dintorni: [
      'Non trovo informazioni sui dintorni di {nome}. A {comune} puoi chiedere all’ufficio turistico.',
      'Intorno a {comune} ci sono passeggiate, borghi e cucina locale. Per molte attività serve l’auto.',
      'Da {nome} si raggiungono a piedi il centro di {comune}, un sentiero ad anello e due ristoranti tipici.'
    ],
    _generic: [
      'Non trovo informazioni verificate su questo punto per {nome}. Ti consiglio di controllare il sito ufficiale o di scrivere alla struttura.',
      'Sulle recensioni di {nome} trovo indicazioni diverse su questo punto. Conviene verificare con la struttura prima di prenotare.',
      'Secondo le informazioni che trovo, la risposta per {nome} è sì. La fonte però non è il sito ufficiale e potrebbe non essere aggiornata.'
    ]
  },

  // Esercizio 4. A chi consiglierebbero la struttura, per tipo.
  POSITIONING: {
    Agriturismo: {
      chatgpt: 'Consiglierei {nome} a coppie e piccoli gruppi che cercano tranquillità e cucina del territorio. È una buona base per camminare nei dintorni di {comune}, meno adatta a chi cerca vita serale.',
      gemini: '{nome} va bene per famiglie con bambini che vogliono spazi all’aperto. È meno comodo per chi viaggia senza auto.',
      aimode: 'Le recensioni di {nome} citano soprattutto la quiete e la colazione. Lo consiglierei a chi fa una sosta di una o due notti e si sposta in auto.'
    },
    Hotel: {
      chatgpt: 'Consiglierei {nome} a chi visita {comune} per un weekend e vuole stare vicino al centro, senza usare l’auto ogni giorno.',
      gemini: '{nome} è adatto a viaggi di lavoro e soste brevi, grazie alla posizione e al parcheggio.',
      aimode: 'Le fonti descrivono {nome} come scelta per gruppi organizzati e coppie. Trovo poche informazioni sui servizi per famiglie.'
    },
    'B&B': {
      chatgpt: 'Consiglierei {nome} a coppie con un budget contenuto che vogliono un contatto diretto con chi gestisce la casa.',
      gemini: '{nome} è adatto a viaggiatori singoli e a chi percorre i cammini della zona, per una o due notti.',
      aimode: 'Non trovo abbastanza informazioni recenti su {nome} per un consiglio preciso. In generale i B&B di {comune} sono scelti da coppie per brevi soggiorni.'
    },
    _generic: {
      chatgpt: 'Consiglierei {nome} a chi cerca una base tranquilla per visitare {comune} e i dintorni.',
      gemini: '{nome} è adatto a famiglie e gruppi di amici che vogliono spazio e autonomia.',
      aimode: 'Trovo poche informazioni aggiornate su {nome}. Le recensioni parlano soprattutto della posizione.'
    }
  },

  // Dati di esempio per il pannello: nomi e comuni inventati.
  DEMO_COMUNI: ['Comune A', 'Comune B', 'Comune C', 'Comune D', 'Comune E', 'Comune F'],
  DEMO_NOTES: [
    'Parla solo dei paesi più grandi.',
    'Non cita le feste d\u2019autunno nei borghi più piccoli.',
    'Nessuno dice come arrivare in treno.',
    'Le fonti sono guide e portali, non i siti del territorio.',
    'Mancano le esperienze in campagna.',
    'Il mio comune non c\u2019è, eppure ha un castello e un museo.'
  ]
};
