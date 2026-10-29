# Portale del Lab, Fase 2: le risposte arrivano a RankWit

Il sito che i partecipanti aprono sul loro PC durante l'AI Visibility Lab. Quattro esercizi, ognuno su una pagina a sé, nessun login. Vale per hotel e per destinazioni (DMO): sulla prima pagina scrivono il nome della struttura o della destinazione e il proprio comune (non la zona), poi fanno gli esercizi.

Rispetto alla Fase 1 (`lab-portale (4)`, online oggi) le pagine dei partecipanti sono le stesse. Cambia questo:

- le risposte arrivano a RankWit, su un database Supabase in UE;
- «Invia» dice «Inviato» solo quando il server ha confermato;
- chi conduce vede tutto nel pannello `admin.html`, con accesso protetto;
- il Lab del giorno (nome e domanda dell'esercizio 2) si crea nel pannello: `evento.js` resta come riserva.

## Come funziona

- **Le pagine** restano file statici (GitHub Pages). Il localStorage del PC resta la copia sicura: ogni modifica si salva lì, come prima.
- **L'invio** lo fa `assets/sync.js`: 2 secondi dopo l'ultima modifica (al massimo ogni 6 secondi mentre si scrive) manda al server le righe nuove o cambiate. Se la rete cade riprova da solo dopo 2, 4, 8 secondi, poi ogni 15, e subito quando il PC si ricollega. Se il server non risponde entro 10 secondi, la pagina lo dice. Niente si perde: finché il server non conferma, le righe restano in coda sul PC, anche se si chiude la pagina.
- **Il PC si riconosce** con un id e un segreto casuali, creati la prima volta. Può inserire e aggiornare solo le righe che ha creato lui. Dal browser nessuno legge i dati degli altri: le tabelle non sono raggiungibili, si passa solo da due funzioni del database (`lab_event` e `lab_sync`).
- **Il pannello** legge con le funzioni `lab_admin_*`, solo per chi ha fatto l'accesso ed è scritto nella tabella `lab.staff`.

Tutto il database è in `supabase/migrations/20261029190000_lab_fase2.sql`.

### Cosa vede il partecipante di nuovo

Solo tre messaggi, quando serve:

| Quando | Cosa compare |
|---|---|
| Dopo «Invia», in attesa del server | «Invio in corso…» |
| Il server non risponde | «Non riesco a inviare: la rete non risponde. Riprovo da solo, lascia aperta la pagina.» Quando l'invio riesce: «Inviato.» |
| La rete manca da un po' | in alto, «Salvato alle 10:42, in attesa di rete» |

Senza `server.js` compilato le pagine funzionano come nella Fase 1.

## Il pannello (`admin.html`)

- **Eventi:** codice, nome, data, luogo, domanda dell'esercizio 2, motori, posti, stato (bozza, aperto, chiuso).
- **L'evento in corso:** i link senza codice (`…/esercizio-2.html`) aprono l'evento aperto con la data di oggi o, se non c'è, il più recente. Un evento diverso si apre con `index.html?evento=codice`. Meglio tenere aperto un evento alla volta.
- **Avanzamento** dal vivo, aggiornato ogni 10 secondi; **Risultati** per motore; **Export** CSV (punto e virgola, UTF-8 con BOM, apostrofo davanti alle celle che iniziano con `=` `+` `-` `@`, ora di apertura e di incolla).
- **Ruoli:** «team» vede tutto, anche i nomi (servono in sala), e scarica i file anonimi: nomi delle strutture e comuni diventano [struttura] e [comune]. «dati» scarica anche i file con i dati identificabili e cancella i dati di una struttura su richiesta (Avanzamento, «Mostra struttura e comune», «Cancella»). Chi vede i nomi a schermo li può copiare: il blocco vale per i file.

### Dare l'accesso a una persona del team

Due passi, nella dashboard di Supabase:

1. **Authentication → Users → Invite user**, con la sua email. Riceve un link: apre il pannello e sceglie la password.
2. **SQL Editor**, una riga:

```sql
insert into lab.staff (email, role) values ('nome@rankwit.ai', 'team');  -- oppure 'dati'
```

Per togliere l'accesso: `delete from lab.staff where email = 'nome@rankwit.ai';` (e, se si vuole, cancellare l'utente in Authentication).

## Privacy

- Si raccolgono solo nome della struttura o della destinazione e comune, più quello che il partecipante scrive o incolla. I testi incollati possono contenere nomi.
- **Conservazione:** 12 mesi dalla data del Lab, poi il database cancella tutto da solo (ogni notte alle 3:15, `lab.purge`).
- **Cancellazione su richiesta:** dal pannello, ruolo «dati». Se il PC di quel partecipante manda ancora qualcosa, il server lo rifiuta.
- L'informativa si firma su carta all'ingresso: nel portale nessuna casella.

## Il server online

Il progetto Supabase è «AI Visibility Labs» (`fvmehezybvpehkxnzphc`), in UE, piano gratuito. Lo schema è caricato e `server.js` ha già indirizzo e chiave pubblica. Da `localhost` le pagine usano invece la prova in locale.

Per rifarlo da zero:

1. Su supabase.com, con un account RankWit del team (non personale), crea un progetto in una regione UE. Piano gratuito.
2. **SQL Editor:** incolla e lancia tutto `supabase/migrations/20261029190000_lab_fase2.sql`.
3. **Authentication → Sign In / Providers:** Email attivo, «Allow new users to sign up» spento.
4. **Authentication → URL Configuration:** Site URL e Redirect URLs con l'indirizzo di `admin.html` (per esempio `https://gherybeans-rankwit.github.io/esercizi-visibility-lab/admin.html`).
5. **Project Settings → API Keys:** copia l'URL del progetto e la chiave «publishable» (o «anon») in `server.js`. È pubblica per costruzione: i dati li proteggono le regole del database. La chiave «secret» o «service_role» non va mai nel sito.
6. Invita il team (sopra).

**Piano gratuito:** se nessuno usa il progetto per una settimana, Supabase lo mette in pausa. Prima di ogni Lab apri la dashboard: se è in pausa, «Restore project» e aspetta qualche minuto. Il piano gratuito non ha backup automatici: dopo il Lab scarica gli export.

## Prima di ogni Lab

1. Controlla che il progetto Supabase sia attivo (sopra).
2. Nel pannello crea l'evento, con la domanda dell'esercizio 2, e mettilo su «aperto». Chiudi quello vecchio.
3. Apri `index.html` da un PC e controlla che compaia il nome giusto.

`evento.js` serve solo se il server non risponde: tienilo con il nome generico del Lab. Se un PC parte con `evento.js`, le sue risposte arrivano lo stesso: il pannello mostra quell'evento con la nota «Creato da un PC con evento.js».

## Online

Il sito dei partecipanti di oggi è la Fase 1: **https://gherybeans-rankwit.github.io/esercizi-visibility-lab/** (repository `gherybeans-rankwit/esercizi-visibility-lab`, cartella `lab-portale (4)`). Questa cartella ha un suo git, senza collegamento al sito: si pubblica solo dopo le prove.

La Fase 2 di prova è su **https://gherybeans-rankwit.github.io/esercizi-visibility-lab-prova/** (repository `gherybeans-rankwit/esercizi-visibility-lab-prova`). Usa lo stesso server online: non va data ai partecipanti.

## Provare in locale

Serve Docker (qui colima) e la CLI di Supabase.

```bash
colima start
```

```bash
cd "lab-portale (5)" && supabase start -x studio,postgres-meta,supavisor,imgproxy,vector,logflare,realtime,storage-api,edge-runtime
```

```bash
cd "lab-portale (5)" && node prove/utenti-locali.mjs
```

```bash
cd "lab-portale (5)" && node prove/rete.mjs
```

Poi `python3 -m http.server 8774 --directory "lab-portale (5)"` (voce `lab-portale-5` in `.claude/launch.json`) e `http://localhost:8774`. `server.js` punta alla rete finta (`prove/rete.mjs`, porta 54399), che si può staccare: `curl 127.0.0.1:54398/giu`, `/muta`, `/persa`, `/caso?p=0.3`, `/su`. Gli utenti di prova del pannello e le loro password sono in `prove/.locale.json`, fuori dal repository.

### Prova di carico

```bash
cd "lab-portale (5)" && node prove/carico.mjs 60 4 locale
```

60 PC finti fanno i quattro esercizi in 4 minuti con il codice vero delle pagine, mentre la rete cade a caso, si stacca, resta muta e perde le risposte. Alla fine confronta riga per riga quello che ogni PC ha salvato con quello che c'è sul server. Il riepilogo va in `prove/risultati/`.

Contro il server online serve un evento aperto e una rete finta davanti al progetto:

```bash
cd "lab-portale (5)" && node prove/rete.mjs https://fvmehezybvpehkxnzphc.supabase.co 54499 54498
```

```bash
cd "lab-portale (5)" && node prove/carico.mjs 60 4 online
```

Legge `prove/.online.json` (sullo stampo di `prove/online.esempio.json`), che resta su questo Mac.

## File

- `evento.js`: il Lab di riserva, se il server non risponde
- `server.js`: indirizzo e chiave pubblica del server
- `index.html`, `esercizio-1.html` … `esercizio-4.html`: le pagine dei partecipanti
- `admin.html`: il pannello RankWit
- `assets/app.js`, `assets/store.js`, `assets/data.js`: il funzionamento; `assets/sync.js`: l'invio al server
- `assets/vendor/supabase-2.117.3.js`: libreria per l'accesso al pannello (MIT)
- `assets/app.css`, `assets/marks.js`, `assets/brand/`, `assets/fonts/`: stile, marchi dei motori, logo, font
- `supabase/`: database (schema, regole, funzioni, conservazione) e configurazione per la prova in locale
- `prove/`: rete finta, utenti di prova, prova di carico
