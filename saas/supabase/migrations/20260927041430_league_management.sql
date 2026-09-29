-- League identity, participation and official results. Existing receipts remain immutable.
alter table public.cna_seasons add column year integer not null default extract(year from now()), add column published boolean not null default false, add column data_mode text not null default 'matches' check(data_mode in ('matches','summary')), add column win_points integer not null default 3 check(win_points between 0 and 10), add column draw_points integer not null default 1 check(draw_points between 0 and 10);
create table public.cna_clubs(id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 80), abbreviation text not null check(length(abbreviation) between 1 and 6), created_at timestamptz not null default now());
create unique index cna_club_name on public.cna_clubs(lower(name));
create table public.cna_players(id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 2 and 80), ea_id text not null check(length(trim(ea_id)) between 2 and 80), position text not null default 'MED' check(position in ('POR','DEF','MED','DEL')), created_at timestamptz not null default now());
create unique index cna_player_ea on public.cna_players(lower(ea_id));
create table public.cna_slots(id uuid primary key default gen_random_uuid(), season_id uuid not null references public.cna_seasons(id), label text not null check(length(label) between 1 and 80), unique(season_id,label));
create table public.cna_stints(id uuid primary key default gen_random_uuid(), slot_id uuid not null references public.cna_slots(id), club_id uuid not null references public.cna_clubs(id), start_round integer not null check(start_round between 1 and 999), end_round integer check(end_round>=start_round and end_round<=999), reason text not null default '' check(length(reason)<=300), unique(slot_id,start_round));
create table public.cna_rosters(id uuid primary key default gen_random_uuid(), season_id uuid not null references public.cna_seasons(id), club_id uuid not null references public.cna_clubs(id), player_id uuid not null references public.cna_players(id), start_round integer not null check(start_round between 1 and 999), end_round integer check(end_round>=start_round and end_round<=999));
create table public.cna_reports(id uuid primary key default gen_random_uuid(), season_id uuid not null references public.cna_seasons(id), submission_id uuid references public.cna_submissions(id), status text not null default 'draft' check(status in ('draft','approved','rejected')), payload jsonb not null default '{}', ai_output jsonb, review_note text not null default '', created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(octet_length(payload::text)<=100000));
create table public.cna_matches(id uuid primary key default gen_random_uuid(), report_id uuid unique references public.cna_reports(id), season_id uuid not null references public.cna_seasons(id), phase text not null check(phase in ('regular','quarter','semi','final','other')), round integer not null check(round between 1 and 999), home_slot uuid not null references public.cna_slots(id), away_slot uuid not null references public.cna_slots(id), home_club uuid not null references public.cna_clubs(id), away_club uuid not null references public.cna_clubs(id), home_goals integer check(home_goals between 0 and 99), away_goals integer check(away_goals between 0 and 99), played_at date, status text not null check(status in ('scheduled','approved')), source text not null default '' check(length(source)<=500), check(home_slot<>away_slot and home_club<>away_club), check((status='scheduled' and home_goals is null and away_goals is null) or (status='approved' and home_goals is not null and away_goals is not null)), unique(season_id,phase,round,home_slot,away_slot));
create table public.cna_player_stats(match_id uuid not null references public.cna_matches(id), player_id uuid not null references public.cna_players(id), club_id uuid not null references public.cna_clubs(id), goals integer check(goals between 0 and 99), assists integer check(assists between 0 and 99), rating numeric check(rating between 0 and 10), clean_sheet boolean, saves integer check(saves between 0 and 999), conceded integer check(conceded between 0 and 99), primary key(match_id,player_id));
create table public.cna_club_summaries(id uuid primary key default gen_random_uuid(), season_id uuid not null references public.cna_seasons(id), slot_id uuid not null references public.cna_slots(id), club_id uuid not null references public.cna_clubs(id), wins integer not null check(wins between 0 and 999), draws integer not null check(draws between 0 and 999), losses integer not null check(losses between 0 and 999), gf integer not null check(gf between 0 and 9999), ga integer not null check(ga between 0 and 9999), source text not null check(length(source) between 1 and 500), unique(season_id,club_id));
create table public.cna_player_summaries(id uuid primary key default gen_random_uuid(), season_id uuid not null references public.cna_seasons(id), club_id uuid not null references public.cna_clubs(id), player_id uuid not null references public.cna_players(id), appearances integer check(appearances between 0 and 999), goals integer check(goals between 0 and 9999), assists integer check(assists between 0 and 9999), rating numeric check(rating between 0 and 10), clean_sheets integer check(clean_sheets between 0 and 999), saves integer check(saves between 0 and 99999), conceded integer check(conceded between 0 and 99999), source text not null check(length(source) between 1 and 500), unique(season_id,club_id,player_id));
create table public.cna_league_audit(id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id), action text not null, entity_id uuid, detail jsonb not null, created_at timestamptz not null default now());
create index cna_slots_season on public.cna_slots(season_id);
create index cna_stints_club on public.cna_stints(club_id);
create index cna_rosters_player on public.cna_rosters(player_id,season_id);
create index cna_matches_season on public.cna_matches(season_id,phase,round);
create index cna_reports_season on public.cna_reports(season_id,status);

-- No browser mutations: writes are validated by the admin RPC below.
do $$ declare t text; begin
 foreach t in array array['cna_clubs','cna_players','cna_slots','cna_stints','cna_rosters','cna_reports','cna_matches','cna_player_stats','cna_club_summaries','cna_player_summaries','cna_league_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy admin_read on public.%I for select to authenticated using ((select cna_private.is_admin()))',t);
 end loop;
end $$;
-- Public data exposed only via a curated read function. No private identity/contact/receipt fields.
create function public.cna_league_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; admin boolean := coalesce(cna_private.is_admin(),false); begin
 select jsonb_build_object(
 'seasons',(select coalesce(jsonb_agg(to_jsonb(x) order by x.year desc,x.created_at desc),'[]') from public.cna_seasons x where x.published or admin),
 'clubs',(select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]') from public.cna_clubs x where admin or exists(select 1 from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id join public.cna_seasons s on s.id=sl.season_id where st.club_id=x.id and s.published)),
 'players',(select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]') from public.cna_players x where admin or exists(select 1 from public.cna_rosters r join public.cna_seasons s on s.id=r.season_id where r.player_id=x.id and s.published)),
 'slots',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cna_slots x join public.cna_seasons s on s.id=x.season_id where s.published or admin),
 'stints',(select coalesce(jsonb_agg(to_jsonb(x) order by x.start_round),'[]') from public.cna_stints x join public.cna_slots sl on sl.id=x.slot_id join public.cna_seasons s on s.id=sl.season_id where s.published or admin),
 'rosters',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cna_rosters x join public.cna_seasons s on s.id=x.season_id where s.published or admin),
 'matches',(select coalesce(jsonb_agg(to_jsonb(x) order by x.round desc,x.played_at desc),'[]') from public.cna_matches x join public.cna_seasons s on s.id=x.season_id where s.published or admin),
 'stats',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cna_player_stats x join public.cna_matches m on m.id=x.match_id join public.cna_seasons s on s.id=m.season_id where s.published or admin),
 'club_summaries',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cna_club_summaries x join public.cna_seasons s on s.id=x.season_id where s.published or admin),
 'player_summaries',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.cna_player_summaries x join public.cna_seasons s on s.id=x.season_id where s.published or admin),
 'reports',(select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') from public.cna_reports x where admin),
 'admin',admin
 ) into result; return result;
end $$;
revoke all on function public.cna_league_data() from public;
grant execute on function public.cna_league_data() to anon,authenticated;

create function public.cna_manage(p_action text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare ident uuid; sid uuid; cid uuid; pid uuid; slot uuid; roundnum integer; prev public.cna_stints; rep public.cna_reports; body jsonb; stat jsonb; home uuid; away uuid; hs uuid; aws uuid; mid uuid; phaseval text; modeval text; begin
 if not cna_private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 if octet_length(p_data::text)>100000 then raise exception 'PAYLOAD_TOO_LARGE'; end if;
 -- Serialize league mutations to avoid replacement / approval races.
 perform pg_advisory_xact_lock(262609);
 ident := nullif(p_data->>'id','')::uuid; sid:=nullif(p_data->>'season_id','')::uuid;
 if p_action='season' then
  if ident is not null and exists(select 1 from public.cna_seasons where id=ident and data_mode<>p_data->>'data_mode') and (exists(select 1 from public.cna_matches where season_id=ident) or exists(select 1 from public.cna_club_summaries where season_id=ident) or exists(select 1 from public.cna_player_summaries where season_id=ident)) then raise exception 'MODE_HAS_DATA'; end if;
  if length(trim(p_data->>'name')) not between 2 and 80 or (p_data->>'year')::int not between 1990 and 2100 then raise exception 'INVALID_SEASON'; end if;
  if ident is null then
   insert into public.cna_seasons(competition_id,name,year,data_mode,published,win_points,draw_points,status) select id,trim(p_data->>'name'),(p_data->>'year')::int,p_data->>'data_mode',false,coalesce((p_data->>'win_points')::int,3),coalesce((p_data->>'draw_points')::int,1),'active' from public.cna_competitions where slug='liga-cna' returning id into ident;
  else update public.cna_seasons set name=trim(p_data->>'name'),year=(p_data->>'year')::int,data_mode=p_data->>'data_mode',win_points=(p_data->>'win_points')::int,draw_points=(p_data->>'draw_points')::int,status=p_data->>'status' where id=ident; end if;
 elsif p_action='publish' then
  update public.cna_seasons set published=(p_data->>'published')::boolean where id=sid returning id into ident;
 elsif p_action='club' then
  if ident is null then insert into public.cna_clubs(name,abbreviation) values(trim(p_data->>'name'),upper(p_data->>'abbreviation')) returning id into ident;
  else update public.cna_clubs set name=trim(p_data->>'name'),abbreviation=upper(p_data->>'abbreviation') where id=ident; end if;
 elsif p_action='player' then
  if ident is null then insert into public.cna_players(name,ea_id,position) values(trim(p_data->>'name'),trim(p_data->>'ea_id'),p_data->>'position') returning id into ident;
  else update public.cna_players set name=trim(p_data->>'name'),ea_id=trim(p_data->>'ea_id'),position=p_data->>'position' where id=ident; end if;
 elsif p_action in ('enroll','replace') then
  cid:=(p_data->>'club_id')::uuid; roundnum:=coalesce((p_data->>'start_round')::int,1);
  if p_action='enroll' then
   if exists(select 1 from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id where sl.season_id=sid and st.club_id=cid) then raise exception 'CLUB_ALREADY_ENROLLED'; end if;
   insert into public.cna_slots(season_id,label) values(sid,p_data->>'label') returning id into slot;
  else
   slot:=(p_data->>'slot_id')::uuid;
   select season_id into sid from public.cna_slots where id=slot;
   select * into strict prev from public.cna_stints where slot_id=slot and end_round is null for update;
   if roundnum<=prev.start_round or exists(select 1 from public.cna_matches where (home_slot=slot or away_slot=slot) and round>=roundnum) then raise exception 'REPLACEMENT_CONFLICT'; end if;
   if exists(select 1 from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id where sl.season_id=sid and st.club_id=cid) then raise exception 'CLUB_ALREADY_ENROLLED'; end if;
   if exists(select 1 from public.cna_rosters where season_id=sid and club_id=prev.club_id and start_round>=roundnum) then raise exception 'REPLACEMENT_CONFLICT'; end if;
   update public.cna_stints set end_round=roundnum-1 where id=prev.id;
   update public.cna_rosters set end_round=roundnum-1 where season_id=sid and club_id=prev.club_id and start_round<roundnum and (end_round is null or end_round>=roundnum);
  end if;
  insert into public.cna_stints(slot_id,club_id,start_round,reason) values(slot,cid,roundnum,coalesce(p_data->>'reason','')) returning id into ident;
 elsif p_action='roster' then
  cid:=(p_data->>'club_id')::uuid; pid:=(p_data->>'player_id')::uuid; roundnum:=(p_data->>'start_round')::int;
  if not exists(select 1 from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id where sl.season_id=sid and st.club_id=cid and roundnum between st.start_round and coalesce(st.end_round,999)) then raise exception 'CLUB_NOT_ACTIVE'; end if;
  if exists(select 1 from public.cna_rosters where season_id=sid and player_id=pid and coalesce(end_round,999)>=roundnum) then
   if not coalesce((p_data->>'transfer')::boolean,false) then raise exception 'PLAYER_ALREADY_REGISTERED'; end if;
   if exists(select 1 from public.cna_rosters where season_id=sid and player_id=pid and start_round>=roundnum) or exists(select 1 from public.cna_player_stats ps join public.cna_matches m on m.id=ps.match_id where m.season_id=sid and ps.player_id=pid and m.round>=roundnum) then raise exception 'TRANSFER_CONFLICT'; end if;
   update public.cna_rosters set end_round=roundnum-1 where season_id=sid and player_id=pid and coalesce(end_round,999)>=roundnum;
  end if;
  insert into public.cna_rosters(season_id,club_id,player_id,start_round,end_round) select sid,cid,pid,roundnum,st.end_round from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id where sl.season_id=sid and st.club_id=cid and roundnum between st.start_round and coalesce(st.end_round,999) returning id into ident;
 elsif p_action in ('club_summary','player_summary') then
  select data_mode into modeval from public.cna_seasons where id=sid;
  if modeval<>'summary' then raise exception 'SUMMARY_MODE_REQUIRED'; end if;
  cid:=(p_data->>'club_id')::uuid;
  select st.slot_id into slot from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id where sl.season_id=sid and st.club_id=cid;
  if slot is null then raise exception 'CLUB_NOT_ENROLLED'; end if;
  if p_action='club_summary' then
   insert into public.cna_club_summaries(season_id,slot_id,club_id,wins,draws,losses,gf,ga,source) values(sid,slot,cid,(p_data->>'wins')::int,(p_data->>'draws')::int,(p_data->>'losses')::int,(p_data->>'gf')::int,(p_data->>'ga')::int,p_data->>'source') on conflict(season_id,club_id) do update set wins=excluded.wins,draws=excluded.draws,losses=excluded.losses,gf=excluded.gf,ga=excluded.ga,source=excluded.source returning id into ident;
  else
   pid:=(p_data->>'player_id')::uuid;
   if not exists(select 1 from public.cna_rosters where season_id=sid and club_id=cid and player_id=pid) then raise exception 'PLAYER_NOT_REGISTERED'; end if;
   insert into public.cna_player_summaries(season_id,club_id,player_id,appearances,goals,assists,rating,clean_sheets,saves,conceded,source) values(sid,cid,pid,(p_data->>'appearances')::int,(p_data->>'goals')::int,(p_data->>'assists')::int,(p_data->>'rating')::numeric,(p_data->>'clean_sheets')::int,(p_data->>'saves')::int,(p_data->>'conceded')::int,p_data->>'source') on conflict(season_id,club_id,player_id) do update set appearances=excluded.appearances,goals=excluded.goals,assists=excluded.assists,rating=excluded.rating,clean_sheets=excluded.clean_sheets,saves=excluded.saves,conceded=excluded.conceded,source=excluded.source returning id into ident;
  end if;
 elsif p_action='report' then
  if (select data_mode from public.cna_seasons where id=sid)<>'matches' then raise exception 'MATCH_MODE_REQUIRED'; end if;
  if ident is null then insert into public.cna_reports(season_id,submission_id,payload,created_by) values(sid,nullif(p_data->>'submission_id','')::uuid,p_data->'payload',auth.uid()) returning id into ident;
  else update public.cna_reports set payload=p_data->'payload',status='draft',updated_at=now() where id=ident and season_id=sid; if not found then raise exception 'REPORT_NOT_FOUND'; end if; end if;
 elsif p_action='reject' then
  update public.cna_reports set status='rejected',review_note=left(coalesce(p_data->>'note',''),500),updated_at=now() where id=ident and status<>'approved'; if not found then raise exception 'REPORT_NOT_DRAFT'; end if;
 elsif p_action in ('approve','schedule') then
  if p_action='approve' then
   select * into strict rep from public.cna_reports where id=ident for update;
   if rep.status='approved' then return ident; end if;
   if rep.status<>'draft' then raise exception 'REPORT_NOT_DRAFT'; end if;
   body:=rep.payload; sid:=rep.season_id;
  else body:=p_data; end if;
  if (select data_mode from public.cna_seasons where id=sid)<>'matches' then raise exception 'MATCH_MODE_REQUIRED'; end if;
  roundnum:=(body->>'round')::int; home:=(body->>'home_club')::uuid; away:=(body->>'away_club')::uuid; phaseval:=body->>'phase';
  select st.slot_id into hs from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id where sl.season_id=sid and st.club_id=home and roundnum between st.start_round and coalesce(st.end_round,999);
  select st.slot_id into aws from public.cna_stints st join public.cna_slots sl on sl.id=st.slot_id where sl.season_id=sid and st.club_id=away and roundnum between st.start_round and coalesce(st.end_round,999);
  if hs is null or aws is null or hs=aws then raise exception 'CLUB_NOT_ACTIVE'; end if;
  mid:=nullif(body->>'match_id','')::uuid;
  if mid is null and p_action='approve' then select id into mid from public.cna_matches where report_id=rep.id; end if;
  if mid is not null and not exists(select 1 from public.cna_matches where id=mid and season_id=sid and (status='scheduled' or report_id=rep.id)) then raise exception 'MATCH_CONFLICT'; end if;
  if exists(select 1 from public.cna_matches where season_id=sid and phase=phaseval and round=roundnum and ((home_slot=hs and away_slot=aws) or (home_slot=aws and away_slot=hs)) and id is distinct from mid) then raise exception 'MATCH_CONFLICT'; end if;
  if p_action='approve' and (body->>'home_goals' is null or body->>'away_goals' is null) then raise exception 'SCORE_REQUIRED'; end if;
  if mid is null then
   insert into public.cna_matches(report_id,season_id,phase,round,home_slot,away_slot,home_club,away_club,home_goals,away_goals,played_at,status,source) values(case when p_action='approve' then rep.id end,sid,phaseval,roundnum,hs,aws,home,away,case when p_action='approve' then (body->>'home_goals')::int end,case when p_action='approve' then (body->>'away_goals')::int end,nullif(body->>'played_at','')::date,case when p_action='approve' then 'approved' else 'scheduled' end,coalesce(body->>'source','')) returning id into mid;
  else
   update public.cna_matches set report_id=rep.id,phase=phaseval,round=roundnum,home_slot=hs,away_slot=aws,home_club=home,away_club=away,home_goals=(body->>'home_goals')::int,away_goals=(body->>'away_goals')::int,played_at=nullif(body->>'played_at','')::date,status='approved',source=coalesce(body->>'source','') where id=mid;
   delete from public.cna_player_stats where match_id=mid;
  end if;
  if p_action='approve' then
   for stat in select value from jsonb_array_elements(coalesce(body->'players','[]')) loop
    pid:=(stat->>'player_id')::uuid; cid:=(stat->>'club_id')::uuid;
    if cid not in (home,away) or not exists(select 1 from public.cna_rosters where season_id=sid and club_id=cid and player_id=pid and roundnum between start_round and coalesce(end_round,999)) then raise exception 'PLAYER_NOT_REGISTERED'; end if;
    insert into public.cna_player_stats(match_id,player_id,club_id,goals,assists,rating,clean_sheet,saves,conceded) values(mid,pid,cid,(stat->>'goals')::int,(stat->>'assists')::int,(stat->>'rating')::numeric,(stat->>'clean_sheet')::boolean,(stat->>'saves')::int,(stat->>'conceded')::int);
   end loop;
   if exists(select 1 from public.cna_player_stats where match_id=mid group by club_id having sum(goals)>case when club_id=home then (body->>'home_goals')::int else (body->>'away_goals')::int end or sum(assists)>case when club_id=home then (body->>'home_goals')::int else (body->>'away_goals')::int end) then raise exception 'STATS_EXCEED_SCORE'; end if;
   update public.cna_reports set status='approved',updated_at=now() where id=rep.id;
  else ident:=mid; end if;
 else raise exception 'UNKNOWN_ACTION'; end if;
 if ident is null then raise exception 'NOT_FOUND'; end if;
 insert into public.cna_league_audit(actor_id,action,entity_id,detail) values(auth.uid(),p_action,ident,p_data);
 return ident;
end $$;
revoke all on function public.cna_manage(text,jsonb) from public,anon;
grant execute on function public.cna_manage(text,jsonb) to authenticated;

create function public.cna_rankings(p_season uuid default null,p_phase text default 'regular') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if p_phase not in ('regular','playoffs','all') then raise exception 'INVALID_PHASE'; end if;
 with eligible as (select * from public.cna_seasons where (published or cna_private.is_admin()) and (p_season is null or id=p_season)),
 sides as (
 select m.season_id,m.home_slot slot_id,m.home_club club_id,m.home_goals gf,m.away_goals ga,1 pj,case when m.home_goals>m.away_goals then 1 else 0 end w,case when m.home_goals=m.away_goals then 1 else 0 end d,case when m.home_goals<m.away_goals then 1 else 0 end l,case when m.phase<>'regular' then 0 when m.home_goals>m.away_goals then s.win_points when m.home_goals=m.away_goals then s.draw_points else 0 end pts from public.cna_matches m join eligible s on s.id=m.season_id where m.status='approved' and (p_phase='all' or (p_phase='regular' and m.phase='regular') or (p_phase='playoffs' and m.phase<>'regular'))
 union all
 select m.season_id,m.away_slot,m.away_club,m.away_goals,m.home_goals,1,case when m.away_goals>m.home_goals then 1 else 0 end,case when m.away_goals=m.home_goals then 1 else 0 end,case when m.away_goals<m.home_goals then 1 else 0 end,case when m.phase<>'regular' then 0 when m.away_goals>m.home_goals then s.win_points when m.away_goals=m.home_goals then s.draw_points else 0 end from public.cna_matches m join eligible s on s.id=m.season_id where m.status='approved' and (p_phase='all' or (p_phase='regular' and m.phase='regular') or (p_phase='playoffs' and m.phase<>'regular'))
 union all
 select x.season_id,x.slot_id,x.club_id,x.gf,x.ga,x.wins+x.draws+x.losses,x.wins,x.draws,x.losses,x.wins*s.win_points+x.draws*s.draw_points from public.cna_club_summaries x join eligible s on s.id=x.season_id where p_phase<>'playoffs'
 union all
 select sl.season_id,sl.id,st.club_id,0,0,0,0,0,0,0 from public.cna_slots sl join eligible s on s.id=sl.season_id join public.cna_stints st on st.slot_id=sl.id
 ), team as (
 select case when p_season is null then club_id else slot_id end id,sum(pj) pj,sum(w) wins,sum(d) draws,sum(l) losses,sum(gf) gf,sum(ga) ga,sum(gf-ga) gd,sum(pts) points from sides group by 1
 ), player_rows as (
 select ps.player_id,1 appearances,ps.goals,ps.assists,ps.rating,case when ps.rating is not null then 1 else 0 end rating_n,case when ps.clean_sheet is null then null when ps.clean_sheet then 1 else 0 end clean_sheets,ps.saves,ps.conceded from public.cna_player_stats ps join public.cna_matches m on m.id=ps.match_id join eligible s on s.id=m.season_id where m.status='approved' and (p_phase='all' or (p_phase='regular' and m.phase='regular') or (p_phase='playoffs' and m.phase<>'regular'))
 union all
 select ps.player_id,ps.appearances,ps.goals,ps.assists,case when ps.appearances>0 then ps.rating*ps.appearances end,case when ps.rating is not null and ps.appearances>0 then ps.appearances else 0 end,ps.clean_sheets,ps.saves,ps.conceded from public.cna_player_summaries ps join eligible s on s.id=ps.season_id where p_phase<>'playoffs'
 ), players as (
 select player_id id,sum(appearances) appearances,sum(goals) goals,sum(assists) assists,round(sum(rating)/nullif(sum(rating_n),0),2) rating,sum(clean_sheets) clean_sheets,sum(saves) saves,sum(conceded) conceded,count(*) filter(where goals is not null) goals_known,count(*) records from player_rows group by player_id
 )
 select jsonb_build_object('teams',(select coalesce(jsonb_agg(to_jsonb(t) order by t.points desc,t.gd desc,t.gf desc,t.id),'[]') from team t),'players',(select coalesce(jsonb_agg(to_jsonb(p) order by p.goals desc nulls last,p.assists desc nulls last,p.id),'[]') from players p)) into result;
 return result;
end $$;
revoke all on function public.cna_rankings(uuid,text) from public;
grant execute on function public.cna_rankings(uuid,text) to anon,authenticated;
create trigger cna_league_audit_immutable before update or delete on public.cna_league_audit for each row execute function cna_private.reject_evidence_mutation();


