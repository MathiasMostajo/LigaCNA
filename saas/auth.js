// ═══════════════════════════════════════════════════════════════
// auth.js v10 — BULLETPROOF auth with diagnostic logging
// ═══════════════════════════════════════════════════════════════
const SB_URL = 'https://wrgexwyjivfxijivdbqa.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZ2V4d3lqaXZmeGlqaXZkYnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDI2NTgsImV4cCI6MjA4OTExODY1OH0.KGBX0-PQGiwrAHrWrZ1TS_rbHtDbQwNA0F2NRhlT830';

// ─── Cache bust ──────────────────────────────────────────────
const APP_VERSION = 'v16';
const SAAS_KEY = 'lcna_saas_version';
if (localStorage.getItem(SAAS_KEY) !== APP_VERSION) {
  console.log('[AUTH] Version changed to', APP_VERSION);
  // Only clear app-specific keys — NEVER touch sb-* (Supabase auth session)
  ['lcna_version', 'lcna_api_key'].forEach(k => localStorage.removeItem(k));
  localStorage.setItem(SAAS_KEY, APP_VERSION);
}

// ─── Supabase client ─────────────────────────────────────────
let supa;
try {
  supa = window.supabase.createClient(SB_URL, SB_KEY);
  console.log('[AUTH] Supabase client created');
} catch(e) {
  console.error('[AUTH] Supabase init failed:', e);
}

// ─── State ───────────────────────────────────────────────────
const state = {
  user: null,
  profile: null,
  leagues: [],
  activeLeague: null,
  isSuperadmin: false,
  loading: true,
};

// ─── Events ──────────────────────────────────────────────────
const listeners = {};
function on(event, fn) { (listeners[event] ||= []).push(fn); }
function emit(event, data) {
  console.log('[AUTH] emit:', event);
  (listeners[event] || []).forEach(fn => fn(data));
}

// ─── Auth actions ────────────────────────────────────────────
async function signUp(email, password) {
  const { data, error } = await supa.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  console.log('[AUTH] signing out');
  try { await supa.auth.signOut(); } catch(e) { console.warn('[AUTH] signOut error:', e); }
  state.user = null; state.profile = null; state.leagues = [];
  state.activeLeague = null; state.isSuperadmin = false;
  emit('auth:logout');
}

// ─── Data loaders (each with timeout + fallback) ─────────────
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => {
      console.warn(`[AUTH] timeout after ${ms}ms, using fallback`);
      resolve(fallback);
    }, ms))
  ]);
}

async function loadProfile(userId) {
  console.log('[AUTH] loading profile for', userId);
  try {
    const { data, error } = await supa.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) console.warn('[AUTH] profile select error:', error.message);
    if (data) { console.log('[AUTH] profile found:', data.role, data.plan_type); return data; }

    // Auto-create if missing
    console.log('[AUTH] profile not found, creating...');
    const email = state.user?.email || '';
    const { data: created, error: createErr } = await supa.from('profiles')
      .upsert({ id: userId, email, display_name: email.split('@')[0] }, { onConflict: 'id' })
      .select().maybeSingle();
    if (createErr) console.warn('[AUTH] profile create error:', createErr.message);
    return created || null;
  } catch(e) {
    console.warn('[AUTH] loadProfile exception:', e.message);
    return null;
  }
}

async function loadMyLeagues(userId) {
  console.log('[AUTH] loading leagues for', userId);
  try {
    const { data, error } = await supa.from('leagues').select('*').eq('admin_id', userId).order('created_at', { ascending: false });
    if (error) console.warn('[AUTH] leagues error:', error.message);
    console.log('[AUTH] found', data?.length || 0, 'leagues');
    return data || [];
  } catch(e) {
    console.warn('[AUTH] loadMyLeagues exception:', e.message);
    return [];
  }
}

async function createLeague(name, maxPlayers) {
  const planLimits = { amateur: 10, pro: 16, elite: 999, superadmin: 999 };
  const plan = state.profile?.plan_type || 'amateur';
  const maxTeams = planLimits[plan] || 10;

  const { data, error } = await supa.from('leagues')
    .insert({ admin_id: state.user.id, name, max_teams: maxTeams, max_players_per_team: maxPlayers, plan_type: plan })
    .select().single();
  if (error) throw error;
  state.leagues.push(data);
  return data;
}

function setActiveLeague(league) {
  state.activeLeague = league;
  emit('league:selected', state);
}

// ─── Public league search ────────────────────────────────────
async function searchPublicLeagues(query) {
  const { data, error } = await supa.from('leagues').select('id, name, slug, max_teams, created_at')
    .eq('is_public', true).ilike('name', `%${query}%`).limit(20);
  if (error) throw error;
  return data || [];
}

async function loadPublicLeague(slug) {
  const { data, error } = await supa.from('leagues').select('*').eq('slug', slug).eq('is_public', true).maybeSingle();
  if (error) throw error;
  return data;
}

// ─── Session handler (BULLETPROOF) ───────────────────────────
async function handleSession(session) {
  console.log('[AUTH] handleSession, user:', session?.user?.email || 'none');

  if (!session?.user) {
    console.log('[AUTH] no user in session');
    state.user = null; state.profile = null; state.leagues = [];
    state.activeLeague = null; state.loading = false;
    emit('auth:logout');
    return;
  }

  state.user = session.user;

  // Load profile and leagues with 8-second timeout each
  const defaultProfile = { id: session.user.id, email: session.user.email, role: 'user', plan_type: 'amateur', ai_trial_scans: 3 };

  const profile = await withTimeout(loadProfile(session.user.id), 8000, null);
  const leagues = await withTimeout(loadMyLeagues(session.user.id), 8000, []);

  state.profile = profile || defaultProfile;
  state.leagues = leagues || [];
  state.isSuperadmin = state.profile.role === 'superadmin';
  state.loading = false;

  console.log('[AUTH] ready — superadmin:', state.isSuperadmin, ', leagues:', state.leagues.length);
  emit('auth:ready', state);
}

// ─── Init ────────────────────────────────────────────────────
function initAuth() {
  if (!supa) {
    console.error('[AUTH] no Supabase client, retrying...');
    setTimeout(() => {
      try { supa = window.supabase.createClient(SB_URL, SB_KEY); initAuth(); }
      catch(e) { console.error('[AUTH] retry failed'); emit('auth:logout'); }
    }, 500);
    return;
  }

  console.log('[AUTH] initializing...');

  // Get initial session with timeout
  withTimeout(
    supa.auth.getSession().then(({ data: { session } }) => handleSession(session)),
    10000,
    null
  ).catch(e => {
    console.error('[AUTH] getSession failed:', e);
    state.loading = false;
    emit('auth:logout');
  }).then(result => {
    // If timeout returned null (handleSession never completed), force logout
    if (result === null && state.loading) {
      console.warn('[AUTH] session load timed out, forcing logout');
      state.loading = false;
      emit('auth:logout');
    }
  });

  // Listen for future changes
  supa.auth.onAuthStateChange(async (event, session) => {
    console.log('[AUTH] onAuthStateChange:', event);
    if (event === 'INITIAL_SESSION') return;
    
    // TOKEN_REFRESHED — don't reload everything, just update the session
    if (event === 'TOKEN_REFRESHED') {
      console.log('[AUTH] token refreshed, keeping current state');
      if (session?.user) state.user = session.user;
      return;
    }
    
    if (event === 'SIGNED_IN') {
      // If same user is already loaded, skip full reload (prevents UI flicker)
      if (state.user?.id === session?.user?.id && state.profile && state.leagues.length >= 0 && !state.loading) {
        console.log('[AUTH] same user already loaded, skipping reload');
        state.user = session.user; // update token but keep data
        return;
      }
      await handleSession(session);
    } else if (event === 'SIGNED_OUT') {
      state.user = null; state.profile = null; state.leagues = [];
      state.activeLeague = null; state.loading = false;
      emit('auth:logout');
    }
  });
}

export { supa, state, on, emit, signUp, signIn, signOut, createLeague, setActiveLeague, searchPublicLeagues, loadPublicLeague, loadMyLeagues, initAuth };
