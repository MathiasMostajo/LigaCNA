// ═══════════════════════════════════════════════════════════════
// app.js v6 — Entry point (imports all modules)
// ═══════════════════════════════════════════════════════════════
import { supa, state, on, emit, signUp, signIn, signOut, createLeague, setActiveLeague, searchPublicLeagues, loadPublicLeague, loadMyMemberships, initAuth } from './auth.js';
import { $, showScreen, showLoading, toast, getPlanLimits, cache, getSeasonId, loadSeasons, loadTeams, loadPlayers, loadMatches, tn } from './shared.js';
import { initTeamsSection, renderTeamsList } from './teams.js';
import { initFixtureSection, initStandingsSection, calculateStandings } from './fixture.js';
import { initLeadersSection } from './leaders.js';
import { initSettingsSection, initInboxSection, initAdminScannerSection, initTransfersSection, initPlayoffsSection, renderPlayoffsBracket } from './admin.js';
import { dtState, initPublicDTButton, showDTCodeEntry, showDTSubmissionForm, showDTAuthenticatedView, showDTConfirmation, renderHubMemberships } from './dt.js';

let _bound = { login: false, hub: false, dash: false, public: false };

function initPublicUI() {
  if (_bound.public) return; _bound.public = true;

  $('btn-goto-login').onclick = () => { showScreen('auth'); _bound.login = false; initLoginUI(); };
  initPublicDTButton();

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
          el.innerHTML = leagues.map(l => `<button onclick="window.location.hash='#/liga/${l.slug}'" class="w-full text-left px-4 py-3 hover:bg-white/5 transition-all border-b border-white/5 last:border-0">
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
  $('public-results')?.classList.add('hidden');
  if ($('public-search')) $('public-search').value = '';

  // Make sure we're on the public screen
  showScreen('public');

  const content = $('public-league-content');
  showLoading(content, 'Cargando liga...');

  // Hide landing content, show league view
  const landingContent = document.querySelector('#screen-public > .slide-up');
  const footer = document.querySelector('#screen-public > footer');
  if (landingContent) landingContent.classList.add('hidden');
  if (footer) footer.classList.add('hidden');
  $('public-league-view').classList.remove('hidden');

  try {
    const league = await loadPublicLeague(slug);
    if (!league) {
      toast('Liga no encontrada', true);
      // Restore landing
      if (landingContent) landingContent.classList.remove('hidden');
      if (footer) footer.classList.remove('hidden');
      $('public-league-view').classList.add('hidden');
      return;
    }

    // Load public data
    const [teamsRes, matchesRes, playersRes] = await Promise.all([
      supa.from('teams').select('*').eq('league_id', league.id).eq('is_bye', false).eq('replaced', false),
      supa.from('matches').select('*').eq('league_id', league.id).order('created_at', { ascending: false }).limit(20),
      supa.from('players').select('*').eq('league_id', league.id).order('goals', { ascending: false }).limit(20),
    ]);

    const teams = teamsRes.data || [], matches = matchesRes.data || [], players = playersRes.data || [];
    const tn = id => teams.find(t => t.id === id)?.name || '?';

    content.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display text-3xl text-white">${league.name}</h2>
          <p class="text-sm text-gray-500">${teams.length} equipos · ${matches.length} partidos jugados</p>
        </div>
        <button onclick="window._closePublicLeague()" class="text-gray-500 hover:text-white text-sm">✕ Cerrar</button>
      </div>

      <!-- Public view tabs -->
      <div class="flex gap-1 mb-4 overflow-x-auto pb-1">
        <button onclick="document.querySelectorAll('[data-pub-section]').forEach(s=>s.classList.add('hidden'));document.getElementById('pub-tabla').classList.remove('hidden')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20 shrink-0">📊 Tabla</button>
        <button onclick="document.querySelectorAll('[data-pub-section]').forEach(s=>s.classList.add('hidden'));document.getElementById('pub-fixture').classList.remove('hidden')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📅 Fixture</button>
        <button onclick="document.querySelectorAll('[data-pub-section]').forEach(s=>s.classList.add('hidden'));document.getElementById('pub-goleadores').classList.remove('hidden')" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">⚽ Goleadores</button>
      </div>

      <!-- Ad banner for public view -->
      <div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-xl p-3 mb-4 text-center">
        <p class="text-[10px] text-gray-700 uppercase tracking-wider">Espacio publicitario</p>
      </div>
      <!-- Standings -->
      <div id="pub-tabla" data-pub-section class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
        <h3 class="font-display text-lg text-lime-400 mb-3">📊 TABLA</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-gray-500 text-xs uppercase"><th class="text-left py-2">#</th><th class="text-left">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Pts</th></tr></thead>
            <tbody>${buildPublicStandings(teams, matches)}</tbody>
          </table>
        </div>
      </div>
      <!-- Top scorers -->
      <div id="pub-goleadores" data-pub-section class="hidden bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
        <h3 class="font-display text-lg text-lime-400 mb-3">⚽ GOLEADORES</h3>
        ${players.filter(p=>p.goals>0).slice(0,10).map((p,i) => `<div class="flex items-center justify-between py-2 border-b border-white/5 text-sm">
          <div class="flex items-center gap-2"><span class="text-gray-600 w-5">${i+1}</span><span class="text-white font-medium">${p.name}</span><span class="text-gray-600 text-xs">${tn(p.team_id)}</span></div>
          <div class="flex gap-3"><span>⚽ ${p.goals}</span><span class="text-gray-600">🎯 ${p.assists}</span></div>
        </div>`).join('') || '<p class="text-gray-600 text-sm">Sin datos</p>'}
      </div>
      <!-- Recent matches / Fixture -->
      <div id="pub-fixture" data-pub-section class="hidden bg-pitch-800/60 border border-white/5 rounded-2xl p-5">
        <h3 class="font-display text-lg text-lime-400 mb-3">📅 PARTIDOS</h3>
        ${matches.slice(0,10).map(m => `<div class="flex items-center justify-between py-2 border-b border-white/5 text-sm">
          <span class="text-white">${tn(m.home_id)}</span>
          <span class="font-display text-lg text-lime-400">${m.home_goals} – ${m.away_goals}</span>
          <span class="text-white">${tn(m.away_id)}</span>
        </div>`).join('') || '<p class="text-gray-600 text-sm">Sin partidos</p>'}
      </div>
    `;
    window.scrollTo(0, 0);
  } catch(e) {
    toast('Error: ' + e.message, true);
    window._closePublicLeague();
  }
};

window._closePublicLeague = () => {
  $('public-league-view').classList.add('hidden');
  const landingContent = document.querySelector('#screen-public > .slide-up');
  const footer = document.querySelector('#screen-public > footer');
  if (landingContent) landingContent.classList.remove('hidden');
  if (footer) footer.classList.remove('hidden');
  window.location.hash = '';
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
    $('auth-subtitle').textContent = register ? 'Creá tu cuenta para gestionar o jugar' : 'Accedé a tu cuenta';
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
    if (state.isSuperadmin) {
      // Superadmin gets a dropdown to switch plans for testing
      badgeEl.outerHTML = `<select id="plan-switcher" class="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold bg-transparent border-yellow-400/30 text-yellow-400 outline-none cursor-pointer">
        <option value="superadmin" ${plan==='superadmin'?'selected':''}>⚡ SUPERADMIN</option>
        <option value="elite" ${plan==='elite'?'selected':''}>💎 ELITE</option>
        <option value="pro" ${plan==='pro'?'selected':''}>🟢 PRO</option>
        <option value="amateur" ${plan==='amateur'?'selected':''}>⚪ AMATEUR</option>
      </select>`;
      const switcher = $('plan-switcher');
      if (switcher) {
        switcher.onchange = async () => {
          const newPlan = switcher.value;
          try {
            // Only update profile plan — existing leagues keep their original plan
            await supa.from('profiles').update({ plan_type: newPlan }).eq('id', state.user.id);
            state.profile.plan_type = newPlan;
            renderHubLeagues(); // re-render to show updated badge
            toast('✅ Plan cambiado a ' + newPlan.toUpperCase() + '. Las ligas nuevas usarán este plan.');
          } catch(e) { toast('⚠️ ' + e.message, true); }
        };
      }
    } else {
      badgeEl.className = `text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold ${colors[plan] || colors.amateur}`;
      badgeEl.textContent = plan;
    }
  }

  // Render leagues AND DT memberships
  renderHubLeagues();
  renderHubMemberships();

  // Create league toggle
  $('btn-create-league').onclick = () => $('hub-create-form').classList.toggle('hidden');
  $('btn-cancel-create').onclick = () => $('hub-create-form').classList.add('hidden');

  $('btn-confirm-create').onclick = async () => {
    const name = $('new-league-name').value.trim();
    const errEl = $('hub-create-error');
    if (!name || name.length < 3) { errEl.textContent = 'Mínimo 3 caracteres'; errEl.classList.remove('hidden'); return; }

    $('btn-confirm-create').disabled = true; $('btn-confirm-create').textContent = 'Creando...';
    try {
      await createLeague(name);
      $('hub-create-form').classList.add('hidden');
      $('new-league-name').value = '';
      renderHubLeagues();
      toast('✅ Liga creada');
    } catch(e) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
    $('btn-confirm-create').disabled = false; $('btn-confirm-create').textContent = 'Crear →';
  };

  $('btn-hub-logout').onclick = async () => {
    Object.keys(_bound).forEach(k => _bound[k] = false);
    try { await signOut(); } catch(e) { console.error(e); }
    setTimeout(() => window.location.reload(), 1000);
  };
}

function renderHubLeagues() {
  const el = $('hub-leagues-list'); if (!el) return;
  let html = '';

  // Admin section (DT section is handled by renderHubMemberships in dt.js)
  html += '<h3 class="font-display text-lg text-gray-400 mb-3">🏆 Mis Ligas (Admin)</h3>';
  if (state.leagues.length) {
    html += state.leagues.map(l => {
      const planColors = { superadmin: 'bg-yellow-400/10 text-yellow-400', elite: 'bg-purple-400/10 text-purple-400', pro: 'bg-lime-400/10 text-lime-400', amateur: 'bg-gray-500/10 text-gray-500' };
      const planClass = planColors[l.plan_type] || planColors.amateur;
      return '<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-3 hover:border-lime-400/20 transition-all glow"><div class="flex items-center justify-between"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><h3 class="font-display text-xl text-white truncate">' + l.name + '</h3><span class="text-[10px] uppercase px-2 py-0.5 rounded-full font-semibold ' + planClass + '">' + l.plan_type + '</span></div><div class="flex items-center gap-4 text-xs text-gray-500"><span>' + (l.is_public ? '🌐 Pública' : '🔒 Privada') + '</span></div></div><button onclick="window._manageLeague(\'' + l.id + '\')" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shrink-0 ml-4">Gestionar \u2192</button></div></div>';
    }).join('');
  } else {
    html += '<div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-xl p-4 mb-2 text-center text-sm text-gray-600">No tenés ligas. Creá tu primera liga arriba.</div>';
  }

  el.innerHTML = html;
}

window._manageLeague = (leagueId) => {
  const league = state.leagues.find(l => l.id === leagueId);
  if (!league) return;
  // Clear all caches AND section content when switching leagues
  cache.teams = [];
  cache.players = [];
  cache.matches = [];
  cache.schedule = [];
  cache.seasons = [];
  cache.activeTeamId = null;
  // Reset all section HTML so they reload fresh for the new league
  document.querySelectorAll('[data-section]').forEach(el => {
    const section = el.getAttribute('data-section');
    const titles = { inbox:'📥 BANDEJA', scanner:'🤖 ESCÁNER IA', fixture:'📅 FIXTURE', standings:'📊 TABLA', teams:'🏟 EQUIPOS', leaders:'⭐ LÍDERES', transfers:'📋 FICHAJES', settings:'⚙️ AJUSTES' };
    el.innerHTML = '<div class="flex items-center gap-3 mb-6"><h2 class="font-display text-3xl tracking-wide text-white">' + (titles[section] || section) + '</h2></div><div class="text-center py-8 text-gray-600">Cargando...</div>';
  });
  _bound.dash = false;

  // Show interstitial ad for Amateur plan (non-superadmin)
  if (league.plan_type === 'amateur' && !state.isSuperadmin) {
    showAdInterstitial(() => setActiveLeague(league));
  } else {
    setActiveLeague(league);
  }
};

function showAdInterstitial(onComplete) {
  // Create fullscreen interstitial
  const overlay = document.createElement('div');
  overlay.id = 'ad-interstitial';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0a0f0a;display:flex;flex-direction:column;align-items:center;justify-content:center;';

  let seconds = 5;
  overlay.innerHTML = `
    <div style="max-width:400px;text-align:center;padding:20px;">
      <div style="border:2px dashed rgba(255,255,255,.1);border-radius:16px;padding:40px 20px;margin-bottom:24px;background:rgba(255,255,255,.02);">
        <p style="color:rgba(255,255,255,.3);font-size:14px;font-family:'Barlow Condensed',sans-serif;letter-spacing:2px;text-transform:uppercase;">Espacio publicitario</p>
        <p style="color:rgba(255,255,255,.15);font-size:12px;margin-top:8px;">Tu anuncio aquí — contacta al administrador</p>
      </div>
      <p style="color:rgba(255,255,255,.4);font-size:13px;font-family:'Barlow Condensed',sans-serif;">
        Cargando liga en <span id="ad-countdown" style="color:#00ff87;font-weight:700;font-size:18px;">${seconds}</span> segundos
      </p>
      <p style="color:rgba(255,255,255,.2);font-size:11px;margin-top:12px;">
        ✨ <a href="#" onclick="event.preventDefault();clearInterval(timer);overlay.remove();window._showUpgradePage()" style="color:#00ff87;text-decoration:underline;">Actualizá a Pro</a> para eliminar anuncios
      </p>
    </div>
  `;

  document.body.appendChild(overlay);

  const timer = setInterval(() => {
    seconds--;
    const el = document.getElementById('ad-countdown');
    if (el) el.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(timer);
      overlay.remove();
      onComplete();
    }
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════
// STATE 4: LEAGUE DASHBOARD
// ═══════════════════════════════════════════════════════════════
// Update URL hash when entering a league
function updateURLHash(slug) {
  if (slug) window.location.hash = '#/liga/' + slug;
}

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

  // Load seasons and render selector
  loadSeasons().then(seasons => {
    const container = $('season-selector');
    if (!container || !seasons.length) return;

    const activeSeason = seasons.find(s => s.id === league.active_season_id) || seasons[0];
    const isAdmin = league.admin_id === state.user?.id;

    container.innerHTML = `
      <div class="flex items-center gap-2">
        <select id="season-dropdown" class="bg-pitch-900/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-lime-400/30 cursor-pointer">
          ${seasons.map(s => `<option value="${s.id}" ${s.id === activeSeason.id ? 'selected' : ''}>${s.name}${s.status === 'archived' ? ' 📁' : ' ⚽'}</option>`).join('')}
        </select>
        ${isAdmin ? `
          <button id="btn-new-season" class="text-[10px] text-lime-400 hover:text-lime-300 font-semibold border border-lime-400/20 rounded-lg px-2 py-1">+ Nueva</button>
          ${seasons.length > 1 ? `<button id="btn-delete-season" class="text-[10px] text-red-400 hover:text-red-300 border border-red-400/20 rounded-lg px-1.5 py-1" title="Borrar temporada seleccionada">🗑</button>` : ''}
        ` : ''}
      </div>
    `;

    $('season-dropdown').onchange = (e) => {
      window._switchSeason(e.target.value);
    };

    if ($('btn-new-season')) {
      $('btn-new-season').onclick = () => window._createNewSeason();
    }

    if ($('btn-delete-season')) {
      $('btn-delete-season').onclick = () => window._deleteSeason();
    }
  });

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
      if (section === 'inbox') initInboxSection();
      if (section === 'scanner') initAdminScannerSection();
      if (section === 'teams') initTeamsSection();
      if (section === 'fixture') { initFixtureSection().then(() => { if (state.activeLeague.settings?.playoffs) renderPlayoffsBracket(); }); }
      if (section === 'standings') initStandingsSection();
      if (section === 'leaders') initLeadersSection();
      if (section === 'transfers') initTransfersSection();
      if (section === 'settings') initSettingsSection();
    };
  });

  // Back to hub — clear all caches
  $('btn-back-hub').onclick = () => {
    window.location.hash = '';
    state.activeLeague = null;
    cache.teams = [];
    cache.players = [];
    cache.matches = [];
    cache.schedule = [];
    cache.activeTeamId = null;
    _bound.dash = false;
    showScreen('hub');
  };

  // Logout — bind with force reload fallback
  const doLogout = async () => {
    Object.keys(_bound).forEach(k => _bound[k] = false);
    try { await signOut(); } catch(e) { console.error(e); }
    // If still on dashboard after 1s, force reload
    setTimeout(() => window.location.reload(), 1000);
  };
  const logoutBtn = $('btn-logout');
  if (logoutBtn) logoutBtn.onclick = doLogout;

  // Mobile sidebar
  const sidebar = $('sidebar'), overlay = $('sidebar-overlay');
  $('btn-menu').onclick = () => { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); };
  overlay.onclick = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };

  // Load inbox badge count
  supa.from('submissions').select('*', { count: 'exact', head: true })
    .eq('league_id', state.activeLeague.id).eq('status', 'pending')
    .then(({ count }) => {
      const badge = $('inbox-badge');
      if (badge && count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
    }).catch(() => {});

  // Show trial countdown
  setTimeout(renderTrialBanner, 500);
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

// Hash routing for shareable URLs
function handleHashRoute() {
  const hash = window.location.hash;
  if (hash.startsWith('#/liga/')) {
    const slug = hash.replace('#/liga/', '');
    if (slug) {
      supa.from('leagues').select('*').eq('slug', slug).eq('is_public', true).maybeSingle().then(async ({ data: league }) => {
        if (!league) return;

        // Check if user is logged in AND is a DT in this league
        if (state.user && state.memberships?.length) {
          const membership = state.memberships.find(m => m.league_id === league.id);
          if (membership) {
            // User is a DT in this league — show DT view
            dtState.team = membership.teams;
            dtState.league = membership.leagues || league;
            showScreen('dt');
            const leagueName = $('dt-league-name');
            if (leagueName) leagueName.textContent = dtState.league.name;
            $('btn-dt-back').onclick = () => { dtState.team = null; dtState.league = null; showScreen('hub'); };
            const { data: players } = await supa.from('players').select('*').eq('team_id', membership.team_id).order('name');
            dtState.players = players || [];
            showDTSubmissionForm();
            return;
          }
        }

        // Not a DT — show public view
        showScreen('public');
        _bound.public = false;
        initPublicUI();
        $('public-results').classList.add('hidden');
        $('public-search').value = '';
        window._viewPublicLeague(league.slug);
      });
    }
  }
}
window.addEventListener('hashchange', handleHashRoute);
setTimeout(handleHashRoute, 1000);

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
// TRIAL COUNTDOWN BANNER
// ═══════════════════════════════════════════════════════════════
function renderTrialBanner() {
  const league = state.activeLeague;
  if (!league?.trial_ends_at) return;
  const trialEnd = new Date(league.trial_ends_at);
  const now = new Date();
  const daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));

  // Don't show trial banner — Amateur gets 3 fixed scans, no trial benefits
  return;

  // Only show if trial is still active
  const existing = document.getElementById('trial-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'trial-banner';
  banner.className = 'bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-400/20 rounded-xl p-3 mb-4 flex items-center justify-between';
  banner.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-sm">✨</span>
      <span class="text-xs text-purple-300">Trial: <strong class="text-white">${daysLeft} día${daysLeft !== 1 ? 's' : ''}</strong> restantes — Probá todas las funciones</span>
    </div>
    <button onclick="this.parentElement.remove()" class="text-gray-600 hover:text-white text-xs">✕</button>
  `;

  // Insert at top of main content
  const main = document.querySelector('[data-section="inbox"]');
  if (main) main.parentElement.insertBefore(banner, main);
}


// ═══════════════════════════════════════════════════════════════
// STRIPE PLACEHOLDER + UPGRADE BUTTON
// ═══════════════════════════════════════════════════════════════
window._showUpgradePage = () => {
  const body = $('result-form-body');
  body.innerHTML = `
    <div class="text-center">
      <div class="text-4xl mb-4">✨</div>
      <h3 class="font-display text-2xl text-white mb-2">Actualizar Plan</h3>
      <p class="text-sm text-gray-500 mb-6">Desbloquea scanner IA ilimitado, más equipos y más jugadores</p>

      <div class="space-y-3 mb-6">
        <div class="bg-pitch-900/40 border border-lime-400/20 rounded-xl p-4 text-left">
          <div class="flex items-center justify-between mb-2">
            <span class="font-display text-lg text-lime-400">PRO</span>
            <span class="text-sm text-gray-400">Próximamente</span>
          </div>
          <div class="text-xs text-gray-500 space-y-1">
            <p>✅ 18 equipos · 20 jugadores/equipo</p>
            <p>✅ Scanner IA ilimitado</p>
            <p>✅ Sin publicidad</p>
          </div>
        </div>
        <div class="bg-pitch-900/40 border border-purple-400/20 rounded-xl p-4 text-left">
          <div class="flex items-center justify-between mb-2">
            <span class="font-display text-lg text-purple-400">ELITE</span>
            <span class="text-sm text-gray-400">Próximamente</span>
          </div>
          <div class="text-xs text-gray-500 space-y-1">
            <p>✅ Todo incluido en Pro</p>
            <p>✅ Equipos y jugadores ilimitados</p>
            <p>✅ White Label (sin branding)</p>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-600">Los pagos se habilitarán próximamente.<br>Contactanos para acceso anticipado.</p>
    </div>
  `;
  $('result-form').classList.remove('hidden');
};



// ═══════════════════════════════════════════════════════════════
// SEASON MANAGEMENT
// ═══════════════════════════════════════════════════════════════
window._switchSeason = async (seasonId) => {
  const league = state.activeLeague;
  if (!league) return;

  // Update active season locally
  league.active_season_id = seasonId;

  // Update in database (only admin)
  if (league.admin_id === state.user?.id) {
    await supa.from('leagues').update({ active_season_id: seasonId }).eq('id', league.id);
  }

  // Clear caches and reload all sections
  cache.teams = [];
  cache.players = [];
  cache.matches = [];
  cache.schedule = [];

  // Reset section HTML
  document.querySelectorAll('[data-section]').forEach(el => {
    const section = el.getAttribute('data-section');
    const titles = { inbox:'📥 BANDEJA', scanner:'🤖 ESCÁNER IA', fixture:'📅 FIXTURE', standings:'📊 TABLA', teams:'🏟 EQUIPOS', leaders:'⭐ LÍDERES', transfers:'📋 FICHAJES', settings:'⚙️ AJUSTES' };
    el.innerHTML = '<div class="flex items-center gap-3 mb-6"><h2 class="font-display text-3xl tracking-wide text-white">' + (titles[section] || section) + '</h2></div><div class="text-center py-8 text-gray-600">Cargando...</div>';
  });

  // Reload the currently visible section
  const activeNav = document.querySelector('[data-nav].bg-white\\/10');
  if (activeNav) activeNav.click();

  const seasonName = cache.seasons.find(s => s.id === seasonId)?.name || '';
  toast(`📅 ${seasonName}`);
};

window._createNewSeason = async () => {
  const league = state.activeLeague;
  if (!league) return;

  const seasonCount = cache.seasons.length;
  const defaultName = 'Temporada ' + (seasonCount + 1);
  const name = prompt('Nombre de la nueva temporada:', defaultName);
  if (!name || !name.trim()) return;

  const importTeams = confirm('¿Importar los equipos de la temporada actual? (Solo equipos, stats en 0)');

  try {
    // Load current season's teams BEFORE switching (cache might be empty)
    const currentSeasonId = league.active_season_id;
    let oldTeams = [];
    if (importTeams) {
      let q = supa.from('teams').select('*').eq('league_id', league.id).eq('replaced', false).eq('is_bye', false);
      if (currentSeasonId) {
        q = q.or('season_id.eq.' + currentSeasonId + ',season_id.is.null');
      }
      const { data, error: teamErr } = await q;
      if (teamErr) console.error('Team import query error:', teamErr);
      oldTeams = data || [];
      console.log('[SEASON] Found', oldTeams.length, 'teams to import');
    }

    // Create new season
    const { data: newSeason, error } = await supa.from('seasons')
      .insert({ league_id: league.id, name: name.trim(), status: 'active' })
      .select().single();
    if (error) throw error;

    // Archive current season
    if (currentSeasonId) {
      await supa.from('seasons').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', currentSeasonId);
    }

    // Update league active season
    await supa.from('leagues').update({ active_season_id: newSeason.id }).eq('id', league.id);
    league.active_season_id = newSeason.id;

    // Import teams if requested
    if (importTeams && oldTeams.length) {
      for (const team of oldTeams) {
        const { data: newTeam } = await supa.from('teams').insert({
          league_id: league.id,
          season_id: newSeason.id,
          name: team.name,
          code: team.code,
          shield_url: team.shield_url,
        }).select().single();

        // Import players with zeroed stats
        if (newTeam) {
          const { data: oldPlayers } = await supa.from('players').select('name, pos')
            .eq('team_id', team.id).eq('league_id', league.id);
          if (oldPlayers?.length) {
            await supa.from('players').insert(
              oldPlayers.map(p => ({
                league_id: league.id,
                season_id: newSeason.id,
                team_id: newTeam.id,
                name: p.name,
                pos: p.pos,
              }))
            );
          }
        }
      }
    }

    // Reload
    await loadSeasons();
    cache.teams = [];
    cache.players = [];
    cache.matches = [];
    cache.schedule = [];

    _bound.dash = false;
    initDashboard();

    // Reload the currently visible section
    setTimeout(() => {
      const activeNav = document.querySelector('[data-nav].bg-white\\/10');
      if (activeNav) activeNav.click();
    }, 300);

    toast(`✅ ${name.trim()} creada`);
  } catch(e) {
    toast('⚠️ ' + e.message, true);
  }
};

window._deleteSeason = async () => {
  const league = state.activeLeague;
  if (!league) return;

  const selectedId = $('season-dropdown')?.value;
  if (!selectedId) return;

  const season = cache.seasons.find(s => s.id === selectedId);
  if (!season) return;

  if (cache.seasons.length <= 1) {
    toast('No podés borrar la única temporada', true);
    return;
  }

  if (!confirm(`¿Borrar "${season.name}" y TODOS sus datos (equipos, jugadores, partidos)? No se puede deshacer.`)) return;
  if (!confirm(`⚠️ ÚLTIMA CONFIRMACIÓN: ¿Estás seguro de borrar "${season.name}"?`)) return;

  try {
    // Delete all season data (cascade from teams handles players)
    await supa.from('matches').delete().eq('season_id', selectedId);
    await supa.from('submissions').delete().eq('season_id', selectedId);
    await supa.from('fichaje_requests').delete().eq('season_id', selectedId);
    await supa.from('removal_requests').delete().eq('season_id', selectedId);
    await supa.from('players').delete().eq('season_id', selectedId);
    await supa.from('teams').delete().eq('season_id', selectedId);

    // If deleting the active season, switch to another one first
    if (league.active_season_id === selectedId) {
      const remaining = cache.seasons.find(s => s.id !== selectedId);
      if (remaining) {
        await supa.from('leagues').update({ active_season_id: remaining.id }).eq('id', league.id);
        league.active_season_id = remaining.id;
      }
    }

    // Now delete the season itself
    await supa.from('seasons').delete().eq('id', selectedId);

    // Reload
    await loadSeasons();
    cache.teams = [];
    cache.players = [];
    cache.matches = [];
    cache.schedule = [];

    _bound.dash = false;
    initDashboard();

    setTimeout(() => {
      const activeNav = document.querySelector('[data-nav].bg-white\\/10');
      if (activeNav) activeNav.click();
    }, 300);

    toast(`🗑 ${season.name} eliminada`);
  } catch(e) {
    toast('⚠️ ' + e.message, true);
  }
};

// ─── Retry/refresh globals ──────────────────────────────────
window._retryTeams = () => { initTeamsSection(); };
window._retryFixture = () => { initFixtureSection(); };
window._retryStandings = () => { initStandingsSection(); };
window._openPlayoffs = () => { initPlayoffsSection(); };
window._refreshInbox = () => { initInboxSection(); };
