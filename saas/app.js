// ═══════════════════════════════════════════════════════════════
// app.js v5 — 4-state navigation (Public, Auth, Hub, Dashboard)
// ═══════════════════════════════════════════════════════════════
import { supa, state, on, emit, signUp, signIn, signOut, createLeague, setActiveLeague, searchPublicLeagues, loadPublicLeague, initAuth } from './auth.js';

const $ = id => document.getElementById(id);
let _bound = { login: false, hub: false, dash: false, public: false };

function showScreen(id) {
  document.querySelectorAll('[data-screen]').forEach(el => el.classList.add('hidden'));
  const t = $(`screen-${id}`); if (t) t.classList.remove('hidden');
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `fixed bottom-4 right-4 z-[9999] px-5 py-3 rounded-xl text-sm font-semibold shadow-xl ${isError ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-pitch-900'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// STATE 1: PUBLIC HOME
// ═══════════════════════════════════════════════════════════════
function initPublicUI() {
  if (_bound.public) return; _bound.public = true;

  $('btn-goto-login').onclick = () => { showScreen('auth'); _bound.login = false; initLoginUI(); };

  let searchTimeout;
  $('public-search').oninput = (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) { $('public-results').classList.add('hidden'); return; }
    searchTimeout = setTimeout(async () => {
      try {
        const leagues = await searchPublicLeagues(q);
        const el = $('public-results');
        if (!leagues.length) { el.innerHTML = '<div class="p-4 text-sm text-gray-500">No se encontraron ligas</div>'; }
        else {
          el.innerHTML = leagues.map(l => `<button onclick="window._viewPublicLeague('${l.slug}')" class="w-full text-left px-4 py-3 hover:bg-white/5 transition-all border-b border-white/5 last:border-0">
            <div class="font-semibold text-white text-sm">${l.name}</div>
            <div class="text-xs text-gray-500">${l.max_teams} equipos · ${l.slug}</div>
          </button>`).join('');
        }
        el.classList.remove('hidden');
      } catch(e) { console.error(e); }
    }, 300);
  };

  // Close results on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#public-search') && !e.target.closest('#public-results')) {
      $('public-results')?.classList.add('hidden');
    }
  });
}

window._viewPublicLeague = async (slug) => {
  $('public-results').classList.add('hidden');
  $('public-search').value = '';
  try {
    const league = await loadPublicLeague(slug);
    if (!league) { toast('Liga no encontrada', true); return; }

    // Load public data
    const [teamsRes, matchesRes, playersRes] = await Promise.all([
      supa.from('teams').select('*').eq('league_id', league.id).eq('is_bye', false).eq('replaced', false),
      supa.from('matches').select('*').eq('league_id', league.id).order('created_at', { ascending: false }).limit(20),
      supa.from('players').select('*').eq('league_id', league.id).order('goals', { ascending: false }).limit(20),
    ]);

    const teams = teamsRes.data || [], matches = matchesRes.data || [], players = playersRes.data || [];
    const tn = id => teams.find(t => t.id === id)?.name || '?';

    const content = $('public-league-content');
    content.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="font-display text-3xl text-white">${league.name}</h2>
          <p class="text-sm text-gray-500">${teams.length} equipos · ${matches.length} partidos jugados</p>
        </div>
        <button onclick="document.getElementById('public-league-view').classList.add('hidden')" class="text-gray-500 hover:text-white text-sm">✕ Cerrar</button>
      </div>
      <!-- Standings -->
      <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
        <h3 class="font-display text-lg text-lime-400 mb-3">📊 TABLA</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-gray-500 text-xs uppercase"><th class="text-left py-2">#</th><th class="text-left">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Pts</th></tr></thead>
            <tbody>${buildPublicStandings(teams, matches)}</tbody>
          </table>
        </div>
      </div>
      <!-- Top scorers -->
      <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
        <h3 class="font-display text-lg text-lime-400 mb-3">⚽ GOLEADORES</h3>
        ${players.filter(p=>p.goals>0).slice(0,10).map((p,i) => `<div class="flex items-center justify-between py-2 border-b border-white/5 text-sm">
          <div class="flex items-center gap-2"><span class="text-gray-600 w-5">${i+1}</span><span class="text-white font-medium">${p.name}</span><span class="text-gray-600 text-xs">${tn(p.team_id)}</span></div>
          <div class="flex gap-3"><span>⚽ ${p.goals}</span><span class="text-gray-600">🎯 ${p.assists}</span></div>
        </div>`).join('') || '<p class="text-gray-600 text-sm">Sin datos</p>'}
      </div>
      <!-- Recent matches -->
      <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5">
        <h3 class="font-display text-lg text-lime-400 mb-3">🕹 ÚLTIMOS PARTIDOS</h3>
        ${matches.slice(0,10).map(m => `<div class="flex items-center justify-between py-2 border-b border-white/5 text-sm">
          <span class="text-white">${tn(m.home_id)}</span>
          <span class="font-display text-lg text-lime-400">${m.home_goals} – ${m.away_goals}</span>
          <span class="text-white">${tn(m.away_id)}</span>
        </div>`).join('') || '<p class="text-gray-600 text-sm">Sin partidos</p>'}
      </div>
    `;
    $('public-league-view').classList.remove('hidden');
  } catch(e) { toast('Error: ' + e.message, true); }
};

function buildPublicStandings(teams, matches) {
  const s = {};
  teams.forEach(t => { s[t.id] = { name: t.name, P:0, W:0, D:0, L:0, GF:0, GA:0, Pts:0 }; });
  matches.forEach(m => {
    if (!s[m.home_id] || !s[m.away_id]) return;
    s[m.home_id].P++; s[m.away_id].P++;
    s[m.home_id].GF += m.home_goals; s[m.home_id].GA += m.away_goals;
    s[m.away_id].GF += m.away_goals; s[m.away_id].GA += m.home_goals;
    if (m.home_goals > m.away_goals) { s[m.home_id].W++; s[m.home_id].Pts += 3; s[m.away_id].L++; }
    else if (m.home_goals < m.away_goals) { s[m.away_id].W++; s[m.away_id].Pts += 3; s[m.home_id].L++; }
    else { s[m.home_id].D++; s[m.away_id].D++; s[m.home_id].Pts++; s[m.away_id].Pts++; }
  });
  return Object.values(s).sort((a,b) => b.Pts - a.Pts || (b.GF-b.GA) - (a.GF-a.GA)).map((t,i) =>
    `<tr class="border-b border-white/5"><td class="py-2 ${i<3?'text-lime-400 font-bold':'text-gray-500'}">${i+1}</td><td class="font-medium text-white">${t.name}</td><td class="text-center text-gray-400">${t.P}</td><td class="text-center text-gray-400">${t.W}</td><td class="text-center text-gray-400">${t.D}</td><td class="text-center text-gray-400">${t.L}</td><td class="text-center text-gray-400">${t.GF}</td><td class="text-center text-gray-400">${t.GA}</td><td class="text-center font-bold text-white">${t.Pts}</td></tr>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// STATE 2: AUTH (Login/Register)
// ═══════════════════════════════════════════════════════════════
function initLoginUI() {
  if (_bound.login) return; _bound.login = true;
  let isRegister = false;
  const submitBtn = $('auth-submit'), errorEl = $('auth-error');

  function setMode(register) {
    isRegister = register;
    $('auth-title').textContent = register ? 'Crear Cuenta' : 'Iniciar Sesión';
    $('auth-subtitle').textContent = register ? 'Registrate para administrar tu liga' : 'Accedé a tu liga';
    submitBtn.textContent = register ? 'Registrarme' : 'Entrar';
    $('auth-toggle-text').innerHTML = register
      ? '¿Ya tenés cuenta? <button id="auth-toggle" class="text-emerald-400 hover:text-emerald-300 font-semibold">Iniciar Sesión</button>'
      : '¿No tenés cuenta? <button id="auth-toggle" class="text-emerald-400 hover:text-emerald-300 font-semibold">Registrate</button>';
    document.getElementById('auth-toggle').onclick = () => setMode(!isRegister);
    errorEl.classList.add('hidden');
  }

  function showError(msg, isErr = true) {
    errorEl.textContent = msg; errorEl.classList.remove('hidden');
    errorEl.className = `mt-4 text-sm text-center py-2 px-4 rounded-lg ${isErr ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`;
  }

  submitBtn.onclick = async () => {
    const email = $('auth-email').value.trim(), password = $('auth-password').value;
    if (!email || !password) { showError('Completá email y contraseña'); return; }
    if (password.length < 6) { showError('Mínimo 6 caracteres'); return; }
    submitBtn.disabled = true; const orig = submitBtn.textContent;
    submitBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>';
    try {
      if (isRegister) { await signUp(email, password); showError('✅ Revisá tu email para confirmar', false); }
      else { await signIn(email, password); }
    } catch(e) { showError(e.message); }
    finally { submitBtn.disabled = false; submitBtn.textContent = orig; }
  };

  $('auth-password').onkeydown = e => { if (e.key === 'Enter') submitBtn.click(); };
  $('btn-back-public').onclick = () => showScreen('public');
  setMode(false);
}

// ═══════════════════════════════════════════════════════════════
// STATE 3: ADMIN HUB (my leagues list)
// ═══════════════════════════════════════════════════════════════
function initHubUI() {
  if (_bound.hub) return; _bound.hub = true;

  // User info
  const emailEl = $('hub-user-email');
  if (emailEl) emailEl.textContent = state.user.email;

  const badgeEl = $('hub-plan-badge');
  if (badgeEl) {
    const plan = state.profile?.plan_type || 'amateur';
    const colors = { superadmin: 'border-yellow-400/30 text-yellow-400', elite: 'border-purple-400/30 text-purple-400', pro: 'border-lime-400/30 text-lime-400', amateur: 'border-gray-600 text-gray-500' };
    badgeEl.className = `text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold ${colors[plan] || colors.amateur}`;
    badgeEl.textContent = plan;
  }

  // Render leagues
  renderHubLeagues();

  // Create league toggle
  $('btn-create-league').onclick = () => $('hub-create-form').classList.toggle('hidden');
  $('btn-cancel-create').onclick = () => $('hub-create-form').classList.add('hidden');

  $('btn-confirm-create').onclick = async () => {
    const name = $('new-league-name').value.trim();
    const maxP = parseInt($('new-league-max').value) || 11;
    const errEl = $('hub-create-error');
    if (!name || name.length < 3) { errEl.textContent = 'Mínimo 3 caracteres'; errEl.classList.remove('hidden'); return; }

    $('btn-confirm-create').disabled = true; $('btn-confirm-create').textContent = 'Creando...';
    try {
      await createLeague(name, maxP);
      $('hub-create-form').classList.add('hidden');
      $('new-league-name').value = '';
      renderHubLeagues();
      toast('✅ Liga creada');
    } catch(e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
    $('btn-confirm-create').disabled = false; $('btn-confirm-create').textContent = 'Crear →';
  };

  $('btn-hub-logout').onclick = () => { Object.keys(_bound).forEach(k => _bound[k] = false); signOut(); };
}

function renderHubLeagues() {
  const el = $('hub-leagues-list'); if (!el) return;
  if (!state.leagues.length) {
    el.innerHTML = '<div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-2xl p-12 text-center"><span class="text-4xl mb-4 block">🏆</span><p class="text-gray-500 mb-2">No tenés ligas todavía</p><p class="text-sm text-gray-600">Creá tu primera liga para empezar a gestionar torneos</p></div>';
    return;
  }

  el.innerHTML = state.leagues.map(l => {
    const planColors = { superadmin: 'bg-yellow-400/10 text-yellow-400', elite: 'bg-purple-400/10 text-purple-400', pro: 'bg-lime-400/10 text-lime-400', amateur: 'bg-gray-500/10 text-gray-500' };
    const planClass = planColors[l.plan_type] || planColors.amateur;
    return `<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-3 hover:border-lime-400/20 transition-all glow">
      <div class="flex items-center justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="font-display text-xl text-white truncate">${l.name}</h3>
            <span class="text-[10px] uppercase px-2 py-0.5 rounded-full font-semibold ${planClass}">${l.plan_type}</span>
          </div>
          <div class="flex items-center gap-4 text-xs text-gray-500">
            <span>📝 ${l.slug}</span>
            <span>🏟 Máx ${l.max_teams} equipos</span>
            <span>${l.is_public ? '🌐 Pública' : '🔒 Privada'}</span>
          </div>
        </div>
        <button onclick="window._manageLeague('${l.id}')" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shrink-0 ml-4">Gestionar →</button>
      </div>
    </div>`;
  }).join('');
}

window._manageLeague = (leagueId) => {
  const league = state.leagues.find(l => l.id === leagueId);
  if (!league) return;
  setActiveLeague(league);
};

// ═══════════════════════════════════════════════════════════════
// STATE 4: LEAGUE DASHBOARD
// ═══════════════════════════════════════════════════════════════
function initDashboard() {
  if (_bound.dash) return; _bound.dash = true;

  const league = state.activeLeague;
  if (!league) return;

  const ln = $('dash-league-name');
  const lnm = $('dash-league-name-mobile');
  const ue = $('dash-user-email');
  if (ln) ln.textContent = league.name;
  if (lnm) lnm.textContent = league.name;
  if (ue) ue.textContent = state.user.email;

  // Sidebar nav
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

  // Back to hub
  $('btn-back-hub').onclick = () => {
    state.activeLeague = null;
    _bound.dash = false;
    showScreen('hub');
  };

  // Logout
  const logoutBtn = $('btn-logout');
  if (logoutBtn) logoutBtn.onclick = async () => { Object.keys(_bound).forEach(k => _bound[k] = false); await signOut(); };

  // Mobile sidebar
  const sidebar = $('sidebar'), overlay = $('sidebar-overlay');
  $('btn-menu').onclick = () => { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); };
  overlay.onclick = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };
}

// ═══════════════════════════════════════════════════════════════
// AUTH EVENT ROUTING
// ═══════════════════════════════════════════════════════════════
on('auth:loading', () => showScreen('loading'));

on('auth:logout', () => {
  showScreen('public');
  _bound.login = false;
  _bound.public = false;
  initPublicUI();
});

on('auth:ready', () => {
  showScreen('hub');
  _bound.hub = false;
  initHubUI();
});

on('auth:error', (e) => {
  console.error(e);
  showScreen('public');
  _bound.public = false;
  initPublicUI();
});

on('league:selected', () => {
  showScreen('dashboard');
  _bound.dash = false;
  initDashboard();
});

// ─── Boot ────────────────────────────────────────────────────
initAuth();

// Loading timeout fallback
setTimeout(() => {
  if (state.loading) {
    state.loading = false;
    showScreen('public');
    _bound.public = false;
    initPublicUI();
  }
}, 10000);
