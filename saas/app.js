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
      // Lazy-load section content
      if (section === 'teams') initTeamsSection();
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

// ═══════════════════════════════════════════════════════════════
// TEAMS MODULE
// ═══════════════════════════════════════════════════════════════
let _teamsCache = [];
let _playersCache = [];
let _activeTeamId = null;

async function loadTeams() {
  const { data, error } = await supa.from('teams').select('*')
    .eq('league_id', state.activeLeague.id)
    .eq('replaced', false)
    .order('created_at');
  if (error) { console.error(error); return []; }
  _teamsCache = data || [];
  return _teamsCache;
}

async function loadPlayers(teamId) {
  const filter = supa.from('players').select('*').eq('league_id', state.activeLeague.id);
  if (teamId) filter.eq('team_id', teamId);
  const { data, error } = await filter.order('goals', { ascending: false });
  if (error) { console.error(error); return []; }
  _playersCache = data || [];
  return _playersCache;
}

async function initTeamsSection() {
  const container = document.querySelector('[data-section="teams"]');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🏟</span>
        <h2 class="font-display text-3xl tracking-wide text-white">EQUIPOS</h2>
      </div>
      <button id="btn-add-team" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">+ Nuevo Equipo</button>
    </div>

    <!-- Create team form (hidden) -->
    <div id="team-create-form" class="hidden bg-pitch-800/60 border border-lime-400/20 rounded-2xl p-5 mb-4 glow">
      <h3 class="font-display text-lg text-white mb-4">🏟 Nuevo Equipo</h3>
      <div class="grid gap-3 md:grid-cols-3 mb-4">
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Nombre</label>
          <input id="new-team-name" type="text" placeholder="Ej: Peñarol" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none focus:border-lime-400/40 text-sm">
        </div>
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Código DT</label>
          <input id="new-team-code" type="text" placeholder="Ej: PEN2026" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none focus:border-lime-400/40 text-sm">
        </div>
        <div class="flex items-end gap-2">
          <button id="btn-confirm-team" class="flex-1 bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2.5 rounded-xl text-sm uppercase tracking-wider">Crear</button>
          <button id="btn-cancel-team" class="bg-pitch-700 text-gray-400 py-2.5 px-4 rounded-xl text-sm hover:bg-pitch-600 transition-all">✕</button>
        </div>
      </div>
      <div id="team-create-error" class="hidden text-sm text-center py-2 px-4 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20"></div>
    </div>

    <!-- Teams list -->
    <div id="teams-list" class="space-y-3">
      <div class="text-center py-8 text-gray-600"><svg class="animate-spin h-6 w-6 mx-auto mb-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Cargando equipos...</div>
    </div>

    <!-- Team detail (hidden, shown when clicking a team) -->
    <div id="team-detail" class="hidden mt-6"></div>
  `;

  // Bind events
  $('btn-add-team').onclick = () => {
    const maxTeams = state.activeLeague.max_teams || 10;
    if (_teamsCache.length >= maxTeams && !state.isSuperadmin) {
      toast(`⚠️ Límite de ${maxTeams} equipos alcanzado para tu plan`, true);
      return;
    }
    $('team-create-form').classList.toggle('hidden');
  };

  $('btn-cancel-team').onclick = () => $('team-create-form').classList.add('hidden');

  $('btn-confirm-team').onclick = async () => {
    const name = $('new-team-name').value.trim();
    const code = $('new-team-code').value.trim();
    const errEl = $('team-create-error');

    if (!name) { errEl.textContent = 'El nombre es obligatorio'; errEl.classList.remove('hidden'); return; }

    // Check duplicate name
    if (_teamsCache.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = 'Ya existe un equipo con ese nombre'; errEl.classList.remove('hidden'); return;
    }

    $('btn-confirm-team').disabled = true;
    $('btn-confirm-team').textContent = 'Creando...';

    try {
      const { data, error } = await supa.from('teams').insert({
        league_id: state.activeLeague.id,
        name,
        code: code || null,
      }).select().single();

      if (error) throw error;
      _teamsCache.push(data);
      $('team-create-form').classList.add('hidden');
      $('new-team-name').value = '';
      $('new-team-code').value = '';
      errEl.classList.add('hidden');
      renderTeamsList();
      toast('✅ Equipo creado');
    } catch(e) {
      errEl.textContent = e.message; errEl.classList.remove('hidden');
    }

    $('btn-confirm-team').disabled = false;
    $('btn-confirm-team').textContent = 'Crear';
  };

  // Load and render teams
  await loadTeams();
  renderTeamsList();
}

function renderTeamsList() {
  const el = $('teams-list');
  if (!el) return;

  if (!_teamsCache.length) {
    el.innerHTML = '<div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-2xl p-12 text-center"><span class="text-4xl mb-4 block">🏟</span><p class="text-gray-500 mb-2">No hay equipos todavía</p><p class="text-sm text-gray-600">Creá tu primer equipo para empezar</p></div>';
    return;
  }

  el.innerHTML = _teamsCache.filter(t => !t.is_bye).map(t => {
    const shieldHtml = t.shield_url
      ? `<img src="${t.shield_url}" class="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0">`
      : `<div class="w-10 h-10 rounded-full bg-pitch-700 border border-white/10 flex items-center justify-center text-lg font-display text-lime-400 shrink-0">${t.name.charAt(0)}</div>`;

    return `<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-4 hover:border-lime-400/20 transition-all cursor-pointer group" onclick="window._viewTeam('${t.id}')">
      <div class="flex items-center gap-4">
        ${shieldHtml}
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold text-white group-hover:text-lime-400 transition-colors truncate">${t.name}</h3>
          <div class="flex items-center gap-3 text-xs text-gray-500">
            ${t.code ? `<span>🔑 ${t.code}</span>` : ''}
            <span>${t.paid ? '✅ Pagó' : '❌ No pagó'}</span>
            ${t.is_bye ? '<span class="text-yellow-500">💤 Libre</span>' : ''}
          </div>
        </div>
        <span class="text-gray-600 group-hover:text-lime-400 transition-colors">→</span>
      </div>
    </div>`;
  }).join('');
}

// ─── Team Detail View ────────────────────────────────────────
window._viewTeam = async (teamId) => {
  _activeTeamId = teamId;
  const team = _teamsCache.find(t => t.id === teamId);
  if (!team) return;

  const players = await loadPlayers(teamId);
  const detail = $('team-detail');
  if (!detail) return;

  detail.innerHTML = `
    <div class="bg-pitch-800/60 border border-lime-400/20 rounded-2xl overflow-hidden glow">
      <!-- Header -->
      <div class="p-5 border-b border-white/5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-4">
            ${team.shield_url
              ? `<img src="${team.shield_url}" class="w-14 h-14 rounded-full object-cover border-2 border-lime-400/20">`
              : `<div class="w-14 h-14 rounded-full bg-pitch-700 border-2 border-lime-400/20 flex items-center justify-center text-2xl font-display text-lime-400">${team.name.charAt(0)}</div>`}
            <div>
              <h3 class="font-display text-2xl text-white">${team.name}</h3>
              <div class="flex items-center gap-3 text-xs text-gray-500">
                ${team.code ? `<span>🔑 ${team.code}</span>` : '<span class="text-yellow-500">Sin código DT</span>'}
                <span>👤 ${players.length} jugadores</span>
              </div>
            </div>
          </div>
          <button onclick="window._closeTeamDetail()" class="text-gray-500 hover:text-white transition-colors text-sm">✕ Cerrar</button>
        </div>

        <!-- Quick actions -->
        <div class="flex gap-2 flex-wrap">
          <button onclick="window._editTeam('${team.id}')" class="bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">✏️ Editar</button>
          <label class="bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer">
            🖼️ Escudo
            <input type="file" accept="image/*" class="hidden" onchange="window._uploadShield('${team.id}', event)">
          </label>
          <button onclick="window._togglePaid('${team.id}')" class="bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">${team.paid ? '❌ Marcar No Pagó' : '✅ Marcar Pagó'}</button>
          <button onclick="window._deleteTeam('${team.id}')" class="bg-red-500/5 border border-red-500/20 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ml-auto">🗑 Eliminar</button>
        </div>
      </div>

      <!-- Add player form -->
      <div class="p-4 border-b border-white/5 bg-pitch-900/20">
        <div class="flex gap-2">
          <input id="new-player-name" type="text" placeholder="Nombre del jugador" class="flex-1 bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-600 outline-none focus:border-lime-400/40 text-sm">
          <select id="new-player-pos" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2 text-white outline-none text-sm">
            <option value="">POS</option>
            <option value="POR">POR</option>
            <option value="DFC">DFC</option><option value="LI">LI</option><option value="LD">LD</option>
            <option value="MCD">MCD</option><option value="MC">MC</option><option value="MCO">MCO</option><option value="MI">MI</option><option value="MD">MD</option>
            <option value="EI">EI</option><option value="ED">ED</option><option value="DC">DC</option><option value="MP">MP</option>
          </select>
          <button onclick="window._addPlayer('${team.id}')" class="bg-lime-400/10 text-lime-400 border border-lime-400/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-lime-400/20 transition-all">+ Agregar</button>
        </div>
      </div>

      <!-- Players list -->
      <div class="p-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold">👤 Plantel (${players.length})</p>
          <div class="flex gap-1">
            ${['⚽ Goles','🎯 Asist','⭐ Rating','🎮 PJ'].map((lbl, i) => {
              const cols = ['goals','assists','rating','matches_played'];
              return `<button onclick="window._sortPlayers('${cols[i]}')" class="text-[10px] text-gray-600 hover:text-lime-400 px-2 py-1 rounded transition-all">${lbl}</button>`;
            }).join('')}
          </div>
        </div>
        <div id="team-players-list">
          ${renderPlayersHTML(players)}
        </div>
      </div>
    </div>
  `;

  detail.classList.remove('hidden');
  // Scroll to detail
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPlayersHTML(players) {
  if (!players.length) return '<div class="text-center py-6 text-gray-600 text-sm">Sin jugadores. Agregá el primero arriba ↑</div>';

  return players.map(p => {
    const avgRating = p.ratings?.length ? (p.ratings.reduce((a,b) => a + Number(b), 0) / p.ratings.length).toFixed(1) : '—';
    const posColor = (() => {
      const pos = (p.pos || '').toUpperCase();
      if (['POR','GK'].includes(pos)) return 'bg-orange-500';
      if (['DFC','LI','LD','CAI','CAD','CB','LB','RB'].includes(pos)) return 'bg-blue-500';
      if (['MCD','MC','MCO','MI','MD','CDM','CM','CAM'].includes(pos)) return 'bg-emerald-500';
      return 'bg-red-500';
    })();

    return `<div class="flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 group text-sm">
      <span class="${posColor} text-[10px] font-bold text-white px-1.5 py-0.5 rounded min-w-[28px] text-center">${p.pos || '?'}</span>
      <span class="flex-1 font-medium text-white truncate">${p.name}</span>
      <span class="text-gray-500">⚽${p.goals}</span>
      <span class="text-gray-500">🎯${p.assists}</span>
      <span class="text-yellow-400/80">⭐${avgRating}</span>
      <span class="text-gray-600">${p.matches_played}GP</span>
      <button onclick="event.stopPropagation(); window._removePlayer('${p.id}','${p.name}')" class="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs">✕</button>
    </div>`;
  }).join('');
}

window._closeTeamDetail = () => {
  _activeTeamId = null;
  const detail = $('team-detail');
  if (detail) { detail.classList.add('hidden'); detail.innerHTML = ''; }
};

// ─── Team Actions ────────────────────────────────────────────
window._addPlayer = async (teamId) => {
  const nameEl = $('new-player-name');
  const posEl = $('new-player-pos');
  const name = nameEl?.value.trim();
  const pos = posEl?.value || '';
  if (!name) { toast('⚠️ Nombre vacío', true); return; }

  // Check max players
  const maxP = state.activeLeague.max_players_per_team || 11;
  const currentPlayers = _playersCache.filter(p => p.team_id === teamId);
  if (currentPlayers.length >= maxP && !state.isSuperadmin) {
    toast(`⚠️ Límite de ${maxP} jugadores por equipo`, true); return;
  }

  // Check duplicate
  if (_playersCache.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    toast('⚠️ Ya existe un jugador con ese nombre', true); return;
  }

  try {
    const { data, error } = await supa.from('players').insert({
      league_id: state.activeLeague.id,
      team_id: teamId,
      name,
      pos: pos.toUpperCase(),
    }).select().single();
    if (error) throw error;

    nameEl.value = '';
    toast(`✅ ${name} agregado`);
    // Refresh team detail
    window._viewTeam(teamId);
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._removePlayer = async (playerId, playerName) => {
  if (!confirm(`¿Eliminar a ${playerName}? Esto borra todas sus estadísticas.`)) return;
  try {
    const { error } = await supa.from('players').delete().eq('id', playerId);
    if (error) throw error;
    toast(`🗑 ${playerName} eliminado`);
    window._viewTeam(_activeTeamId);
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._editTeam = (teamId) => {
  const team = _teamsCache.find(t => t.id === teamId);
  if (!team) return;

  const newName = prompt('Nuevo nombre:', team.name);
  if (newName === null) return;
  const newCode = prompt('Nuevo código DT:', team.code || '');

  (async () => {
    try {
      const updates = {};
      if (newName.trim()) updates.name = newName.trim();
      if (newCode !== null) updates.code = newCode.trim() || null;
      if (!Object.keys(updates).length) return;

      const { error } = await supa.from('teams').update(updates).eq('id', teamId);
      if (error) throw error;

      Object.assign(team, updates);
      renderTeamsList();
      window._viewTeam(teamId);
      toast('✅ Equipo actualizado');
    } catch(e) { toast('⚠️ ' + e.message, true); }
  })();
};

window._togglePaid = async (teamId) => {
  const team = _teamsCache.find(t => t.id === teamId);
  if (!team) return;
  try {
    const { error } = await supa.from('teams').update({ paid: !team.paid }).eq('id', teamId);
    if (error) throw error;
    team.paid = !team.paid;
    renderTeamsList();
    window._viewTeam(teamId);
    toast(team.paid ? '✅ Marcado como pagado' : '❌ Marcado como no pagado');
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._deleteTeam = async (teamId) => {
  const team = _teamsCache.find(t => t.id === teamId);
  if (!team) return;
  if (!confirm(`¿Eliminar ${team.name}? Se borrarán todos sus jugadores y partidos. No se puede deshacer.`)) return;

  try {
    const { error } = await supa.from('teams').delete().eq('id', teamId);
    if (error) throw error;
    _teamsCache = _teamsCache.filter(t => t.id !== teamId);
    window._closeTeamDetail();
    renderTeamsList();
    toast(`🗑 ${team.name} eliminado`);
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._uploadShield = async (teamId, event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('⚠️ Imagen muy grande (max 10MB)', true); return; }

  try {
    // Compress to 200x200 JPEG
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 200; canvas.height = 200;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 200, 200);
          const scale = Math.min(200 / img.width, 200 / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (200 - w) / 2, (200 - h) / 2, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Upload to Supabase Storage
    const fileName = `${teamId}.jpg`;
    const blob = await fetch(base64).then(r => r.blob());
    const { error: uploadErr } = await supa.storage.from('shields').upload(fileName, blob, { upsert: true, contentType: 'image/jpeg' });
    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: urlData } = supa.storage.from('shields').getPublicUrl(fileName);
    const shieldUrl = urlData.publicUrl + '?t=' + Date.now(); // bust cache

    // Update team record
    const { error: updateErr } = await supa.from('teams').update({ shield_url: shieldUrl }).eq('id', teamId);
    if (updateErr) throw updateErr;

    const team = _teamsCache.find(t => t.id === teamId);
    if (team) team.shield_url = shieldUrl;

    renderTeamsList();
    window._viewTeam(teamId);
    toast('🖼️ Escudo guardado');
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._sortPlayers = (col) => {
  const el = $('team-players-list');
  if (!el) return;
  const sorted = [..._playersCache].sort((a, b) => {
    if (col === 'rating') {
      const avgA = a.ratings?.length ? a.ratings.reduce((x,y) => x + Number(y), 0) / a.ratings.length : 0;
      const avgB = b.ratings?.length ? b.ratings.reduce((x,y) => x + Number(y), 0) / b.ratings.length : 0;
      return avgB - avgA;
    }
    return (b[col] || 0) - (a[col] || 0);
  });
  el.innerHTML = renderPlayersHTML(sorted);
};
