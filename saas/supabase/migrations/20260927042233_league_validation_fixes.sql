create unique index cna_one_report_per_submission on public.cna_reports(submission_id) where submission_id is not null;
create or replace function public.cna_manage(p_action text,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
   insert into public.cna_seasons(competition_id,name,year,data_mode,published,win_points,draw_points,status) select id,trim(p_data->>'name'),(p_data->>'year')::int,p_data->>'data_mode',false,coalesce((p_data->>'win_points')::int,3),coalesce((p_data->>'draw_points')::int,1),coalesce(p_data->>'status','active') from public.cna_competitions where slug='liga-cna' returning id into ident;
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
  if ident is null and nullif(p_data->>'submission_id','') is not null and exists(select 1 from public.cna_reports where submission_id=(p_data->>'submission_id')::uuid) then raise exception 'SUBMISSION_HAS_REPORT'; end if;
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

