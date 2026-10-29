# Portale del Lab, versione da pubblicare

Il sito che i partecipanti aprono sul loro PC durante l'AI Visibility Lab (29 ottobre 2026). Quattro esercizi, ognuno su una pagina a sé, nessun login. Vale per hotel e per destinazioni (DMO): sulla prima pagina scrivono il nome della struttura o della destinazione e il proprio comune (non la zona), poi fanno gli esercizi.

Sono file statici: niente server, niente database, niente chiavi. Il pannello RankWit e i dati di esempio non ci sono: stanno nella versione di prova, `lab-portale (3)`.

## Online

**https://gherybeans-rankwit.github.io/esercizi-visibility-lab/**

Repository pubblico `gherybeans-rankwit/esercizi-visibility-lab` (account personale gherybeans-rankwit), pubblicato con GitHub Pages dal ramo `main`.

Per aggiornarlo, per esempio dopo aver cambiato `evento.js`, dalla cartella `lab-portale (4)`:

```bash
gh auth switch -h github.com -u gherybeans-rankwit && git commit -am "Lab di <zona>" && git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push
```

Il sito si aggiorna da solo in uno o due minuti.

## Prima di ogni Lab

Aprire `evento.js` e cambiare due righe:

```js
nome: 'AI Visibility Lab',
domanda_esercizio_2: 'Cosa vedere a {comune} e dintorni in un weekend, e dove dormire?'
```

- `nome` compare in alto in ogni pagina (per esempio «AI Visibility Lab · Siena»).
- `domanda_esercizio_2` è la domanda da copiare nei tre motori. `{comune}` diventa il comune che ogni partecipante ha scritto all'inizio. Per una domanda uguale per tutti, scrivere il territorio al posto di `{comune}`.

Se si cambia `evento.js` a Lab iniziato, il cambio arriva anche a chi ha già aperto il sito, alla pagina successiva che apre.

## Pubblicare

Caricare tutta la cartella così com'è (`index.html`, `esercizio-1.html` … `esercizio-4.html`, `evento.js`, `assets/`) su un hosting statico in HTTPS. Vanno bene, per esempio:

- Netlify Drop: trascinare la cartella su app.netlify.com/drop;
- Cloudflare Pages o GitHub Pages;
- una sottocartella del server di lab.rankwit.ai.

Funziona anche in una sottocartella (`lab.rankwit.ai/portale/`), perché tutti i percorsi sono relativi.

## I link da mostrare in sala

| Cosa | Indirizzo |
|---|---|
| Ingresso ed elenco degli esercizi | `<indirizzo>/` |
| Esercizio 1, FAQ con ChatGPT | `<indirizzo>/esercizio-1.html` |
| Esercizio 2, territorio | `<indirizzo>/esercizio-2.html` |
| Esercizio 3, struttura | `<indirizzo>/esercizio-3.html` |
| Esercizio 4, posizionamento | `<indirizzo>/esercizio-4.html` |

Ogni pagina si apre sempre e nessuna porta alla successiva: il ritmo lo dà chi conduce, mostrando il link dell'esercizio quando è il momento.

## Cosa fa il partecipante

1. Apre il link, scrive il nome della struttura o della destinazione e il proprio comune (non la zona) (una volta sola, poi restano fissi su quel PC).
2. **Esercizio 1:** scrive le domande che gli fanno ospiti e visitatori (le caselle partono vuote; ne bastano anche due) e le sue risposte, copia il testo pronto, lo incolla in ChatGPT, incolla qui la risposta di ChatGPT e scarica il documento FAQ (pagina HTML da mettere sul sito o mandare a chi lo gestisce).
3. **Esercizi 2 e 4:** copia la domanda in cima, la incolla in ChatGPT, Modalità AI di Google e Gemini, incolla la risposta di ogni motore nella sua casella e la valuta.
4. **Esercizio 3:** sempre aperto, non dipende dall'esercizio 1. In cima ci sono tre domande, vuote, con sotto la risposta del partecipante; le caselle vuote si riempiono con le domande che ha già scritto nell'esercizio 1. Si cambiano quando si vuole. Le scrive lui nei tre motori, incolla la risposta di ogni motore nella sua casella e la valuta.
5. **Esercizi 2, 3 e 4 si chiudono con «Invia».** Il pulsante controlla che per ogni motore ci siano la risposta incollata e la valutazione (un motore segnato «Non si apre» si salta) e, se manca qualcosa, lo elenca. Poi dice «Inviato. Aspetta le indicazioni in sala». Per ora «Invia» chiude l'esercizio sul PC: l'invio delle risposte a RankWit arriva con la Fase 2.

I motori si aprono in un'altra scheda, senza account. Ogni esercizio con i motori lo dice: non serve accedere né registrarsi, e per tornare al portale basta cliccare la sua scheda.

## Cosa sapere

- **Le risposte restano sul PC di ciascuno.** RankWit non raccoglie niente: per raccogliere le risposte serve un server (Fase 2).
- **Finestra in incognito:** il browser non salva; la pagina lo dice e invita a scaricare il documento alla fine.
- **I motori non si possono mostrare dentro il portale.** ChatGPT e Google lo vietano con `X-Frame-Options: SAMEORIGIN`, Gemini con `DENY`: per questo si aprono in un'altra scheda.

## Da provare prima del Lab

- Cinque o dieci portatili sul Wi-Fi della sala: ChatGPT e Google senza account potrebbero limitare le richieste o chiedere una verifica anti-robot.
- I banner dei cookie di ChatGPT e Google al primo accesso: un clic in più, da dire in sala.

## Provare in locale

```bash
python3 -m http.server 8773 --directory "lab-portale (4)"
```

Poi `http://localhost:8773`. In Claude Code c'è la voce `lab-portale-4` in `.claude/launch.json`.

## File

- `evento.js`: il Lab del giorno (da cambiare prima di ogni Lab)
- `index.html`, `esercizio-1.html` … `esercizio-4.html`: le pagine
- `assets/app.js`, `assets/store.js`, `assets/data.js`: il funzionamento (`app.js` contiene anche il codice del pannello, che qui non si usa)
- `assets/app.css`, `assets/marks.js`, `assets/brand/`, `assets/fonts/`: stile, marchi dei motori, logo, font
