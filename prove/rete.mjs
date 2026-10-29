// Rete finta tra le pagine e Supabase, per provare le cadute della rete in sala.
//   node prove/rete.mjs [destinazione] [porta] [porta di controllo]
//   destinazione predefinita http://127.0.0.1:54321, porta 54399, controllo 54398
// Si comanda dalla porta di controllo:
//   curl 127.0.0.1:54398/su          tutto passa
//   curl 127.0.0.1:54398/giu         connessione chiusa subito (Wi-Fi staccato)
//   curl 127.0.0.1:54398/muta        nessuna risposta (Wi-Fi agganciato ma senza internet)
//   curl 127.0.0.1:54398/persa       la richiesta arriva, la risposta si perde
//   curl '127.0.0.1:54398/caso?p=0.3' il 30% delle richieste cade, in uno dei tre modi
//   curl 127.0.0.1:54398/stato       modo e contatori
import http from 'node:http';
import https from 'node:https';

const target = new URL(process.argv[2] || 'http://127.0.0.1:54321');
const port = Number(process.argv[3] || 54399);
const ctlPort = Number(process.argv[4] || 54398);
const lib = target.protocol === 'https:' ? https : http;
let mode = 'su';
let p = 0;
const count = { passate: 0, giu: 0, muta: 0, persa: 0 };

function pick() {
  if (mode !== 'caso') return mode;
  if (Math.random() >= p) return 'su';
  return ['giu', 'muta', 'persa'][Math.floor(Math.random() * 3)];
}

http.createServer((req, res) => {
  // Le richieste preliminari del browser (CORS) passano sempre: si fanno cadere quelle vere.
  const m = req.method === 'OPTIONS' ? 'su' : pick();
  if (m === 'giu') { count.giu++; req.socket.destroy(); return; }
  if (m === 'muta') { count.muta++; setTimeout(() => req.socket.destroy(), 60000); return; }
  const headers = Object.assign({}, req.headers, { host: target.host });
  const up = lib.request({ protocol: target.protocol, hostname: target.hostname, port: target.port, path: (target.pathname.replace(/\/$/, '')) + req.url, method: req.method, headers }, upRes => {
    if (m === 'persa') { count.persa++; upRes.resume(); upRes.on('end', () => req.socket.destroy()); return; }
    count.passate++;
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res);
  });
  up.on('error', () => res.destroy());
  req.pipe(up);
}).listen(port, '127.0.0.1', () => console.log('rete finta su 127.0.0.1:' + port + ' verso ' + target.href + ', controllo su ' + ctlPort));

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cmd = u.pathname.slice(1);
  if (['su', 'giu', 'muta', 'persa', 'caso'].includes(cmd)) {
    mode = cmd;
    p = Number(u.searchParams.get('p') || 0.3);
    console.log(new Date().toISOString().slice(11, 19), 'rete:', mode, mode === 'caso' ? p : '');
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ mode, p, count }));
}).listen(ctlPort, '127.0.0.1');
