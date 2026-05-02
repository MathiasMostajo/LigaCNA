// ═══════════════════════════════════════════════════════════════
// app.js — App Orchestrator (cleaned up, no duplicate listeners)
// ═══════════════════════════════════════════════════════════════
import { state, on, signUp, signIn, signOut, createLeague, initAuth } from './auth.js';

const $ = id => document.getElementById(id);

// ─── Prevent duplicate listener binding ──────────────────────
let _loginBound = false;
let _onboardBound = false;
let _dashBound = false;

// ─── Screen Router ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('[data-screen]').forEach(el => el.classList.add('hidden'));
  const target = $(`screen-${id}`);
  if (target) target.classList.remove('hidden');
}

// ─── Login / Register ────────────────────────────────────────
function initLoginUI() {
  if (_loginBound) return;
  _loginBound = true;

  let isRegister = false;
  const submitBtn = $('auth-submit');
  const errorEl = $('auth-error');

  function setMode(register) {
    isRegister = register;
    $('auth-title').textContent = register ? 'Crear Cuenta' : 'Iniciar Sesión';
    $('auth-subtitle').textContent = register ? 'Registrate para administrar tu liga' : 'Accedé a tu liga';
    submitBtn.textContent = register ? 'Registrarme' : 'Entrar';
    const toggleText = $('auth-toggle-text');
    toggleText.innerHTML = register
      ? '¿Ya tenés cuenta? <button id="auth-toggle" class="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">Iniciar Sesión</button>'
      : '¿No tenés cuenta? <button id="auth-toggle" class="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">Registrate</button>';
    document.getElementById('auth-toggle').onclick = () => setMode(!isRegister);
    errorEl.classList.add('hidden');
  }

  function showError(msg, isError = true) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    errorEl.className = `mt-4 text-sm text-center py-2 px-4 rounded-lg ${isError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`;
  }

  submitBtn.onclick = async () => {
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    if (!email || !password) { showError('Completá email y contraseña'); return; }
    if (password.length < 6) { showError('Mínimo 6 caracteres en la contraseña'); return; }

    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>';

    try {
      if (isRegister) {
        await signUp(email, password);
        showError('✅ Revisá tu email para confirmar la cuenta', false);
      } else {
        await signIn(email, password);
        // auth:ready or auth:needs-onboarding fires automatically via onAuthStateChange
      }
    } catch (e) {
      showError(e.message);
    }
    submitBtn.disabled = false;
    submitBtn.textContent = origText;
  };

  $('auth-password').onkeydown = e => { if (e.key === 'Enter') submitBtn.click(); };
  setMode(false);
}

// ─── Onboarding ──────────────────────────────────────────────
function initOnboardingUI() {
  if (_onboardBound) return;
  _onboardBound = true;

  const submitBtn = $('onboard-submit');
  const errorEl = $('onboard-error');

  function showOnboardError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  submitBtn.onclick = async () => {
    const name = $('league-name').value.trim();
    const maxPlayers = parseInt($('league-max-players').value) || 11;
    if (!name || name.length < 3) { showOnboardError('El nombre debe tener al menos 3 caracteres'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando liga...';
    try {
      await createLeague(name, maxPlayers);
      // auth:ready fires automatically from createLeague
    } catch (e) {
      showOnboardError(e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear Liga →';
    }
  };
}

// ─── Dashboard ───────────────────────────────────────────────
function initDashboard() {
  if (_dashBound) return;
  _dashBound = true;

  // Populate league info
  const leagueName = $('dash-league-name');
  const leagueNameMobile = $('dash-league-name-mobile');
  const userEmail = $('dash-user-email');
  if (leagueName) leagueName.textContent = state.league.name;
  if (leagueNameMobile) leagueNameMobile.textContent = state.league.name;
  if (userEmail) userEmail.textContent = state.user.email;

  // Sidebar nav — single event delegation
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('bg-white/10'));
      btn.classList.add('bg-white/10');
      const section = btn.dataset.nav;
      document.querySelectorAll('[data-section]').forEach(s => s.classList.add('hidden'));
      const target = document.querySelector(`[data-section="${section}"]`);
      if (target) target.classList.remove('hidden');
    };
  });

  // Logout
  $('btn-logout').onclick = () => {
    _dashBound = false; // allow re-init on next login
    _loginBound = false;
    signOut();
  };

  // Mobile sidebar
  const sidebar = $('sidebar');
  const overlay = $('sidebar-overlay');
  $('btn-menu').onclick = () => { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); };
  overlay.onclick = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };
}

// ─── Auth Events → Screen Routing ────────────────────────────
on('auth:loading', () => showScreen('loading'));

on('auth:logout', () => {
  showScreen('auth');
  _loginBound = false; // reset for fresh binding
  initLoginUI();
});

on('auth:needs-onboarding', () => {
  showScreen('onboarding');
  _onboardBound = false;
  initOnboardingUI();
});

on('auth:ready', () => {
  showScreen('dashboard');
  _dashBound = false;
  initDashboard();
});

on('auth:error', (e) => {
  console.error('Auth error:', e);
  showScreen('auth');
  _loginBound = false;
  initLoginUI();
});

// ─── Boot ────────────────────────────────────────────────────
initAuth();
