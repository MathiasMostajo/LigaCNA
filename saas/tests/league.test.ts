import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(); const admin='11111111-1111-4111-8111-111111111111';
let season:string,a:string,b:string,c:string,player:string,slot:string,report:string;
async function rpc(action:string,data:object){return (await db.query<{id:string}>('select cna_manage($1,$2::jsonb) id',[action,JSON.stringify(data)])).rows[0].id;}
async function ranks(s:string|null){return (await db.query<{r:any}>('select cna_rankings($1) r',[s])).rows[0].r;}
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to public; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; insert into auth.users values('${admin}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20260918043653_cna_evidence_inbox.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260927041430_league_management.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20260927042233_league_validation_fixes.sql',import.meta.url),'utf8'));
 await db.exec(`insert into cna_admins(user_id) values('${admin}'); set request.jwt.claim.sub='${admin}';`);
});
after(async()=>{await db.close();});
test('create season, participants, rosters and private draft; approval is atomic and idempotent',async()=>{
 season=await rpc('season',{name:'Temporada 1',year:2024,data_mode:'matches'});
 a=await rpc('club',{name:'Original',abbreviation:'ORI'}); b=await rpc('club',{name:'Rival',abbreviation:'RIV'}); c=await rpc('club',{name:'Reemplazo',abbreviation:'REE'});
 player=await rpc('player',{name:'Jugador',ea_id:'jugador-1',position:'DEL'});
 await rpc('enroll',{season_id:season,club_id:a,label:'Cupo 1'}); await rpc('enroll',{season_id:season,club_id:b,label:'Cupo 2'});
 slot=(await db.query<{id:string}>('select id from cna_slots where season_id=$1 and label=$2',[season,'Cupo 1'])).rows[0].id;
 await rpc('roster',{season_id:season,club_id:a,player_id:player,start_round:1});
 const body={phase:'regular',round:1,home_club:a,away_club:b,home_goals:2,away_goals:0,players:[{player_id:player,club_id:a,goals:2,assists:0,rating:8.5}]};
 report=await rpc('report',{season_id:season,payload:body});
 assert.equal((await ranks(season)).teams.find((x:any)=>x.id===slot).points,0);
 await rpc('approve',{id:report}); await rpc('approve',{id:report});
 assert.equal((await db.query('select * from cna_matches')).rows.length,1);
 assert.equal((await ranks(season)).teams.find((x:any)=>x.id===slot).points,3);
 assert.equal((await ranks(null)).players[0].goals,2);
 await rpc('report',{id:report,season_id:season,payload:{...body,players:[{...body.players[0],goals:3}]}});
 await assert.rejects(rpc('approve',{id:report}),/STATS_EXCEED_SCORE/);
 assert.equal((await ranks(null)).players[0].goals,2,'failed correction leaves official stats untouched');
 await rpc('report',{id:report,season_id:season,payload:body}); await rpc('approve',{id:report});
});
test('replacement inherits season slot points without crediting earlier wins to replacement club',async()=>{
 await assert.rejects(rpc('replace',{slot_id:slot,club_id:c,start_round:1}),/REPLACEMENT_CONFLICT/);
 await rpc('replace',{slot_id:slot,club_id:c,start_round:2,reason:'Retiro'});
 await rpc('roster',{season_id:season,club_id:c,player_id:player,start_round:2,transfer:true});
 const r=await rpc('report',{season_id:season,payload:{phase:'regular',round:2,home_club:c,away_club:b,home_goals:0,away_goals:1,players:[]}}); await rpc('approve',{id:r});
 assert.equal((await ranks(season)).teams.find((x:any)=>x.id===slot).points,3);
 assert.equal((await ranks(null)).teams.find((x:any)=>x.id===a).wins,1);
 assert.equal((await ranks(null)).teams.find((x:any)=>x.id===c).wins,0);
 assert.equal((await ranks(null)).teams.find((x:any)=>x.id===c).losses,1);
 const invalid=await rpc('report',{season_id:season,payload:{phase:'regular',round:3,home_club:a,away_club:b,home_goals:1,away_goals:0,players:[]}});
 await assert.rejects(rpc('approve',{id:invalid}),/CLUB_NOT_ACTIVE/);
});
test('public sees only published approved data; anonymous and non-admin cannot mutate',async()=>{
 await db.exec("set request.jwt.claim.sub=''; set role anon;");
 let snapshot=(await db.query<{r:any}>('select cna_league_data() r')).rows[0].r;
 assert.equal(snapshot.seasons.length,0); assert.equal(snapshot.reports.length,0); assert.equal((await ranks(null)).teams.length,0);
 await assert.rejects(rpc('club',{name:'Hacked',abbreviation:'BAD'}),/permission denied/);
 await db.exec(`reset role; set request.jwt.claim.sub='${admin}';`); await rpc('publish',{season_id:season,published:true});
 await db.exec("set request.jwt.claim.sub=''; set role anon;"); snapshot=(await db.query<{r:any}>('select cna_league_data() r')).rows[0].r;
 assert.equal(snapshot.matches.length,2); assert.equal(snapshot.reports.length,0); assert.equal(snapshot.admin,false);
 await db.exec("reset role; set role authenticated; set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';");
 await assert.rejects(rpc('club',{name:'Hacked',abbreviation:'BAD'}),/ADMIN_REQUIRED/);
 await db.exec(`reset role; set request.jwt.claim.sub='${admin}';`);
});
test('historical summary mode prevents double-counting and supports unknown player metrics',async()=>{
 const s=await rpc('season',{name:'Historia',year:2020,data_mode:'summary'});
 await rpc('enroll',{season_id:s,club_id:a,label:'A'}); await rpc('roster',{season_id:s,club_id:a,player_id:player,start_round:1});
 await rpc('club_summary',{season_id:s,club_id:a,wins:4,draws:1,losses:2,gf:12,ga:8,source:'Copa Fácil'});
 await rpc('player_summary',{season_id:s,club_id:a,player_id:player,goals:8,assists:null,appearances:null,source:'Instagram'});
 const r=await ranks(s); assert.equal(r.teams[0].points,13); assert.equal(r.players[0].goals,8); assert.equal(r.players[0].assists,null); assert.equal(r.players[0].rating,null);
 await assert.rejects(rpc('report',{season_id:s,payload:{}}),/MATCH_MODE_REQUIRED/);
 await assert.rejects(rpc('season',{id:s,name:'Historia',year:2020,data_mode:'matches',win_points:3,draw_points:1,status:'archived'}),/MODE_HAS_DATA/);
});



