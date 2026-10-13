import {PGlite} from '@electric-sql/pglite';
import base from '../supabase/migrations/20260918043653_cna_evidence_inbox.sql?raw';
import league from '../supabase/migrations/20260927041430_league_management.sql?raw';
import fixes from '../supabase/migrations/20260927042233_league_validation_fixes.sql?raw';
export async function fixture(){
 const db=new PGlite('idb://cna-ui-fixture-v1');
 if(!(await db.query("select to_regclass('public.cna_clubs') as t")).rows.some((r:any)=>r.t)){
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
 await db.exec(base);await db.exec(league);
 await db.exec("insert into auth.users values('11111111-1111-4111-8111-111111111111');insert into cna_admins(user_id) values('11111111-1111-4111-8111-111111111111');");
 await db.exec("set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';");
 const run=async(a:string,d:object)=>(await db.query<{id:string}>('select cna_manage($1,$2) id',[a,JSON.stringify(d)])).rows[0].id;
 const s=await run('season',{name:'Temporada demo 2026',year:2026,data_mode:'matches'});
 const clubs=[];for(const [name,abbr] of [['Cóndores FC','CON'],['Norte United','NOR'],['Barrio Sur','SUR'],['Racing Virtual','RAC']])clubs.push(await run('club',{name,abbreviation:abbr}));
 for(let i=0;i<clubs.length;i++)await run('enroll',{season_id:s,club_id:clubs[i],label:'Cupo '+(i+1)});
 const p=await run('player',{name:'Jugador Demo',ea_id:'demo_10',position:'DEL'});await run('roster',{season_id:s,club_id:clubs[0],player_id:p,start_round:1});
 const r=await run('report',{season_id:s,payload:{phase:'regular',round:1,home_club:clubs[0],away_club:clubs[1],home_goals:3,away_goals:1,played_at:'2026-09-20',source:'Datos ficticios de prueba',players:[{player_id:p,club_id:clubs[0],goals:2,assists:1,rating:8.7}]}});await run('approve',{id:r});await run('publish',{season_id:s,published:true});
 }
 if(!(await db.query("select to_regclass('public.cna_one_report_per_submission') as t")).rows.some((r:any)=>r.t))await db.exec(fixes);
 await db.exec("set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';");
 return {rpc:async(name:string,args:Record<string,unknown>={})=>{try{const queries:Record<string,[string,unknown[]]>={cna_league_data:['select cna_league_data() data',[]],cna_rankings:['select cna_rankings($1,$2) data',[args.p_season,args.p_phase]],cna_manage:['select cna_manage($1,$2) data',[args.p_action,JSON.stringify(args.p_data)]]};const q=queries[name];if(!q)throw new Error('Unsupported fixture RPC');const res=await db.query<{data:unknown}>(q[0],q[1]);return {data:res.rows[0].data,error:null};}catch(error){return {data:null,error};}},auth:{signOut:async()=>{},signInWithPassword:async()=>({error:null})}};
}

