-- ═══════════════════════════════════════════════════════════════
-- schema.sql v5 — Multi-liga SaaS + Public Read + Slug + Tiers
-- DROP all tables first, then recreate
-- ═══════════════════════════════════════════════════════════════
 
-- Clean slate
DROP TABLE IF EXISTS public.removal_requests CASCADE;
DROP TABLE IF EXISTS public.fichaje_requests CASCADE;
DROP TABLE IF EXISTS public.submissions CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.leagues CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.user_league_id() CASCADE;
DROP FUNCTION IF EXISTS public.is_superadmin() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_plan_limits(UUID) CASCADE;
 
-- ═══════════════════════════════════════════════════════════════
-- 1. PROFILES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'superadmin')),
  plan_type TEXT DEFAULT 'amateur' CHECK (plan_type IN ('amateur', 'pro', 'elite', 'superadmin')),
  ai_trial_scans INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
 
-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
 
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
 
-- ═══════════════════════════════════════════════════════════════
-- 2. LEAGUES — with slug + is_public
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.leagues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  is_public BOOLEAN DEFAULT true,
  plan_type TEXT DEFAULT 'amateur' CHECK (plan_type IN ('amateur', 'pro', 'elite', 'superadmin')),
  max_teams INTEGER DEFAULT 10,
  max_players_per_team INTEGER DEFAULT 11,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_leagues_admin ON public.leagues(admin_id);
CREATE INDEX idx_leagues_slug ON public.leagues(slug);
 
-- Auto-generate slug from name on insert
CREATE OR REPLACE FUNCTION public.generate_league_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base_slug := lower(regexp_replace(trim(NEW.name), '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    final_slug := base_slug;
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE slug = final_slug AND id != NEW.id) THEN
        EXIT;
      END IF;
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;
    NEW.slug := final_slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
DROP TRIGGER IF EXISTS trg_league_slug ON public.leagues;
CREATE TRIGGER trg_league_slug
  BEFORE INSERT OR UPDATE ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.generate_league_slug();
 
-- ═══════════════════════════════════════════════════════════════
-- 3-8. DATA TABLES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  shield_url TEXT,
  is_bye BOOLEAN DEFAULT false,
  replaced BOOLEAN DEFAULT false,
  paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_teams_league ON public.teams(league_id);
 
CREATE TABLE public.players (
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
CREATE INDEX idx_players_league ON public.players(league_id);
CREATE INDEX idx_players_team ON public.players(team_id);
 
CREATE TABLE public.matches (
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
CREATE INDEX idx_matches_league ON public.matches(league_id);
 
CREATE TABLE public.submissions (
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
 
CREATE TABLE public.fichaje_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id),
  team_name TEXT,
  player_name TEXT NOT NULL,
  pos TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
 
CREATE TABLE public.removal_requests (
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
-- HELPER FUNCTIONS (server-side, unfalsifiable)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.user_league_id()
RETURNS UUID AS $$
  SELECT id FROM public.leagues WHERE admin_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
 
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(role = 'superadmin', false) FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
 
CREATE OR REPLACE FUNCTION public.get_user_plan_limits(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  prof public.profiles%ROWTYPE;
  lg public.leagues%ROWTYPE;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = p_user_id;
  SELECT * INTO lg FROM public.leagues WHERE admin_id = p_user_id LIMIT 1;
 
  IF prof.role = 'superadmin' THEN
    RETURN jsonb_build_object('plan','superadmin','is_superadmin',true,'can_scan',true,'max_teams',999,'ai_scans_remaining',999);
  END IF;
 
  IF lg.id IS NULL THEN
    RETURN jsonb_build_object('plan','amateur','is_superadmin',false,'can_scan',prof.ai_trial_scans > 0,'max_teams',10,'ai_scans_remaining',prof.ai_trial_scans);
  END IF;
 
  IF lg.trial_ends_at > NOW() THEN
    RETURN jsonb_build_object('plan',lg.plan_type||'_trial','is_superadmin',false,'can_scan',true,
      'max_teams',CASE lg.plan_type WHEN 'elite' THEN 999 WHEN 'pro' THEN 16 ELSE 10 END,
      'ai_scans_remaining',CASE WHEN lg.plan_type IN ('pro','elite') THEN 999 ELSE prof.ai_trial_scans END);
  END IF;
 
  RETURN jsonb_build_object('plan',lg.plan_type,'is_superadmin',false,
    'can_scan',lg.plan_type IN ('pro','elite'),
    'max_teams',CASE lg.plan_type WHEN 'elite' THEN 999 WHEN 'pro' THEN 16 ELSE 10 END,
    'ai_scans_remaining',CASE WHEN lg.plan_type IN ('pro','elite') THEN 999 ELSE prof.ai_trial_scans END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
 
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
 
-- Profiles: own only
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (id = auth.uid());
 
-- Leagues: owner can CRUD, public can READ if is_public=true
CREATE POLICY "leagues_public_read" ON public.leagues FOR SELECT USING (is_public = true OR admin_id = auth.uid());
CREATE POLICY "leagues_insert" ON public.leagues FOR INSERT WITH CHECK (admin_id = auth.uid());
CREATE POLICY "leagues_update" ON public.leagues FOR UPDATE USING (admin_id = auth.uid());
CREATE POLICY "leagues_delete" ON public.leagues FOR DELETE USING (admin_id = auth.uid());
 
-- Teams, Players, Matches: public read if league is public, owner can write
CREATE POLICY "teams_public_read" ON public.teams FOR SELECT
  USING (league_id IN (SELECT id FROM public.leagues WHERE is_public = true) OR league_id = public.user_league_id());
CREATE POLICY "teams_write" ON public.teams FOR INSERT WITH CHECK (league_id = public.user_league_id());
CREATE POLICY "teams_update" ON public.teams FOR UPDATE USING (league_id = public.user_league_id());
CREATE POLICY "teams_delete" ON public.teams FOR DELETE USING (league_id = public.user_league_id());
 
CREATE POLICY "players_public_read" ON public.players FOR SELECT
  USING (league_id IN (SELECT id FROM public.leagues WHERE is_public = true) OR league_id = public.user_league_id());
CREATE POLICY "players_write" ON public.players FOR INSERT WITH CHECK (league_id = public.user_league_id());
CREATE POLICY "players_update" ON public.players FOR UPDATE USING (league_id = public.user_league_id());
CREATE POLICY "players_delete" ON public.players FOR DELETE USING (league_id = public.user_league_id());
 
CREATE POLICY "matches_public_read" ON public.matches FOR SELECT
  USING (league_id IN (SELECT id FROM public.leagues WHERE is_public = true) OR league_id = public.user_league_id());
CREATE POLICY "matches_write" ON public.matches FOR INSERT WITH CHECK (league_id = public.user_league_id());
CREATE POLICY "matches_update" ON public.matches FOR UPDATE USING (league_id = public.user_league_id());
CREATE POLICY "matches_delete" ON public.matches FOR DELETE USING (league_id = public.user_league_id());
 
-- Submissions, Fichajes, Removals: owner only (not public)
CREATE POLICY "submissions_all" ON public.submissions FOR ALL USING (league_id = public.user_league_id());
CREATE POLICY "fichajes_all" ON public.fichaje_requests FOR ALL USING (league_id = public.user_league_id());
CREATE POLICY "removals_all" ON public.removal_requests FOR ALL USING (league_id = public.user_league_id());
 
-- ═══════════════════════════════════════════════════════════════
-- SUPERADMIN ACTIVATION (uncomment + replace email)
-- ═══════════════════════════════════════════════════════════════
-- UPDATE public.profiles SET role = 'superadmin', plan_type = 'superadmin' WHERE email = 'TU_EMAIL@gmail.com';
