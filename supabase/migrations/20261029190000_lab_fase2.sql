-- Portale del Lab, Fase 2: le risposte dei partecipanti arrivano a RankWit.
--
-- Le tabelle stanno nello schema «lab», che l'API non espone: dal browser si
-- passa solo dalle funzioni in «public».
--   lab_event        (tutti)     l'evento in corso o quello di un codice, senza dati dei partecipanti
--   lab_sync         (tutti)     un PC manda le proprie righe; id e segreto del PC
--   lab_admin_*      (team)      pannello RankWit, dopo l'accesso
-- Ogni PC può inserire e aggiornare solo le righe che ha creato lui. Nessuno,
-- dal browser, legge le righe degli altri.

create schema if not exists lab;
revoke all on schema lab from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabelle: gli stessi campi di assets/store.js, più device_id (il PC che ha
-- scritto la riga), rev (versione del PC: vince la più recente) e received_at
-- (quando è arrivata, per gli aggiornamenti del pannello).
-- ---------------------------------------------------------------------------

create table lab.devices (
  id uuid primary key,
  secret_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table lab.staff (
  email text primary key check (email = lower(email)),
  role text not null default 'team' check (role in ('team', 'dati')),
  created_at timestamptz not null default now()
);

create table lab.events (
  id text primary key,
  code text not null unique check (code ~ '^[a-z0-9-]{2,30}$'),
  name text not null default '',
  date date,
  place text default '',
  territory_label text default '',
  status text not null default 'bozza' check (status in ('bozza', 'aperto', 'chiuso')),
  capacity int default 50,
  models jsonb default '["chatgpt", "aimode", "gemini"]',
  consent_version text default '1.0',
  territory_question_id text,
  created_at timestamptz default now(),
  -- «pannello»: creato dal team; «pc»: creato da un PC con evento.js quando il server non rispondeva.
  source text not null default 'pannello' check (source in ('pannello', 'pc')),
  updated_at timestamptz not null default now(),
  received_at timestamptz not null default clock_timestamp()
);

create table lab.exercises (
  id text primary key,
  position int not null,
  title text not null
);
insert into lab.exercises (id, position, title) values
  ('faq', 1, 'Le domande di ospiti e visitatori'),
  ('territorio', 2, 'Cosa dice l’AI del territorio'),
  ('hotel', 3, 'Cosa sa l’AI di te'),
  ('posizionamento', 4, 'A chi ti consiglia l’AI');

create table lab.properties (
  id text primary key,
  event_id text,
  name text check (length(name) <= 500),
  comune text check (length(comune) <= 500),
  type text,
  website text,
  created_at timestamptz,
  device_id uuid not null,
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

create table lab.participants (
  id text primary key,
  event_id text,
  property_id text,
  created_at timestamptz,
  last_seen_at timestamptz,
  current_step text,
  progress jsonb,
  device_id uuid not null,
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

create table lab.consent_records (
  id text primary key,
  event_id text,
  participant_id text,
  version text,
  created_at timestamptz,
  device_id uuid not null,
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

create table lab.questions (
  id text primary key,
  event_id text,
  exercise_id text,
  participant_id text,
  key text,
  text text check (length(text) <= 5000),
  source text,
  position int,
  created_at timestamptz,
  device_id uuid,               -- vuoto per le domande scritte dal team
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

create table lab.submissions (
  id text primary key,
  participant_id text,
  event_id text,
  exercise_id text,
  question_id text,
  field text,
  value text check (length(value) <= 100000),
  updated_at timestamptz,
  device_id uuid not null,
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

create table lab.model_runs (
  id text primary key,
  event_id text,
  participant_id text,
  exercise_id text,
  question_id text,
  provider text,
  engine text,
  channel text,
  prompt text check (length(prompt) <= 10000),
  params text,
  opened_at timestamptz,
  last_opened_at timestamptz,
  opens int,
  pasted_at timestamptz,
  status text,
  created_at timestamptz,
  device_id uuid not null,
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

create table lab.model_responses (
  id text primary key,
  run_id text,
  event_id text,                -- dalla riga di model_runs
  participant_id text,          -- dalla riga di model_runs
  text text check (length(text) <= 100000),
  created_at timestamptz,
  updated_at timestamptz,
  device_id uuid not null,
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

create table lab.evaluations (
  id text primary key,
  participant_id text,
  event_id text,
  exercise_id text,
  run_id text,
  question_id text,
  rating text,
  note text check (length(note) <= 20000),
  updated_at timestamptz,
  device_id uuid not null,
  rev bigint not null default 0,
  received_at timestamptz not null default clock_timestamp()
);

-- Righe cancellate (dal PC o dal team): servono al pannello per toglierle.
create table lab.tombstones (
  tbl text not null,
  id text not null,
  event_id text,
  deleted_at timestamptz not null default clock_timestamp(),
  primary key (tbl, id)
);

-- Partecipanti cancellati su richiesta: se il loro PC manda ancora qualcosa, si rifiuta.
create table lab.erased (
  id text primary key,
  erased_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['properties', 'participants', 'consent_records', 'questions', 'submissions', 'model_runs', 'model_responses', 'evaluations'] loop
    execute format('create index on lab.%I (event_id, received_at)', t);
  end loop;
  foreach t in array array['consent_records', 'questions', 'submissions', 'model_runs', 'model_responses', 'evaluations'] loop
    execute format('create index on lab.%I (participant_id)', t);
  end loop;
  -- Nessun accesso diretto: RLS attiva e nessuna regola per anon e authenticated.
  foreach t in array array['devices', 'staff', 'events', 'exercises', 'properties', 'participants', 'consent_records', 'questions', 'submissions', 'model_runs', 'model_responses', 'evaluations', 'tombstones', 'erased'] loop
    execute format('alter table lab.%I enable row level security', t);
    execute format('revoke all on lab.%I from public, anon, authenticated', t);
  end loop;
end $$;
create index on lab.tombstones (event_id, deleted_at);
create index on lab.questions (event_id, exercise_id);
create index on lab.model_runs (question_id);

-- ---------------------------------------------------------------------------
-- Funzioni interne
-- ---------------------------------------------------------------------------

-- L'evento «in corso» per i link senza codice: aperto, creato dal team, oggi o il più recente.
create or replace function lab.current_event_id() returns text
language sql stable set search_path = '' as $$
  select e.id from lab.events e
  where e.status = 'aperto' and e.source = 'pannello'
  order by (e.date = (now() at time zone 'Europe/Rome')::date) desc, e.date desc nulls last, e.created_at desc
  limit 1
$$;

create or replace function lab.event_json(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'event', to_jsonb(e) - 'source' - 'updated_at' - 'received_at',
    'questions', coalesce((
      select jsonb_agg(to_jsonb(q) - 'device_id' - 'rev' - 'received_at' order by q.position)
      from lab.questions q where q.event_id = e.id and q.participant_id is null and q.source = 'evento'), '[]'::jsonb))
  from lab.events e where e.id = p_id
$$;

create or replace function lab.columns(p_table text) returns text[]
language sql stable set search_path = '' as $$
  select array_agg(a.attname::text order by a.attnum)
  from pg_catalog.pg_attribute a
  where a.attrelid = ('lab.' || quote_ident(p_table))::regclass and a.attnum > 0 and not a.attisdropped
$$;

-- Inserisce o aggiorna una riga di un PC. Una riga che c'è già e non è sua si rifiuta;
-- una versione più vecchia di quella salvata si ignora.
create or replace function lab.put_row(p_table text, p_row jsonb, p_device uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_found boolean;
  v_owner uuid;
  v_set text;
begin
  execute format('select true, device_id from lab.%I where id = $1', p_table) into v_found, v_owner using p_row->>'id';
  if v_found and v_owner is distinct from p_device then
    raise exception 'riga di un altro PC';
  end if;
  select string_agg(format('%1$I = excluded.%1$I', c), ', ') into v_set
  from unnest(lab.columns(p_table)) c where c <> 'id';
  execute format(
    'insert into lab.%1$I select * from jsonb_populate_record(null::lab.%1$I, $1) '
    'on conflict (id) do update set %2$s where lab.%1$I.rev <= excluded.rev',
    p_table, v_set) using p_row;
end $$;

create or replace function lab.owns(p_device uuid, p_pid text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from lab.participants p where p.id = p_pid and p.device_id = p_device)
     and not exists (select 1 from lab.erased x where x.id = p_pid)
$$;

-- Il ruolo di chi chiama: dalla tabella lab.staff, oppure «dati» per la chiave
-- segreta del progetto (solo script lanciati dal team, mai nel sito).
create or replace function lab.role() returns text
language sql stable security definer set search_path = '' as $$
  select case when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then 'dati'
    else (select s.role from lab.staff s where s.email = lower(coalesce(auth.jwt() ->> 'email', ''))) end
$$;

create or replace function lab.require_role(p_role text default 'team') returns text
language plpgsql stable set search_path = '' as $$
declare v text := lab.role();
begin
  if v is null or (p_role = 'dati' and v <> 'dati') then
    raise exception 'accesso negato' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Partecipanti (senza login)
-- ---------------------------------------------------------------------------

-- L'evento da mostrare: quello del codice, o quello in corso se il codice è vuoto.
create or replace function public.lab_event(p_code text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select lab.event_json(coalesce(
    (select e.id from lab.events e where e.code = lower(trim(p_code)) and coalesce(trim(p_code), '') <> ''),
    case when coalesce(trim(p_code), '') = '' then lab.current_event_id() end))
$$;

-- Un PC manda le righe nuove o cambiate e quelle cancellate. Risponde con le righe
-- rifiutate: tutte le altre sono salvate.
create or replace function public.lab_sync(p_device uuid, p_secret text, p_rev bigint, p_rows jsonb, p_deleted jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order constant text[] := array['events', 'properties', 'participants', 'consent_records', 'questions', 'model_runs', 'model_responses', 'submissions', 'evaluations'];
  v_hash text;
  v_stored text;
  r jsonb;
  v_t text;
  v_id text;
  v_row jsonb;
  v_run record;
  v_ok int := 0;
  v_rejected jsonb := '[]'::jsonb;
  v_now timestamptz;
begin
  if p_device is null or p_secret is null or length(p_secret) < 32 or length(p_secret) > 200 then
    raise exception 'PC non riconosciuto' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500
     or jsonb_typeof(p_deleted) <> 'array' or jsonb_array_length(p_deleted) > 500 then
    raise exception 'invio non valido' using errcode = '22023';
  end if;

  v_hash := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  insert into lab.devices (id, secret_hash) values (p_device, v_hash) on conflict (id) do nothing;
  select d.secret_hash into v_stored from lab.devices d where d.id = p_device for update;
  if v_stored <> v_hash then
    raise exception 'PC non riconosciuto' using errcode = '28000';
  end if;
  update lab.devices set last_seen_at = now() where id = p_device;

  for r in
    select e.value from jsonb_array_elements(p_rows) e
    order by coalesce(array_position(v_order, e.value->>'t'), 99)
  loop
    v_t := r->>'t';
    v_id := r->>'id';
    begin
      if v_id is null or length(v_id) > 64 or jsonb_typeof(r->'row') <> 'object' or r->'row'->>'id' is distinct from v_id then
        raise exception 'riga senza id';
      end if;
      v_now := clock_timestamp();
      v_row := (r->'row') || jsonb_build_object('device_id', p_device, 'rev', p_rev, 'received_at', v_now);
      case v_t
        when 'events' then
          -- Un PC non cambia mai un evento: lo crea solo se il server non lo conosce.
          insert into lab.events (id, code, name, date, place, territory_label, status, capacity, models, consent_version, territory_question_id, created_at, source, received_at)
          select x.id, x.code, coalesce(x.name, ''), x.date, x.place, x.territory_label, 'aperto', coalesce(x.capacity, 50),
                 coalesce(x.models, '["chatgpt", "aimode", "gemini"]'::jsonb), coalesce(x.consent_version, '1.0'), x.territory_question_id, x.created_at, 'pc', v_now
          from jsonb_populate_record(null::lab.events, r->'row') x
          on conflict do nothing;
        when 'questions' then
          if v_row->>'participant_id' is null then
            -- Domanda dell'evento (da evento.js): solo se manca, senza proprietario.
            if v_row->>'source' <> 'evento' then raise exception 'domanda senza partecipante'; end if;
            insert into lab.questions select * from jsonb_populate_record(null::lab.questions, v_row - 'device_id' || '{"device_id": null}'::jsonb)
            on conflict do nothing;
          else
            if not lab.owns(p_device, v_row->>'participant_id') then raise exception 'partecipante di un altro PC'; end if;
            perform lab.put_row('questions', v_row, p_device);
          end if;
        when 'properties' then
          perform lab.put_row('properties', v_row, p_device);
        when 'participants' then
          if exists (select 1 from lab.erased x where x.id = v_id) then raise exception 'partecipante cancellato'; end if;
          perform lab.put_row('participants', v_row, p_device);
        when 'model_responses' then
          select m.participant_id, m.event_id into v_run from lab.model_runs m where m.id = v_row->>'run_id' and m.device_id = p_device;
          if v_run.participant_id is null or not lab.owns(p_device, v_run.participant_id) then raise exception 'apertura di un altro PC'; end if;
          -- Una sola risposta incollata per apertura: la più recente sostituisce le altre.
          -- Se ne esiste già una più recente, questa è vecchia (arrivata in ritardo) e si ignora.
          if not exists (select 1 from lab.model_responses x where x.run_id = v_row->>'run_id' and x.id <> v_id and x.rev > p_rev) then
            perform lab.put_row('model_responses', v_row || jsonb_build_object('participant_id', v_run.participant_id, 'event_id', v_run.event_id), p_device);
            with d as (delete from lab.model_responses x where x.run_id = v_row->>'run_id' and x.id <> v_id and x.device_id = p_device returning x.id, x.event_id)
            insert into lab.tombstones (tbl, id, event_id) select 'model_responses', d.id, d.event_id from d
            on conflict (tbl, id) do update set deleted_at = clock_timestamp();
          end if;
        when 'consent_records', 'model_runs', 'submissions', 'evaluations' then
          if not lab.owns(p_device, v_row->>'participant_id') then raise exception 'partecipante di un altro PC'; end if;
          perform lab.put_row(v_t, v_row, p_device);
        else
          raise exception 'tabella sconosciuta';
      end case;
      v_ok := v_ok + 1;
    exception when others then
      v_rejected := v_rejected || jsonb_build_object('t', v_t, 'id', v_id, 'err', sqlerrm);
    end;
  end loop;

  -- Cancellazioni: solo righe di questo PC (per esempio una risposta incollata e poi svuotata).
  for r in select e.value from jsonb_array_elements(p_deleted) e loop
    v_t := r->>'t';
    v_id := r->>'id';
    begin
      if v_t not in ('consent_records', 'questions', 'submissions', 'model_runs', 'model_responses', 'evaluations') then
        raise exception 'non si cancella';
      end if;
      execute format('with d as (delete from lab.%I where id = $1 and device_id = $2 returning id, event_id) '
                     'insert into lab.tombstones (tbl, id, event_id) select $3, id, event_id from d '
                     'on conflict (tbl, id) do update set deleted_at = clock_timestamp()', v_t)
        using v_id, p_device, v_t;
      v_ok := v_ok + 1;
    exception when others then
      v_rejected := v_rejected || jsonb_build_object('t', v_t, 'id', v_id, 'err', sqlerrm, 'del', true);
    end;
  end loop;

  return jsonb_build_object('ok', v_ok, 'rejected', v_rejected, 'at', now());
end $$;

-- ---------------------------------------------------------------------------
-- Pannello RankWit (solo chi è in lab.staff)
-- ---------------------------------------------------------------------------

create or replace function public.lab_admin_me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when lab.role() is null then null
    else jsonb_build_object('email', lower(auth.jwt() ->> 'email'), 'role', lab.role()) end
$$;

create or replace function public.lab_admin_events() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_cur text;
begin
  perform lab.require_role();
  v_cur := lab.current_event_id();
  return coalesce((
    select jsonb_agg(to_jsonb(e) - 'received_at' || jsonb_build_object(
      'in_corso', e.id = v_cur,
      'n_participants', (select count(*) from lab.participants p where p.event_id = e.id),
      'n_done', (select count(*) from lab.participants p where p.event_id = e.id
                   and coalesce((p.progress->>'faq')::boolean, false) and coalesce((p.progress->>'territorio')::boolean, false)
                   and coalesce((p.progress->>'hotel')::boolean, false) and coalesce((p.progress->>'posizionamento')::boolean, false)))
      order by e.date desc nulls last, e.created_at desc)
    from lab.events e), '[]'::jsonb);
end $$;

-- Tutte le righe di un evento, o solo quelle arrivate dopo p_since, più le cancellate.
create or replace function public.lab_admin_event(p_event text, p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
  v_rows jsonb;
  v_tables jsonb := '{}'::jsonb;
  v_now timestamptz := clock_timestamp();
begin
  perform lab.require_role();
  if not exists (select 1 from lab.events e where e.id = p_event) then
    return jsonb_build_object('now', v_now, 'event', null);
  end if;
  foreach t in array array['properties', 'participants', 'consent_records', 'questions', 'model_runs', 'model_responses', 'submissions', 'evaluations'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''device_id'' - ''rev''), ''[]''::jsonb) from lab.%I x '
                   'where x.event_id = $1 and ($2::timestamptz is null or x.received_at > $2)', t)
      into v_rows using p_event, p_since;
    v_tables := v_tables || jsonb_build_object(t, v_rows);
  end loop;
  return jsonb_build_object(
    'now', v_now,
    'event', (select to_jsonb(e) from lab.events e where e.id = p_event),
    'in_corso', p_event = lab.current_event_id(),
    'tables', v_tables,
    'deleted', coalesce((select jsonb_agg(jsonb_build_object('t', d.tbl, 'id', d.id)) from lab.tombstones d
                         where d.event_id = p_event and (p_since is null or d.deleted_at > p_since)), '[]'::jsonb));
end $$;

-- Crea un evento (senza id) o ne cambia i campi presenti (con id). Il codice non cambia.
create or replace function public.lab_admin_save_event(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := p->>'id';
  v_code text := lower(trim(coalesce(p->>'code', '')));
  v_qid text;
  v_text text;
  i int := 0;
begin
  perform lab.require_role();
  if p ? 'status' and p->>'status' not in ('bozza', 'aperto', 'chiuso') then raise exception 'stato non valido'; end if;
  if v_id is null then
    if v_code !~ '^[a-z0-9-]{3,30}$' then raise exception 'codice non valido'; end if;
    if exists (select 1 from lab.events e where e.code = v_code) then raise exception 'codice già usato'; end if;
    v_id := 'E-' || v_code;
    insert into lab.events (id, code, name, date, place, territory_label, status, capacity, models, consent_version, created_at, source)
    values (v_id, v_code, coalesce(p->>'name', ''), nullif(p->>'date', '')::date, coalesce(p->>'place', ''),
            coalesce(nullif(p->>'territory_label', ''), p->>'place', ''), coalesce(p->>'status', 'bozza'),
            coalesce((p->>'capacity')::int, 50), coalesce(p->'models', '["chatgpt", "aimode", "gemini"]'::jsonb),
            coalesce(p->>'consent_version', '1.0'), now(), 'pannello');
    for v_text in select jsonb_array_elements_text(coalesce(p->'prompts', '[]'::jsonb)) loop
      if trim(v_text) = '' then continue; end if;
      v_qid := 'Q-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      insert into lab.questions (id, event_id, exercise_id, participant_id, key, text, source, position, created_at)
      values (v_qid, v_id, 'territorio', null, null, trim(v_text), 'evento', i, now());
      if i = 0 then update lab.events set territory_question_id = v_qid where id = v_id; end if;
      i := i + 1;
    end loop;
  else
    if p ? 'territory_question_id' and not exists (
      select 1 from lab.questions q where q.id = p->>'territory_question_id' and q.event_id = v_id and q.participant_id is null) then
      raise exception 'domanda di un altro evento';
    end if;
    update lab.events e set
      name = case when p ? 'name' then coalesce(p->>'name', '') else e.name end,
      date = case when p ? 'date' then nullif(p->>'date', '')::date else e.date end,
      place = case when p ? 'place' then p->>'place' else e.place end,
      territory_label = case when p ? 'territory_label' then p->>'territory_label' else e.territory_label end,
      status = case when p ? 'status' then p->>'status' else e.status end,
      capacity = case when p ? 'capacity' then (p->>'capacity')::int else e.capacity end,
      models = case when p ? 'models' then p->'models' else e.models end,
      consent_version = case when p ? 'consent_version' then p->>'consent_version' else e.consent_version end,
      territory_question_id = case when p ? 'territory_question_id' then p->>'territory_question_id' else e.territory_question_id end,
      source = 'pannello',
      updated_at = now(),
      received_at = clock_timestamp()
    where e.id = v_id;
    if not found then raise exception 'evento inesistente'; end if;
  end if;
  return lab.event_json(v_id);
end $$;

-- Domande del territorio (esercizio 2): una nuova, o il testo di una che nessuno ha ancora aperto.
create or replace function public.lab_admin_save_question(p_event text, p_id text, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qid text := p_id;
begin
  perform lab.require_role();
  if coalesce(trim(p_text), '') = '' then raise exception 'domanda vuota'; end if;
  if v_qid is null then
    v_qid := 'Q-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into lab.questions (id, event_id, exercise_id, participant_id, key, text, source, position, created_at)
    values (v_qid, p_event, 'territorio', null, null, trim(p_text), 'evento',
            (select count(*) from lab.questions q where q.event_id = p_event and q.exercise_id = 'territorio' and q.participant_id is null), now());
    update lab.events set territory_question_id = coalesce(territory_question_id, v_qid), received_at = clock_timestamp() where id = p_event;
  else
    if exists (select 1 from lab.model_runs m where m.question_id = v_qid and m.opened_at is not null) then
      raise exception 'domanda già aperta nei motori';
    end if;
    update lab.questions set text = trim(p_text), received_at = clock_timestamp()
    where id = v_qid and event_id = p_event and participant_id is null;
    if not found then raise exception 'domanda inesistente'; end if;
  end if;
  return lab.event_json(p_event);
end $$;

-- Cancellazione su richiesta: tutto quello che riguarda un partecipante (solo ruolo «dati»).
create or replace function public.lab_admin_delete_participant(p_pid text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ev text;
  v_prop text;
  t text;
  n int := 0;
  k int;
begin
  perform lab.require_role('dati');
  select p.event_id, p.property_id into v_ev, v_prop from lab.participants p where p.id = p_pid;
  if v_ev is null then raise exception 'partecipante inesistente'; end if;
  insert into lab.erased (id) values (p_pid) on conflict do nothing;
  foreach t in array array['model_responses', 'evaluations', 'submissions', 'model_runs', 'questions', 'consent_records'] loop
    execute format('with d as (delete from lab.%I where participant_id = $1 returning id, event_id) '
                   'insert into lab.tombstones (tbl, id, event_id) select $2, id, event_id from d '
                   'on conflict (tbl, id) do update set deleted_at = clock_timestamp()', t) using p_pid, t;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  with d as (delete from lab.participants where id = p_pid returning id, event_id)
  insert into lab.tombstones (tbl, id, event_id) select 'participants', id, event_id from d
  on conflict (tbl, id) do update set deleted_at = clock_timestamp();
  if not exists (select 1 from lab.participants p where p.property_id = v_prop) then
    with d as (delete from lab.properties where id = v_prop returning id, event_id)
    insert into lab.tombstones (tbl, id, event_id) select 'properties', id, event_id from d
    on conflict (tbl, id) do update set deleted_at = clock_timestamp();
  end if;
  return jsonb_build_object('participant', p_pid, 'rows', n + 1);
end $$;

-- ---------------------------------------------------------------------------
-- Conservazione: 12 mesi dalla data del Lab, poi si cancella tutto.
-- ---------------------------------------------------------------------------

create or replace function lab.purge(p_months int default 12) returns int
language plpgsql set search_path = '' as $$
declare
  v_ids text[];
  t text;
begin
  select coalesce(array_agg(e.id), '{}') into v_ids from lab.events e
  where coalesce(e.date, e.created_at::date) < (now() at time zone 'Europe/Rome')::date - make_interval(months => p_months);
  foreach t in array array['model_responses', 'evaluations', 'submissions', 'model_runs', 'questions', 'consent_records', 'participants', 'properties', 'tombstones'] loop
    execute format('delete from lab.%I where event_id = any($1)', t) using v_ids;
  end loop;
  delete from lab.events where id = any(v_ids);
  delete from lab.devices d where d.last_seen_at < now() - make_interval(months => p_months);
  return coalesce(array_length(v_ids, 1), 0);
end $$;

create extension if not exists pg_cron;
select cron.schedule('lab-conservazione-12-mesi', '15 3 * * *', 'select lab.purge(12)');

-- ---------------------------------------------------------------------------
-- Permessi: le funzioni pubbliche per tutti, quelle del pannello solo dopo l'accesso.
-- ---------------------------------------------------------------------------

revoke all on all functions in schema lab from public, anon, authenticated;
revoke all on function public.lab_event(text), public.lab_sync(uuid, text, bigint, jsonb, jsonb),
  public.lab_admin_me(), public.lab_admin_events(), public.lab_admin_event(text, timestamptz),
  public.lab_admin_save_event(jsonb), public.lab_admin_save_question(text, text, text),
  public.lab_admin_delete_participant(text) from public, anon, authenticated;
grant execute on function public.lab_event(text), public.lab_sync(uuid, text, bigint, jsonb, jsonb) to anon, authenticated;
grant execute on function public.lab_admin_me(), public.lab_admin_events(), public.lab_admin_event(text, timestamptz),
  public.lab_admin_save_event(jsonb), public.lab_admin_save_question(text, text, text),
  public.lab_admin_delete_participant(text) to authenticated;
