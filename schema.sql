-- ═══════════════════════════════════════════════════════════════
-- schema.sql — Multi-liga completo. Ejecutar en Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. LEAGUES (ya creada, upsert seguro) ───────────────────
CREATE TABLE IF NOT EXISTS public.leagues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_players_per_team INTEGER DEFAULT 11,
  max_teams INTEGER DEFAULT 14,
  prize_pool NUMERIC DEFAULT 0,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leagues_admin ON public.leagues(admin_id);

-- ─── 2. TEAMS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  shield_url TEXT,
  is_bye BOOLEAN DEFAULT FALSE,
  replaced BOOLEAN DEFAULT FALSE,
  paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_league ON public.teams(league_id);

-- ─── 3. PLAYERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pos TEXT DEFAULT '',
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  cs INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  ratings NUMERIC[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_players_league ON public.players(league_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON public.players(team_id);

-- ─── 4. MATCHES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES public.teams(id),
  away_id UUID NOT NULL REFERENCES public.teams(id),
  home_goals INTEGER DEFAULT 0,
  away_goals INTEGER DEFAULT 0,
  round INTEGER,
  date TEXT,
  player_stats JSONB DEFAULT '{}',
  flag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_matches_league ON public.matches(league_id);

-- ─── 5. SUBMISSIONS (con status + retención 24h) ────────────
CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_code TEXT,
  team_name TEXT,
  scan_result JSONB NOT NULL,
  images JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submissions_league ON public.submissions(league_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);

-- Cleanup: auto-delete rejected/approved submissions older than 24h
-- Run via Supabase CRON or pg_cron:
-- SELECT cron.schedule('cleanup-submissions', '0 * * * *',
--   $$DELETE FROM public.submissions WHERE status != 'pending' AND reviewed_at < NOW() - INTERVAL '24 hours'$$
-- );

-- ─── 6. FICHAJE REQUESTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fichaje_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id),
  team_name TEXT,
  player_name TEXT NOT NULL,
  pos TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fichajes_league ON public.fichaje_requests(league_id);

-- ─── 7. REMOVAL REQUESTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.removal_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id),
  player_name TEXT,
  team_id UUID NOT NULL REFERENCES public.teams(id),
  team_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES — cada admin solo ve datos de su liga
-- ═══════════════════════════════════════════════════════════════

-- Helper: get current user's league_id
CREATE OR REPLACE FUNCTION public.user_league_id()
RETURNS UUID AS $$
  SELECT id FROM public.leagues WHERE admin_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichaje_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.removal_requests ENABLE ROW LEVEL SECURITY;

-- Leagues: admin CRUD on own leagues
DROP POLICY IF EXISTS "leagues_select" ON public.leagues;
CREATE POLICY "leagues_select" ON public.leagues FOR SELECT USING (admin_id = auth.uid());
DROP POLICY IF EXISTS "leagues_insert" ON public.leagues;
CREATE POLICY "leagues_insert" ON public.leagues FOR INSERT WITH CHECK (admin_id = auth.uid());
DROP POLICY IF EXISTS "leagues_update" ON public.leagues;
CREATE POLICY "leagues_update" ON public.leagues FOR UPDATE USING (admin_id = auth.uid());
DROP POLICY IF EXISTS "leagues_delete" ON public.leagues;
CREATE POLICY "leagues_delete" ON public.leagues FOR DELETE USING (admin_id = auth.uid());

-- Teams: scoped to league
DROP POLICY IF EXISTS "teams_all" ON public.teams;
CREATE POLICY "teams_all" ON public.teams FOR ALL USING (league_id = public.user_league_id());

-- Players: scoped to league
DROP POLICY IF EXISTS "players_all" ON public.players;
CREATE POLICY "players_all" ON public.players FOR ALL USING (league_id = public.user_league_id());

-- Matches: scoped to league
DROP POLICY IF EXISTS "matches_all" ON public.matches;
CREATE POLICY "matches_all" ON public.matches FOR ALL USING (league_id = public.user_league_id());

-- Submissions: scoped to league
DROP POLICY IF EXISTS "submissions_all" ON public.submissions;
CREATE POLICY "submissions_all" ON public.submissions FOR ALL USING (league_id = public.user_league_id());

-- Fichaje requests: scoped to league
DROP POLICY IF EXISTS "fichajes_all" ON public.fichaje_requests;
CREATE POLICY "fichajes_all" ON public.fichaje_requests FOR ALL USING (league_id = public.user_league_id());

-- Removal requests: scoped to league
DROP POLICY IF EXISTS "removals_all" ON public.removal_requests;
CREATE POLICY "removals_all" ON public.removal_requests FOR ALL USING (league_id = public.user_league_id());
