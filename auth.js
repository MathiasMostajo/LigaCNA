// ═══════════════════════════════════════════════════════════════
// auth.js — Supabase Auth + League State (Bug fixes applied)
// ═══════════════════════════════════════════════════════════════
const SB_URL = 'https://wrgexwyjivfxijivdbqa.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyZ2V4d3lqaXZmeGlqaXZkYnFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NDI2NTgsImV4cCI6MjA4OTExODY1OH0.KGBX0-PQGiwrAHrWrZ1TS_rbHtDbQwNA0F2NRhlT830';

function getSupabase() {
  if (window.supabase?.createClient) return window.supabase.createClient(SB_URL, SB_KEY);
  throw new Error('Supabase SDK not loaded');
}

let supa;
try { supa = getSupabase(); } catch(e) { console.error(e); }

const state = { user: null, league: null, loading: true };

const listeners = {};
function on(event, fn) { (listeners[event] ||= []).push(fn); }
function emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }

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
  try {
    await supa.auth.signOut();
  } catch (e) {
    console.error('SignOut error (forcing local cleanup):', e);
  }
  // Always clean up local state even if Supabase call fails
  state.user = null;
  state.league = null;
  emit('auth:logout');
}

async function resolveLeague(userId) {
  const { data, error } = await supa
    .from('leagues')
    .select('*')
    .eq('admin_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createLeague(name, maxPlayers) {
  const { data, error } = await supa
    .from('leagues')
    .insert({ admin_id: state.user.id, name, max_players_per_team: maxPlayers })
    .select()
    .single();
  if (error) throw error;
  state.league = data;
  emit('auth:ready', state);
  return data;
}

// ─── Shared session handler (used by both getSession and onAuthStateChange) ──
async function handleSession(session) {
  if (session?.user) {
    state.user = session.user;
    try {
      state.league = await resolveLeague(session.user.id);
      state.loading = false;
      emit(state.league ? 'auth:ready' : 'auth:needs-onboarding', state);
    } catch (e) {
      console.error('resolveLeague failed:', e);
      state.loading = false;
      // Don't block — show login so user can retry
      emit('auth:error', e);
    }
  } else {
    state.user = null;
    state.league = null;
    state.loading = false;
    emit('auth:logout');
  }
}

function initAuth() {
  if (!supa) {
    try { supa = getSupabase(); } catch(e) {
      setTimeout(initAuth, 500);
      return;
    }
  }

  // BUG FIX 2: Added .catch() so loading screen never hangs
  supa.auth.getSession()
    .then(({ data: { session } }) => handleSession(session))
    .catch(e => {
      console.error('getSession failed:', e);
      state.loading = false;
      emit('auth:logout'); // Fallback to login screen instead of hanging
    });

  supa.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_IN') {
      await handleSession(session);
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      state.league = null;
      state.loading = false;
      emit('auth:logout');
    }
  });
}

export { supa, state, on, emit, signUp, signIn, signOut, createLeague, initAuth };
