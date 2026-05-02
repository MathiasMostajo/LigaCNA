-- ═══════════════════════════════════════════════════════════════
-- schema.sql v4 — Multi-liga + Subscription Tiers + Superadmin
-- Ejecutar completo en Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. PROFILES (vinculado a auth.users) ───────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
  plan_type TEXT DEFAULT 'amateur' CHECK (plan_type IN ('amateur', 'pro', 'elite', 'superadmin')),
  ai_trial_scans INTEGER DEFAULT 3,  -- Amateur gets 3 free scans, counts down
  plan_activated_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 2. LEAGUES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leagues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  plan_type TEXT DEFAULT 'amateur' CHECK (plan_type IN ('amateur', 'pro', 'elite', 'superadmin')),
  max_teams INTEGER DEFAULT 10,
  max_players_per_team INTEGER DEFAULT 11,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 3. TEAMS ────────────────────────────────────────────────
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

-- ─── 4. PLAYERS ──────────────────────────────────────────────
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

-- ─── 5. MATCHES ──────────────────────────────────────────────
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 6. SUBMISSIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_code TEXT,
  team_name TEXT,
  scan_result JSONB NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 7. FICHAJE REQUESTS ─────────────────────────────────────
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

-- ─── 8. REMOVAL REQUESTS ─────────────────────────────────────
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
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichaje_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.removal_requests ENABLE ROW LEVEL SECURITY;

-- Profiles: each user sees only their own
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- Helper: get current user's league_id
CREATE OR REPLACE FUNCTION public.user_league_id()
RETURNS UUID AS $$
  SELECT id FROM public.leagues WHERE admin_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if current user is superadmin (SERVER-SIDE, cannot be faked)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(role = 'superadmin', false) FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Leagues
DROP POLICY IF EXISTS "leagues_select" ON public.leagues;
CREATE POLICY "leagues_select" ON public.leagues FOR SELECT USING (admin_id = auth.uid());
DROP POLICY IF EXISTS "leagues_insert" ON public.leagues;
CREATE POLICY "leagues_insert" ON public.leagues FOR INSERT WITH CHECK (admin_id = auth.uid());
DROP POLICY IF EXISTS "leagues_update" ON public.leagues;
CREATE POLICY "leagues_update" ON public.leagues FOR UPDATE USING (admin_id = auth.uid());
DROP POLICY IF EXISTS "leagues_delete" ON public.leagues;
CREATE POLICY "leagues_delete" ON public.leagues FOR DELETE USING (admin_id = auth.uid());

-- Teams, Players, Matches, Submissions, Fichajes, Removals
-- All scoped to league of current user
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['teams','players','matches','submissions','fichaje_requests','removal_requests']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON public.%s', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_all" ON public.%s FOR ALL USING (league_id = public.user_league_id())', tbl, tbl);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- PLAN LIMITS (server-side function, used by Edge Function)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(user_id UUID)
RETURNS JSONB AS $$
DECLARE
  profile_row public.profiles%ROWTYPE;
  league_row public.leagues%ROWTYPE;
BEGIN
  SELECT * INTO profile_row FROM public.profiles WHERE id = user_id;
  SELECT * INTO league_row FROM public.leagues WHERE admin_id = user_id LIMIT 1;

  -- Superadmin bypasses everything
  IF profile_row.role = 'superadmin' THEN
    RETURN jsonb_build_object(
      'plan', 'superadmin',
      'is_superadmin', true,
      'can_scan', true,
      'max_teams', 999,
      'ai_scans_remaining', 999
    );
  END IF;

  -- Check active trial
  IF league_row.trial_ends_at > NOW() THEN
    RETURN jsonb_build_object(
      'plan', league_row.plan_type || '_trial',
      'is_superadmin', false,
      'can_scan', true,
      'max_teams', CASE league_row.plan_type WHEN 'elite' THEN 999 WHEN 'pro' THEN 16 ELSE 10 END,
      'ai_scans_remaining', profile_row.ai_trial_scans
    );
  END IF;

  -- Apply plan limits
  RETURN jsonb_build_object(
    'plan', league_row.plan_type,
    'is_superadmin', false,
    'can_scan', league_row.plan_type IN ('pro', 'elite'),
    'max_teams', CASE league_row.plan_type WHEN 'elite' THEN 999 WHEN 'pro' THEN 16 ELSE 10 END,
    'ai_scans_remaining', CASE WHEN league_row.plan_type IN ('pro', 'elite') THEN 999 ELSE profile_row.ai_trial_scans END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- SET SUPERADMIN (run this manually for your own account)
-- Replace with your real email
-- ═══════════════════════════════════════════════════════════════
-- UPDATE public.profiles
-- SET role = 'superadmin', plan_type = 'superadmin'
-- WHERE email = 'TU_EMAIL_AQUI@gmail.com';
