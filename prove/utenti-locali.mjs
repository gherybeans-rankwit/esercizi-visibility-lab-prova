// Solo per Supabase in locale: crea due utenti di prova del pannello (ruolo
// «team» e ruolo «dati») con password casuali e le scrive in prove/.locale.json,
// che non va nel repository.
//   node prove/utenti-locali.mjs
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const env = Object.fromEntries(execSync('supabase status -o env', { encoding: 'utf8' })
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const users = [
  { email: 'prova-team@rankwit.test', role: 'team' },
  { email: 'prova-dati@rankwit.test', role: 'dati' }
];
for (const u of users) {
  u.password = randomBytes(12).toString('base64url');
  const h = { apikey: env.SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
  const list = await (await fetch(env.API_URL + '/auth/v1/admin/users?per_page=200', { headers: h })).json();
  const old = (list.users || []).find(x => x.email === u.email);
  if (old) await fetch(env.API_URL + '/auth/v1/admin/users/' + old.id, { method: 'DELETE', headers: h });
  const res = await fetch(env.API_URL + '/auth/v1/admin/users', { method: 'POST', headers: h, body: JSON.stringify({ email: u.email, password: u.password, email_confirm: true }) });
  if (!res.ok) throw new Error(u.email + ': ' + res.status + ' ' + await res.text());
  execSync(`psql "${env.DB_URL}" -qc "insert into lab.staff (email, role) values ('${u.email}', '${u.role}') on conflict (email) do update set role = excluded.role"`);
}
writeFileSync(new URL('./.locale.json', import.meta.url), JSON.stringify({ api: env.API_URL, key: env.PUBLISHABLE_KEY, db: env.DB_URL, users }, null, 2));
console.log('Creati ' + users.map(u => u.email + ' (' + u.role + ')').join(', ') + '. Password in prove/.locale.json.');
