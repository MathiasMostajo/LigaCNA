// ═══════════════════════════════════════════════════════════════
// auth.js — Supabase Auth + League State
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
  await supa.auth.signOut();
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

function initAuth() {
  if (!supa) {
    try { supa = getSupabase(); } catch(e) {
      setTimeout(initAuth, 500);
      return;
    }
  }

  supa.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      state.user = session.user;
      try {
        state.league = await resolveLeague(session.user.id);
        state.loading = false;
        emit(state.league ? 'auth:ready' : 'auth:needs-onboarding', state);
      } catch (e) {
        state.loading = false;
        emit('auth:error', e);
      }
    } else {
      state.loading = false;
      emit('auth:logout');
    }
  });

  supa.auth.onAuthStateChange(async (event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_IN' && session?.user) {
      state.user = session.user;
      try {
        state.league = await resolveLeague(session.user.id);
        state.loading = false;
        emit(state.league ? 'auth:ready' : 'auth:needs-onboarding', state);
      } catch (e) {
        state.loading = false;
        emit('auth:error', e);
      }
    } else if (event === 'SIGNED_OUT') {
      state.user = null;
      state.league = null;
      state.loading = false;
      emit('auth:logout');
    }
  });
}

export { supa, state, on, emit, signUp, signIn, signOut, createLeague, initAuth };
