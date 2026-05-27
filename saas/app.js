// ═══════════════════════════════════════════════════════════════
// app.js v6 — Entry point (imports all modules)
// ═══════════════════════════════════════════════════════════════
import { supa, state, on, emit, signUp, signIn, signOut, createLeague, setActiveLeague, searchPublicLeagues, loadPublicLeague, loadMyMemberships, initAuth } from './auth.js';
import { $, showScreen, showLoading, toast, getPlanLimits, cache, getSeasonId, isArchivedSeason, loadSeasons, loadTeams, loadPlayers, loadMatches, tn } from './shared.js';
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

    // Load all public data
    const [teamsRes, matchesRes, playersRes] = await Promise.all([
      supa.from('teams').select('*').eq('league_id', league.id).eq('is_bye', false).eq('replaced', false),
      supa.from('matches').select('*').eq('league_id', league.id).order('round'),
      supa.from('players').select('*').eq('league_id', league.id).order('goals', { ascending: false }),
    ]);

    const teams = teamsRes.data || [], matches = matchesRes.data || [], players = playersRes.data || [];
    const tn = id => teams.find(t => t.id === id)?.name || '?';
    const teamLink = (id) => `<span class="cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewPublicTeam('${id}')">${tn(id)}</span>`;

    // Build standings
    const standings = {};
    teams.forEach(t => { standings[t.id] = { id:t.id, name:t.name, shield_url:t.shield_url, P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0 }; });
    matches.forEach(m => {
      const h = standings[m.home_id], a = standings[m.away_id];
      if (!h || !a) return;
      h.P++; a.P++;
      h.GF += m.home_goals; h.GA += m.away_goals;
      a.GF += m.away_goals; a.GA += m.home_goals;
      if (m.home_goals > m.away_goals) { h.W++; h.Pts+=3; a.L++; }
      else if (m.home_goals < m.away_goals) { a.W++; a.Pts+=3; h.L++; }
      else { h.D++; a.D++; h.Pts++; a.Pts++; }
    });
    Object.values(standings).forEach(s => { s.GD = s.GF - s.GA; });
    const sorted = Object.values(standings).sort((a,b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF);

    // Build leaders
    const scorers = [...players].filter(p => p.goals > 0).sort((a,b) => b.goals - a.goals).slice(0, 15);
    const assisters = [...players].filter(p => p.assists > 0).sort((a,b) => b.assists - a.assists).slice(0, 15);
    const ratingPlayers = players.filter(p => p.ratings?.length >= 3).map(p => ({
      ...p, avg: (p.ratings.reduce((a,b) => a + Number(b), 0) / p.ratings.length).toFixed(1)
    })).sort((a,b) => b.avg - a.avg).slice(0, 15);

    // Load seasons for history
    const { data: seasons } = await supa.from('seasons').select('*').eq('league_id', league.id).order('created_at', { ascending: false });

    const pubTabClass = (active) => active
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20 shrink-0'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0 hover:text-white hover:border-white/10';

    content.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display text-3xl text-white">${league.name}</h2>
          <p class="text-sm text-gray-500">${teams.length} equipos · ${matches.length} partidos jugados</p>
        </div>
        <button onclick="window._closePublicLeague()" class="text-gray-500 hover:text-white text-sm">✕ Cerrar</button>
      </div>

      <!-- Public view tabs -->
      <div id="pub-tabs" class="flex gap-1 mb-4 overflow-x-auto pb-1">
        <button data-pub-tab="tabla" class="${pubTabClass(true)}">📊 Tabla</button>
        <button data-pub-tab="fixture" class="${pubTabClass(false)}">📅 Fixture</button>
        <button data-pub-tab="equipos" class="${pubTabClass(false)}">🏟 Equipos</button>
        <button data-pub-tab="lideres" class="${pubTabClass(false)}">⭐ Líderes</button>
        <button data-pub-tab="historial" class="${pubTabClass(false)}">📜 Historial</button>
      </div>

      <!-- TABLA -->
      <div id="pub-tabla" data-pub-section class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-gray-500 text-xs uppercase"><th class="text-left py-2">#</th><th class="text-left">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead>
            <tbody>${sorted.map((s, i) => `<tr class="border-b border-white/5">
              <td class="py-2 text-gray-600">${i + 1}</td>
              <td class="font-medium text-white cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewPublicTeam('${s.id}')">${s.name}</td>
              <td class="text-center text-gray-400">${s.P}</td>
              <td class="text-center text-gray-400">${s.W}</td>
              <td class="text-center text-gray-400">${s.D}</td>
              <td class="text-center text-gray-400">${s.L}</td>
              <td class="text-center text-gray-400">${s.GF}</td>
              <td class="text-center text-gray-400">${s.GA}</td>
              <td class="text-center ${s.GD > 0 ? 'text-lime-400' : s.GD < 0 ? 'text-red-400' : 'text-gray-500'}">${s.GD > 0 ? '+' : ''}${s.GD}</td>
              <td class="text-center font-bold text-white">${s.Pts}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>

      <!-- FIXTURE -->
      <div id="pub-fixture" data-pub-section class="hidden bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
        ${matches.length ? matches.map(m => `<div class="flex items-center justify-between py-2.5 border-b border-white/5 text-sm">
          <span class="text-white flex-1 text-right cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewPublicTeam('${m.home_id}')">${tn(m.home_id)}</span>
          <span class="font-display text-lg text-lime-400 mx-4">${m.home_goals} – ${m.away_goals}</span>
          <span class="text-white flex-1 cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewPublicTeam('${m.away_id}')">${tn(m.away_id)}</span>
        </div>`).join('') : '<p class="text-gray-600 text-sm text-center py-4">Sin partidos</p>'}
      </div>

      <!-- EQUIPOS -->
      <div id="pub-equipos" data-pub-section class="hidden">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${teams.map(t => {
            const shield = t.shield_url
              ? '<img src="' + t.shield_url + '" class="w-10 h-10 rounded-full object-cover border border-white/10">'
              : '<div class="w-10 h-10 rounded-full bg-pitch-700 border border-white/10 flex items-center justify-center text-lg font-display text-lime-400">' + t.name.charAt(0) + '</div>';
            const teamPlayers = players.filter(p => p.team_id === t.id);
            const st = standings[t.id] || {};
            return '<div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 cursor-pointer hover:border-lime-400/20 transition-all" onclick="window._viewPublicTeam(\'' + t.id + '\')">'
              + '<div class="flex items-center gap-3">' + shield
              + '<div class="flex-1 min-w-0"><h4 class="font-display text-lg text-white truncate">' + t.name + '</h4>'
              + '<p class="text-xs text-gray-500">' + teamPlayers.length + ' jugadores · ' + (st.W || 0) + 'G ' + (st.D || 0) + 'E ' + (st.L || 0) + 'P</p></div></div></div>';
          }).join('')}
        </div>
      </div>

      <!-- LÍDERES -->
      <div id="pub-lideres" data-pub-section class="hidden">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5">
            <h4 class="font-display text-lg text-white mb-3">⚽ GOLEADORES</h4>
            ${scorers.length ? scorers.map((p, i) => '<div class="flex items-center justify-between py-1.5 border-b border-white/5 text-sm"><span class="text-gray-400">' + (i+1) + '. ' + p.name + ' <span class="text-gray-600 text-xs">' + tn(p.team_id) + '</span></span><span class="text-white font-semibold">' + p.goals + '</span></div>').join('') : '<p class="text-gray-600 text-sm">Sin datos</p>'}
          </div>
          <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5">
            <h4 class="font-display text-lg text-white mb-3">🎯 ASISTIDORES</h4>
            ${assisters.length ? assisters.map((p, i) => '<div class="flex items-center justify-between py-1.5 border-b border-white/5 text-sm"><span class="text-gray-400">' + (i+1) + '. ' + p.name + ' <span class="text-gray-600 text-xs">' + tn(p.team_id) + '</span></span><span class="text-white font-semibold">' + p.assists + '</span></div>').join('') : '<p class="text-gray-600 text-sm">Sin datos</p>'}
          </div>
          <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5">
            <h4 class="font-display text-lg text-white mb-3">⭐ RATING</h4>
            ${ratingPlayers.length ? ratingPlayers.map((p, i) => '<div class="flex items-center justify-between py-1.5 border-b border-white/5 text-sm"><span class="text-gray-400">' + (i+1) + '. ' + p.name + ' <span class="text-gray-600 text-xs">' + tn(p.team_id) + '</span></span><span class="text-yellow-400 font-semibold">' + p.avg + '</span></div>').join('') : '<p class="text-gray-600 text-sm">Min. 3 partidos</p>'}
          </div>
        </div>
      </div>

      <!-- HISTORIAL -->
      <div id="pub-historial" data-pub-section class="hidden">
        ${(seasons || []).map(s => {
          const badge = s.status === 'active'
            ? '<span class="text-[10px] bg-lime-400/10 text-lime-400 px-2 py-0.5 rounded-full font-semibold">EN CURSO</span>'
            : '<span class="text-[10px] bg-gray-600/20 text-gray-500 px-2 py-0.5 rounded-full font-semibold">ARCHIVADA</span>';
          const champ = s.champion ? '<span class="text-sm text-yellow-400">🏆 Liga: ' + s.champion + '</span>' : '';
          const pChamp = s.playoff_champion ? '<span class="text-sm text-purple-400">🏆 Playoffs: ' + s.playoff_champion + '</span>' : '';
          return '<div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 mb-3"><div class="flex items-center justify-between mb-1"><h4 class="font-display text-lg text-white">' + s.name + '</h4>' + badge + '</div><div class="flex flex-wrap gap-3">' + champ + pChamp + '</div></div>';
        }).join('') || '<p class="text-gray-600 text-sm text-center py-4">Sin temporadas</p>'}
      </div>
    `;

    // Tab switching with highlight
    const activeClass = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20 shrink-0';
    const inactiveClass = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0 hover:text-white hover:border-white/10';

    document.querySelectorAll('#pub-tabs button').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-pub-tab');
        document.querySelectorAll('[data-pub-section]').forEach(s => s.classList.add('hidden'));
        document.getElementById('pub-' + tab)?.classList.remove('hidden');
        document.querySelectorAll('#pub-tabs button').forEach(b => {
          b.className = b === btn ? activeClass : inactiveClass;
        });
      };
    });

    // Public team detail view
    window._viewPublicTeam = (teamId) => {
      const team = teams.find(t => t.id === teamId);
      if (!team) return;
      const teamMatches = matches.filter(m => m.home_id === teamId || m.away_id === teamId);
      const played = teamMatches.filter(m => m.home_goals !== undefined && m.home_goals !== null);
      const teamPlayers = players.filter(p => p.team_id === teamId).sort((a,b) => (b.goals||0) - (a.goals||0));
      const st = standings[teamId] || {};

      const shield = team.shield_url
        ? '<img src="' + team.shield_url + '" class="w-16 h-16 rounded-full object-cover border-2 border-lime-400/20">'
        : '<div class="w-16 h-16 rounded-full bg-pitch-700 border-2 border-lime-400/20 flex items-center justify-center text-2xl font-display text-lime-400">' + team.name.charAt(0) + '</div>';

      const body = $('result-form-body');
      body.innerHTML = '<div class="text-center mb-4">' + shield + '<h3 class="font-display text-2xl text-white mt-2">' + team.name + '</h3>'
        + '<p class="text-sm text-gray-500">' + (st.W||0) + 'G ' + (st.D||0) + 'E ' + (st.L||0) + 'P · ' + (st.Pts||0) + ' pts · GD ' + (st.GD > 0 ? '+' : '') + (st.GD||0) + '</p></div>'
        + '<h4 class="font-display text-sm text-gray-400 mb-2 mt-4">📅 PARTIDOS (' + played.length + ')</h4>'
        + (played.length ? played.map(m => {
            const isHome = m.home_id === teamId;
            const result = isHome ? (m.home_goals > m.away_goals ? 'W' : m.home_goals < m.away_goals ? 'L' : 'D') : (m.away_goals > m.home_goals ? 'W' : m.away_goals < m.home_goals ? 'L' : 'D');
            const color = result === 'W' ? 'text-lime-400' : result === 'L' ? 'text-red-400' : 'text-gray-400';
            return '<div class="flex items-center justify-between py-1.5 border-b border-white/5 text-sm"><span class="' + color + ' font-semibold w-5">' + result + '</span><span class="text-white flex-1 text-center">' + tn(m.home_id) + ' ' + m.home_goals + '–' + m.away_goals + ' ' + tn(m.away_id) + '</span></div>';
          }).join('') : '<p class="text-gray-600 text-xs">Sin partidos</p>')
        + '<h4 class="font-display text-sm text-gray-400 mb-2 mt-4">👥 PLANTEL (' + teamPlayers.length + ')</h4>'
        + (teamPlayers.length ? teamPlayers.map(p => {
            const avg = p.ratings?.length ? (p.ratings.reduce((a,b) => a+Number(b),0)/p.ratings.length).toFixed(1) : '-';
            return '<div class="flex items-center gap-2 py-1.5 border-b border-white/5 text-sm"><span class="text-gray-600 text-[10px] w-7">' + (p.pos||'?') + '</span><span class="text-white flex-1">' + p.name + '</span><span class="text-gray-500">⚽' + (p.goals||0) + '</span><span class="text-gray-500">🎯' + (p.assists||0) + '</span><span class="text-yellow-400/60">⭐' + avg + '</span></div>';
          }).join('') : '<p class="text-gray-600 text-xs">Sin jugadores</p>');

      const titleEl = $('modal-title');
      if (titleEl) titleEl.textContent = team.name;
      $('result-form').classList.remove('hidden');
    };

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

  // Upgrade button (visible for Amateur and Pro only)
  const plan = state.profile?.plan_type || 'amateur';
  const upgradeContainer = $('hub-upgrade-btn');
  if (upgradeContainer && !state.isSuperadmin && plan !== 'elite') {
    upgradeContainer.innerHTML = `<button onclick="window._showUpgradePage()" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">⬆ Mejorar Plan</button>`;
  } else if (upgradeContainer) {
    upgradeContainer.innerHTML = '';
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
      return '<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-3 hover:border-lime-400/20 transition-all glow"><div class="flex items-center justify-between"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><h3 class="font-display text-xl text-white truncate">' + l.name + '</h3><span class="text-[10px] uppercase px-2 py-0.5 rounded-full font-semibold ' + planClass + '">' + l.plan_type + '</span></div><div class="flex items-center gap-4 text-xs text-gray-500"><span>' + (l.is_public ? '🌐 Pública' : '🔒 Privada') + '</span></div></div><div class="flex items-center gap-2 shrink-0 ml-4"><button onclick="window._manageLeague(\'' + l.id + '\')" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all">Gestionar \u2192</button><button onclick="window._deleteLeagueFromHub(\'' + l.id + '\',\'' + l.name.replace(/'/g, "\\'") + '\')" class="bg-red-500/10 text-red-400 border border-red-500/20 py-2 px-3 rounded-xl text-sm hover:bg-red-500/20 transition-all" title="Eliminar liga">🗑</button></div></div></div>';
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
    const titles = { inbox:'📥 BANDEJA', scanner:'🤖 ESCÁNER IA', fixture:'📅 FIXTURE', standings:'📊 TABLA', teams:'🏟 EQUIPOS', leaders:'⭐ LÍDERES', transfers:'📋 FICHAJES', history:'📜 HISTORIAL', settings:'⚙️ AJUSTES' };
    el.innerHTML = '<div class="flex items-center gap-3 mb-6"><h2 class="font-display text-3xl tracking-wide text-white">' + (titles[section] || section) + '</h2></div><div class="text-center py-8 text-gray-600">Cargando...</div>';
  });
  _bound.dash = false;

  // Go directly to league (ads disabled until AdSense approved)
  setActiveLeague(league);
};

window._deleteLeagueFromHub = async (leagueId, leagueName) => {
  if (!confirm('¿Eliminar "' + leagueName + '"? Se borran TODOS los datos (equipos, jugadores, partidos, temporadas). No se puede deshacer.')) return;
  if (!confirm('⚠️ ÚLTIMA CONFIRMACIÓN: ¿Borrar "' + leagueName + '" permanentemente?')) return;

  try {
    const { error } = await supa.from('leagues').delete().eq('id', leagueId);
    if (error) throw error;
    state.leagues = state.leagues.filter(l => l.id !== leagueId);
    renderHubLeagues();
    toast('🗑 Liga eliminada');
  } catch(e) {
    toast('⚠️ ' + e.message, true);
  }
};

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
          ${seasons.map(s => {
            const label = s.name + (s.status === 'archived' ? ' 📁' : ' ⚽') + (s.champion ? ' 🏆 ' + s.champion : '');
            return `<option value="${s.id}" ${s.id === activeSeason.id ? 'selected' : ''}>${label}</option>`;
          }).join('')}
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
      if (section === 'history') initHistorySection();
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
  // Clear hash to prevent handleHashRoute from interfering
  window.location.hash = '';
  // Restore landing content in case public league view was showing
  const landingContent = document.querySelector('#screen-public > .slide-up');
  const footer = document.querySelector('#screen-public > footer');
  const publicLeagueView = $('public-league-view');
  if (landingContent) landingContent.classList.remove('hidden');
  if (footer) footer.classList.remove('hidden');
  if (publicLeagueView) publicLeagueView.classList.add('hidden');

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
  updateURLHash(state.activeLeague?.slug);
});

// ─── Boot ────────────────────────────────────────────────────
initAuth();

// Hash routing for shareable URLs
function handleHashRoute() {
  const hash = window.location.hash;

  // Handle upgrade success/cancel
  if (hash === '#/upgrade/success') {
    window.location.hash = '';
    setTimeout(() => {
      // Reload profile to get updated plan
      if (state.user) {
        supa.from('profiles').select('*').eq('id', state.user.id).single().then(({ data }) => {
          if (data) {
            state.profile = data;
            toast('🎉 ¡Pago exitoso! Tu plan se actualizó a ' + (data.plan_type || '').toUpperCase());
            _bound.hub = false;
            initHubUI();
          }
        });
      }
    }, 500);
    return;
  }

  if (hash === '#/upgrade/cancel') {
    window.location.hash = '';
    toast('Pago cancelado');
    return;
  }

  if (!hash.startsWith('#/liga/')) return;

  // Don't interfere if user is already managing a league in dashboard
  if (state.activeLeague && state.user) return;

  const slug = hash.replace('#/liga/', '');
  if (!slug) return;

  supa.from('leagues').select('*').eq('slug', slug).eq('is_public', true).maybeSingle().then(async ({ data: league }) => {
    if (!league) return;

    // Check if user is logged in AND is a DT in this league
    if (state.user && state.memberships?.length) {
      const membership = state.memberships.find(m => m.league_id === league.id);
      if (membership) {
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
    $('public-results')?.classList.add('hidden');
    if ($('public-search')) $('public-search').value = '';
    window._viewPublicLeague(league.slug);
  });
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
  const currentPlan = state.profile?.plan_type || 'amateur';
  const body = $('result-form-body');

  const isAmateur = currentPlan === 'amateur';
  const isPro = currentPlan === 'pro';

  body.innerHTML = `
    <div class="text-center">
      <div class="text-4xl mb-4">✨</div>
      <h3 class="font-display text-2xl text-white mb-2">Actualizar Plan</h3>
      <p class="text-sm text-gray-500 mb-6">Desbloquea más equipos, más ligas y scanner IA ilimitado</p>

      <div class="space-y-3 mb-6">
        <div class="bg-pitch-900/40 border ${isAmateur ? 'border-white/20' : 'border-white/5'} rounded-xl p-4 text-left">
          <div class="flex items-center justify-between mb-2">
            <span class="font-display text-lg text-gray-500">AMATEUR</span>
            ${isAmateur ? '<span class="text-[10px] bg-white/10 text-gray-400 px-2 py-0.5 rounded-full font-semibold">Tu plan actual</span>' : '<span class="text-sm text-gray-700">Gratis</span>'}
          </div>
          <div class="text-xs text-gray-600 space-y-1">
            <p>12 equipos · 15 jugadores/equipo</p>
            <p>3 ligas activas · 15 scans IA/mes</p>
            <p>Con publicidad</p>
          </div>
        </div>
        <div class="bg-pitch-900/40 border ${isPro ? 'border-lime-400/30' : 'border-lime-400/20'} rounded-xl p-4 text-left">
          <div class="flex items-center justify-between mb-2">
            <span class="font-display text-lg text-lime-400">PRO</span>
            ${isPro ? '<span class="text-[10px] bg-lime-400/10 text-lime-400 px-2 py-0.5 rounded-full font-semibold">Tu plan actual</span>' : '<span class="font-display text-lg text-white">$12<span class="text-xs text-gray-500">/mes</span></span>'}
          </div>
          <div class="text-xs text-gray-500 space-y-1 ${isAmateur ? 'mb-3' : ''}">
            <p>✅ 20 equipos · 25 jugadores/equipo</p>
            <p>✅ 5 ligas activas</p>
            <p>✅ Scanner IA ilimitado</p>
            <p>✅ Sin publicidad</p>
          </div>
          
        </div>
        <div class="bg-pitch-900/40 border border-purple-400/20 rounded-xl p-4 text-left">
          <div class="flex items-center justify-between mb-2">
            <span class="font-display text-lg text-purple-400">ELITE</span>
            <span class="font-display text-lg text-white">$25<span class="text-xs text-gray-500">/mes</span></span>
          </div>
          <div class="text-xs text-gray-500 space-y-1 mb-3">
            <p>✅ Todo incluido en Pro</p>
            <p>✅ Equipos y jugadores ilimitados</p>
            <p>✅ Ligas ilimitadas</p>
          </div>
          
        </div>
      </div>
      <p class="text-xs text-gray-600 mt-4">¿Querés mejorar tu plan? Escribinos a <a href="mailto:contacto@intileagues.com" class="text-emerald-400 hover:text-emerald-300">contacto@intileagues.com</a></p>
    </div>
  `;
  $('result-form').classList.remove('hidden');
};

window._startCheckout = async (priceId) => {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { toast('⚠️ Iniciá sesión primero', true); return; }

  toast('Redirigiendo a Stripe...');

  try {
    const res = await fetch(supa.supabaseUrl + '/functions/v1/create-checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({ priceId }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (data.url) window.location.href = data.url;
  } catch(e) {
    toast('⚠️ ' + e.message, true);
  }
};



// ═══════════════════════════════════════════════════════════════
// HISTORY — Season overview
// ═══════════════════════════════════════════════════════════════
async function initHistorySection() {
  const section = document.querySelector('[data-section="history"]');
  if (!section) return;

  section.innerHTML = '<div class="flex items-center gap-3 mb-6"><span class="text-2xl">📜</span><h2 class="font-display text-3xl tracking-wide text-white">HISTORIAL</h2></div><div id="history-content"></div>';
  const container = $('history-content');
  showLoading(container, 'Cargando historial...');

  const league = state.activeLeague;
  if (!league) return;

  try {
    const seasons = cache.seasons.length ? cache.seasons : await loadSeasons();

    if (!seasons.length) {
      container.innerHTML = '<div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-xl p-8 text-center text-gray-600">No hay temporadas registradas.</div>';
      return;
    }

    // Load stats per season
    const seasonData = [];
    for (const s of seasons) {
      const [teamsRes, matchesRes, scorerRes, assistRes, ratingRes] = await Promise.all([
        supa.from('teams').select('id').eq('season_id', s.id).eq('replaced', false).eq('is_bye', false),
        supa.from('matches').select('id').eq('season_id', s.id),
        supa.from('players').select('name, goals').eq('season_id', s.id).order('goals', { ascending: false }).limit(1),
        supa.from('players').select('name, assists').eq('season_id', s.id).order('assists', { ascending: false }).limit(1),
        supa.from('players').select('name, ratings').eq('season_id', s.id),
      ]);

      let bestRating = null;
      if (ratingRes.data) {
        let best = { name: '', avg: 0 };
        for (const p of ratingRes.data) {
          if (p.ratings && p.ratings.length >= 3) {
            const avg = p.ratings.reduce((a,b) => a + Number(b), 0) / p.ratings.length;
            if (avg > best.avg) best = { name: p.name, avg };
          }
        }
        if (best.avg > 0) bestRating = { name: best.name, avg: best.avg.toFixed(1) };
      }

      seasonData.push({ ...s, teamCount: teamsRes.data?.length || 0, matchCount: matchesRes.data?.length || 0, topScorer: scorerRes.data?.[0] || null, topAssist: assistRes.data?.[0] || null, bestRating });
    }

    // Combined view: aggregate all players across seasons
    const { data: allPlayers } = await supa.from('players').select('name, goals, assists, matches_played, ratings').eq('league_id', league.id);
    const combined = {};
    for (const p of (allPlayers || [])) {
      const key = p.name.toLowerCase().trim();
      if (!combined[key]) combined[key] = { name: p.name, goals: 0, assists: 0, mp: 0, ratings: [] };
      combined[key].goals += p.goals || 0;
      combined[key].assists += p.assists || 0;
      combined[key].mp += p.matches_played || 0;
      if (p.ratings && p.ratings.length) combined[key].ratings.push(...p.ratings.map(Number));
    }
    const combinedList = Object.values(combined).filter(p => p.mp > 0);
    const topCScorer = [...combinedList].sort((a,b) => b.goals - a.goals).slice(0, 5);
    const topCAssist = [...combinedList].sort((a,b) => b.assists - a.assists).slice(0, 5);
    const topCRating = [...combinedList].filter(p => p.ratings.length >= 3).map(p => ({ ...p, avg: (p.ratings.reduce((a,b) => a+b, 0) / p.ratings.length).toFixed(1) })).sort((a,b) => b.avg - a.avg).slice(0, 5);

    const activeId = league.active_season_id;

    // Render season cards
    const seasonCards = seasonData.map(s => {
      const isActive = s.id === activeId;
      const badge = isActive ? '<span class="text-[10px] bg-lime-400/10 text-lime-400 px-2 py-0.5 rounded-full font-semibold">EN CURSO</span>' : '<span class="text-[10px] bg-gray-600/20 text-gray-500 px-2 py-0.5 rounded-full font-semibold">ARCHIVADA</span>';
      const champ = s.champion ? '<div class="flex items-center gap-1.5 mt-2"><span>🏆</span><span class="text-sm text-yellow-400 font-semibold">Liga: ' + s.champion + '</span></div>' : '';
      const pChamp = s.playoff_champion ? '<div class="flex items-center gap-1.5"><span>🏆</span><span class="text-sm text-purple-400 font-semibold">Playoffs: ' + s.playoff_champion + '</span></div>' : '';
      const sc = s.topScorer && s.topScorer.goals > 0 ? '<span>\u26bd ' + s.topScorer.name + ' (' + s.topScorer.goals + ')</span>' : '';
      const as = s.topAssist && s.topAssist.assists > 0 ? '<span>\ud83c\udfaf ' + s.topAssist.name + ' (' + s.topAssist.assists + ')</span>' : '';
      const rt = s.bestRating ? '<span>\u2b50 ' + s.bestRating.name + ' (' + s.bestRating.avg + ')</span>' : '';
      const statsItems = [sc, as, rt].filter(Boolean).join('');
      const statsRow = statsItems ? '<div class="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">' + statsItems + '</div>' : '';
      const dates = s.archived_at ? 'Archivada: ' + new Date(s.archived_at).toLocaleDateString() : 'Inicio: ' + new Date(s.created_at).toLocaleDateString();
      const viewBtn = isActive ? '' : '<button onclick="window._switchSeason(\'' + s.id + '\')" class="mt-3 text-xs text-lime-400 hover:text-lime-300 font-semibold">Ver temporada \u2192</button>';
      return '<div class="bg-pitch-800/60 border ' + (isActive ? 'border-lime-400/20' : 'border-white/5') + ' rounded-2xl p-5 mb-4"><div class="flex items-center justify-between mb-2"><h3 class="font-display text-xl text-white">' + s.name + '</h3>' + badge + '</div>' + champ + pChamp + statsRow + '<div class="flex gap-4 mt-3 text-xs text-gray-500"><span>\ud83c\udfdf ' + s.teamCount + ' equipos</span><span>\ud83d\udcc5 ' + s.matchCount + ' partidos</span><span>\ud83d\udcc6 ' + dates + '</span></div>' + viewBtn + '</div>';
    }).join('');

    // Render combined leaderboards
    const renderTop = (list, field, emoji) => list.length ? list.map((p,i) => '<div class="flex items-center justify-between py-1.5 border-b border-white/5 text-sm"><span class="text-gray-400">' + (i+1) + '. ' + p.name + '</span><span class="text-white font-semibold">' + (field === 'avg' ? p.avg : p[field]) + '</span></div>').join('') : '<p class="text-gray-600 text-sm">Sin datos</p>';

    const combinedHTML = '<div class="grid md:grid-cols-3 gap-4">'
      + '<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5"><h4 class="font-display text-lg text-white mb-3">\u26bd GOLEADORES HIST\u00d3RICOS</h4>' + renderTop(topCScorer, 'goals', '') + '</div>'
      + '<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5"><h4 class="font-display text-lg text-white mb-3">\ud83c\udfaf ASISTIDORES HIST\u00d3RICOS</h4>' + renderTop(topCAssist, 'assists', '') + '</div>'
      + '<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5"><h4 class="font-display text-lg text-white mb-3">\u2b50 MEJORES RATINGS</h4>' + renderTop(topCRating, 'avg', '') + '</div>'
      + '</div><p class="text-xs text-gray-600 mt-4 text-center">' + combinedList.length + ' jugadores \u00b7 ' + seasons.length + ' temporadas \u00b7 ' + seasonData.reduce((t,s) => t + s.matchCount, 0) + ' partidos totales</p>';

    container.innerHTML = '<div class="flex gap-2 mb-6"><button id="hist-tab-seasons" class="px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 text-white">Por Temporada</button><button id="hist-tab-combined" class="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:text-white hover:bg-white/5">Todas las Temporadas</button></div><div id="hist-seasons-view">' + seasonCards + '</div><div id="hist-combined-view" class="hidden">' + combinedHTML + '</div>';

    $('hist-tab-seasons').onclick = () => {
      $('hist-seasons-view').classList.remove('hidden');
      $('hist-combined-view').classList.add('hidden');
      $('hist-tab-seasons').className = 'px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 text-white';
      $('hist-tab-combined').className = 'px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:text-white hover:bg-white/5';
    };
    $('hist-tab-combined').onclick = () => {
      $('hist-seasons-view').classList.add('hidden');
      $('hist-combined-view').classList.remove('hidden');
      $('hist-tab-combined').className = 'px-4 py-2 rounded-xl text-sm font-semibold bg-white/10 text-white';
      $('hist-tab-seasons').className = 'px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 hover:text-white hover:bg-white/5';
    };
  } catch(e) {
    console.error('[HISTORY] error:', e);
    container.innerHTML = '<div class="text-red-400 text-sm">Error al cargar historial: ' + e.message + '</div>';
  }
}

// ═══════════════════════════════════════════════════════════════
// SEASON MANAGEMENT
// ═══════════════════════════════════════════════════════════════
window._switchSeason = async (seasonId) => {
  const league = state.activeLeague;
  if (!league) return;

  const season = cache.seasons.find(s => s.id === seasonId);

  // Update active season locally for viewing
  league.active_season_id = seasonId;

  // Only update in database if switching to an ACTIVE season (not just viewing archived)
  if (season?.status === 'active' && league.admin_id === state.user?.id) {
    await supa.from('leagues').update({ active_season_id: seasonId }).eq('id', league.id);
  }

  // Show/hide archived banner
  let banner = document.getElementById('archived-season-banner');
  if (season?.status === 'archived') {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'archived-season-banner';
      banner.className = 'bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-2 text-sm text-yellow-400';
      const mainContent = document.querySelector('#dash-main > .p-4, #dash-main > .lg\\:p-8');
      if (mainContent) mainContent.prepend(banner);
      else $('dash-main')?.prepend(banner);
    }
    banner.innerHTML = '📁 <span class="font-semibold">' + season.name + '</span> — Temporada archivada (solo lectura)';
    banner.classList.remove('hidden');
  } else if (banner) {
    banner.classList.add('hidden');
  }

  // Clear caches and reload all sections
  cache.teams = [];
  cache.players = [];
  cache.matches = [];
  cache.schedule = [];

  // Reset section HTML
  document.querySelectorAll('[data-section]').forEach(el => {
    const section = el.getAttribute('data-section');
    const titles = { inbox:'📥 BANDEJA', scanner:'🤖 ESCÁNER IA', fixture:'📅 FIXTURE', standings:'📊 TABLA', teams:'🏟 EQUIPOS', leaders:'⭐ LÍDERES', transfers:'📋 FICHAJES', history:'📜 HISTORIAL', settings:'⚙️ AJUSTES' };
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

  // Ask for champion of current season
  let champion = '';
  let playoffChampion = '';
  if (cache.teams.length) {
    const teamNames = cache.teams.filter(t => !t.is_bye && !t.replaced).map(t => t.name).join(', ');
    champion = prompt('🏆 ¿Campeón de la temporada actual?\n\nEquipos: ' + teamNames + '\n\n(Dejá vacío si no terminó)', '') || '';
    if (champion) {
      playoffChampion = prompt('🏆 ¿Campeón de playoffs? (Dejá vacío si no hubo)', '') || '';
    }
  }

  const importTeams = confirm('¿Importar los equipos de la temporada actual? (Solo equipos, stats en 0)');

  try {
    // Load current season's teams BEFORE switching (cache might be empty)
    const currentSeasonId = league.active_season_id;
    let oldTeams = [];
    if (importTeams) {
      let q = supa.from('teams').select('*').eq('league_id', league.id).eq('replaced', false).eq('is_bye', false);
      if (currentSeasonId) q = q.eq('season_id', currentSeasonId);
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

    // Archive current season with champion info
    if (currentSeasonId) {
      await supa.from('seasons').update({
        status: 'archived',
        archived_at: new Date().toISOString(),
        champion: champion || null,
        playoff_champion: playoffChampion || null,
      }).eq('id', currentSeasonId);
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

    // Reset ALL section HTML (fixture, playoffs, standings, etc.)
    document.querySelectorAll('[data-section]').forEach(el => {
      const section = el.getAttribute('data-section');
      const titles = { inbox:'📥 BANDEJA', scanner:'🤖 ESCÁNER IA', fixture:'📅 FIXTURE', standings:'📊 TABLA', teams:'🏟 EQUIPOS', leaders:'⭐ LÍDERES', transfers:'📋 FICHAJES', history:'📜 HISTORIAL', settings:'⚙️ AJUSTES' };
      el.innerHTML = '<div class="flex items-center gap-3 mb-6"><h2 class="font-display text-3xl tracking-wide text-white">' + (titles[section] || section) + '</h2></div><div class="text-center py-8 text-gray-600">Cargando...</div>';
    });

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
