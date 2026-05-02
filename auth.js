// ═══════════════════════════════════════════════════════════════
// auth.js v5 — Auth + Profile + League resolution
// ═══════════════════════════════════════════════════════════════
const SB_URL = 'https://wrgexwyjivfxijivdbqa.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZ2V4d3lqaXZmeGlqaXZkYnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDI2NTgsImV4cCI6MjA4OTExODY1OH0.KGBX0-PQGiwrAHrWrZ1TS_rbHtDbQwNA0F2NRhlT830';

function getSupabase() {
  if (window.supabase?.createClient) return window.supabase.createClient(SB_URL, SB_KEY);
  throw new Error('Supabase SDK not loaded');
}

let supa;
try { supa = getSupabase(); } catch(e) { console.error(e); }

const state = {
  user: null,
  profile: null,
  leagues: [],        // all leagues owned by user
  activeLeague: null,  // currently selected league
  isSuperadmin: false,
  loading: true,
};

const listeners = {};
function on(event, fn) { (listeners[event] ||= []).push(fn); }
function emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }

// ─── Auth Actions ────────────────────────────────────────────
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
  try { await supa.auth.signOut(); } catch(e) { console.error(e); }
  state.user = null; state.profile = null; state.leagues = []; state.activeLeague = null; state.isSuperadmin = false;
  emit('auth:logout');
}

// ─── Data Loaders ────────────────────────────────────────────
async function loadProfile(userId) {
  const { data, error } = await supa.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) { console.warn('Profile load error (may not exist yet):', error.message); }
  // Auto-create profile if missing (user created before trigger existed)
  if (!data) {
    const email = state.user?.email || '';
    const { data: created, error: createErr } = await supa.from('profiles')
      .upsert({ id: userId, email, display_name: email.split('@')[0] }, { onConflict: 'id' })
      .select().maybeSingle();
    if (createErr) console.warn('Profile auto-create failed:', createErr.message);
    return created || { id: userId, email, role: 'user', plan_type: 'amateur', ai_trial_scans: 3 };
  }
  return data;
}

async function loadMyLeagues(userId) {
  const { data, error } = await supa.from('leagues').select('*').eq('admin_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
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

// ─── Public League Search ────────────────────────────────────
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

// ─── Session Handler ─────────────────────────────────────────
async function handleSession(session) {
  if (session?.user) {
    state.user = session.user;
    try {
      // Load profile and leagues — if either fails, still proceed with defaults
      let profile = null, leagues = [];
      try { profile = await loadProfile(session.user.id); } catch(e) { console.warn('Profile load failed, using defaults:', e); }
      try { leagues = await loadMyLeagues(session.user.id); } catch(e) { console.warn('Leagues load failed:', e); leagues = []; }
      state.profile = profile || { id: session.user.id, role: 'user', plan_type: 'amateur', ai_trial_scans: 3 };
      state.leagues = leagues || [];
      state.isSuperadmin = state.profile?.role === 'superadmin';
      state.loading = false;
      emit('auth:ready', state);
    } catch(e) {
      console.error('Session load failed:', e);
      state.loading = false;
      emit('auth:error', e);
    }
  } else {
    state.user = null; state.profile = null; state.leagues = []; state.activeLeague = null;
    state.loading = false;
    emit('auth:logout');
  }
}

function initAuth() {
  if (!supa) { try { supa = getSupabase(); } catch(e) { setTimeout(initAuth, 500); return; } }

  supa.auth.getSession()
    .then(({ data: { session } }) => handleSession(session))
    .catch(e => { console.error(e); state.loading = false; emit('auth:logout'); });

  supa.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_IN') await handleSession(session);
    else if (event === 'SIGNED_OUT') { state.user = null; state.loading = false; emit('auth:logout'); }
  });
}

export { supa, state, on, emit, signUp, signIn, signOut, createLeague, setActiveLeague, searchPublicLeagues, loadPublicLeague, loadMyLeagues, initAuth };
