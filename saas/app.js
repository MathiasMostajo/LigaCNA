// ═══════════════════════════════════════════════════════════════
// app.js v5 — 4-state navigation (Public, Auth, Hub, Dashboard)
// ═══════════════════════════════════════════════════════════════
import { supa, state, on, emit, signUp, signIn, signOut, createLeague, setActiveLeague, searchPublicLeagues, loadPublicLeague, loadMyMemberships, initAuth } from './auth.js';

const $ = id => document.getElementById(id);
let _bound = { login: false, hub: false, dash: false, public: false };

function showScreen(id) {
  document.querySelectorAll('[data-screen]').forEach(el => el.classList.add('hidden'));
  const t = $(`screen-${id}`); if (t) t.classList.remove('hidden');
}

// Loading spinner component
function showLoading(container, msg) {
  if (typeof container === 'string') container = document.querySelector(container);
  if (!container) return;
  container.innerHTML = '<div class="flex flex-col items-center justify-center py-12 text-center"><svg class="animate-spin h-8 w-8 mb-3 text-lime-400/30" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><p class="text-sm text-gray-600">' + (msg || 'Cargando...') + '</p></div>';
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
    showLoading(content, 'Cargando liga...');

    content.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="font-display text-3xl text-white">${league.name}</h2>
          <p class="text-sm text-gray-500">${teams.length} equipos · ${matches.length} partidos jugados</p>
        </div>
        <button onclick="document.getElementById('public-league-view').classList.add('hidden')" class="text-gray-500 hover:text-white text-sm">✕ Cerrar</button>
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

  // DT memberships section
  if (state.memberships?.length) {
    html += '<div class="mb-6">';
    html += '<h3 class="font-display text-lg text-gray-400 mb-3">🎮 Mis Equipos (DT)</h3>';
    html += state.memberships.map(m => {
      const team = m.teams || {};
      const league = m.leagues || {};
      const shieldHtml = team.shield_url
        ? '<img src="' + team.shield_url + '" class="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0">'
        : '<div class="w-10 h-10 rounded-full bg-pitch-700 border border-white/10 flex items-center justify-center text-lg font-display text-lime-400 shrink-0">' + (team.name || '?').charAt(0) + '</div>';
      return '<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-4 mb-2 hover:border-lime-400/20 transition-all">' +
        '<div class="flex items-center gap-4">' + shieldHtml +
        '<div class="flex-1 min-w-0"><h3 class="font-display text-lg text-white truncate">' + (team.name || '?') + '</h3><p class="text-xs text-gray-500">' + (league.name || '?') + '</p></div>' +
        '<button onclick="window._dtSelectTeam(\'' + m.team_id + '\',\'' + m.league_id + '\')" class="bg-lime-400/10 text-lime-400 border border-lime-400/20 font-bold py-2 px-4 rounded-xl text-sm hover:bg-lime-400/20 transition-all shrink-0">Entrar →</button>' +
        '</div></div>';
    }).join('');
    html += '</div>';
  }

  // Admin leagues section
  if (!state.leagues.length && !state.memberships?.length) {
    el.innerHTML = '<div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-2xl p-12 text-center"><span class="text-4xl mb-4 block">🏆</span><p class="text-gray-500 mb-2">No tenés ligas ni equipos todavía</p><p class="text-sm text-gray-600">Creá tu primera liga o pedile a un admin que te agregue como DT</p></div>';
    return;
  }

  if (state.leagues.length) {
    if (state.memberships?.length) {
      html += '<h3 class="font-display text-lg text-gray-400 mb-3">🏆 Mis Ligas (Admin)</h3>';
    }
    html += state.leagues.map(l => {
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
              <span>🏟 ${l.max_teams} equipos · 👤 ${l.max_players_per_team} jug/eq</span>
              <span>${l.is_public ? '🌐 Pública' : '🔒 Privada'}</span>
            </div>
          </div>
          <button onclick="window._manageLeague('${l.id}')" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shrink-0 ml-4">Gestionar →</button>
        </div>
      </div>`;
    }).join('');
  }

  el.innerHTML = html;
}

window._manageLeague = (leagueId) => {
  const league = state.leagues.find(l => l.id === leagueId);
  if (!league) return;
  // Clear all caches AND section content when switching leagues
  _teamsCache = [];
  _playersCache = [];
  _matchesCache = [];
  _scheduleCache = [];
  _activeTeamId = null;
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
      if (section === 'fixture') initFixtureSection();
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
    _teamsCache = [];
    _playersCache = [];
    _matchesCache = [];
    _scheduleCache = [];
    _activeTeamId = null;
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
            _dtTeam = membership.teams;
            _dtLeague = membership.leagues || league;
            showScreen('dt');
            const leagueName = $('dt-league-name');
            if (leagueName) leagueName.textContent = _dtLeague.name;
            $('btn-dt-back').onclick = () => { _dtTeam = null; _dtLeague = null; showScreen('hub'); };
            const { data: players } = await supa.from('players').select('*').eq('team_id', membership.team_id).order('name');
            _dtPlayers = players || [];
            showDTSubmissionForm();
            return;
          }
        }

        // Not a DT — show public view
        loadPublicLeague(league.id);
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
// TEAMS MODULE
// ═══════════════════════════════════════════════════════════════
let _teamsCache = [];

// Centralized plan limits — always use these, never trust stored max_teams
function getPlanLimits(planType) {
  const plans = {
    amateur:    { maxTeams: 12, maxPlayers: 15, hasAds: true,  hasScan: false },
    pro:        { maxTeams: 18, maxPlayers: 20, hasAds: false, hasScan: true  },
    elite:      { maxTeams: 999, maxPlayers: 999, hasAds: false, hasScan: true },
    superadmin: { maxTeams: 999, maxPlayers: 999, hasAds: false, hasScan: true },
  };
  return plans[planType] || plans.amateur;
}
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
  try { await _initTeamsSectionInner(); } catch(e) { 
    console.error('Teams section error:', e); 
    const container = document.querySelector('[data-section="teams"]');
    if (container) container.innerHTML = '<div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"><p class="text-red-400">Error cargando equipos: ' + e.message + '</p><button onclick="window._retryTeams()" class="mt-3 bg-white/5 text-gray-400 px-4 py-2 rounded-xl text-sm hover:text-white transition-all">Reintentar</button></div>';
  }
}

async function _initTeamsSectionInner() {
  const container = document.querySelector('[data-section="teams"]');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🏟</span>
        <h2 class="font-display text-3xl tracking-wide text-white">EQUIPOS</h2>
        <span class="text-xs text-gray-500 bg-pitch-800 px-2 py-1 rounded-lg">${_teamsCache.filter(t=>!t.is_bye&&!t.replaced).length}/${getPlanLimits(state.activeLeague.plan_type).maxTeams === 999 ? '∞' : getPlanLimits(state.activeLeague.plan_type).maxTeams}</span>
      </div>
      <button id="btn-add-team" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">+ Nuevo Equipo</button>
    </div>

    <!-- Create team form (hidden) -->
    <div id="team-create-form" class="hidden bg-pitch-800/60 border border-lime-400/20 rounded-2xl p-5 mb-4 glow">
      <h3 class="font-display text-lg text-white mb-4">🏟 Nuevo Equipo</h3>
      <div class="grid gap-3 md:grid-cols-2 mb-4">
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Nombre</label>
          <input id="new-team-name" type="text" placeholder="Ej: Peñarol" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none focus:border-lime-400/40 text-sm">
        </div>
        <div class="flex items-end gap-2">
          <button id="btn-confirm-team" class="flex-1 bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2.5 rounded-xl text-sm uppercase tracking-wider">Crear</button>
          <button id="btn-cancel-team" class="bg-pitch-700 text-gray-400 py-2.5 px-4 rounded-xl text-sm hover:bg-pitch-600 transition-all">✕</button>
        </div>
      </div>
      <div id="team-create-error" class="hidden text-sm text-center py-2 px-4 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20"></div>
    </div>

    <!-- Teams list -->
    <div id="teams-list" class="space-y-3"></div>

    <!-- Team detail (hidden, shown when clicking a team) -->
    <div id="team-detail" class="hidden mt-6"></div>
  `;

  // Bind events
  $('btn-add-team').onclick = () => {
    const limits = getPlanLimits(state.activeLeague.plan_type);
    const activeTeams = _teamsCache.filter(t => !t.is_bye && !t.replaced).length;
    if (activeTeams >= limits.maxTeams && state.activeLeague.plan_type !== 'superadmin') {
      toast(`⚠️ Límite de ${limits.maxTeams} equipos en plan ${state.activeLeague.plan_type.toUpperCase()}. Actualizá tu plan.`, true);
      return;
    }
    $('team-create-form').classList.toggle('hidden');
  };

  $('btn-cancel-team').onclick = () => $('team-create-form').classList.add('hidden');

  $('btn-confirm-team').onclick = async () => {
    const name = $('new-team-name').value.trim();
    const errEl = $('team-create-error');

    if (!name) { errEl.textContent = 'El nombre es obligatorio'; errEl.classList.remove('hidden'); return; }

    // Check duplicate name
    if (_teamsCache.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = 'Ya existe un equipo con ese nombre'; errEl.classList.remove('hidden'); return;
    }

    // Double-check team limit right before insert
    const currentActiveTeams = _teamsCache.filter(t => !t.is_bye && !t.replaced).length;
    const insertLimits = getPlanLimits(state.activeLeague.plan_type);
    if (currentActiveTeams >= insertLimits.maxTeams && state.activeLeague.plan_type !== 'superadmin') {
      errEl.textContent = `Límite de ${insertLimits.maxTeams} equipos (plan ${state.activeLeague.plan_type.toUpperCase()})`;
      errEl.classList.remove('hidden');
      return;
    }

    $('btn-confirm-team').disabled = true;
    $('btn-confirm-team').textContent = 'Creando...';

    // Auto-generate random 6-char code for DT login
    const autoCode = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(36).toUpperCase().slice(-1)).join('') 
      + Math.floor(Math.random() * 90 + 10);

    try {
      const { data, error } = await supa.from('teams').insert({
        league_id: state.activeLeague.id,
        name,
        code: autoCode,
      }).select().single();

      if (error) throw error;
      _teamsCache.push(data);
      $('team-create-form').classList.add('hidden');
      $('new-team-name').value = '';
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
  showLoading($('teams-list'), 'Cargando equipos...');
  await loadTeams();
  renderTeamsList();
} // end _initTeamsSectionInner

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
        <div id="team-dt-emails"></div>
      </div>
    </div>
  `;

  // Load DT emails async
  renderDTEmails(teamId).then(html => {
    const dtEl = document.getElementById('team-dt-emails');
    if (dtEl) dtEl.innerHTML = html;
  });

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
      <span class="flex-1 font-medium text-white truncate cursor-pointer hover:text-lime-400 transition-colors" onclick="event.stopPropagation();window._viewPlayerProfile('${p.id}')">${p.name}</span>
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
  const playerLimits = getPlanLimits(state.activeLeague.plan_type);
  const maxP = state.activeLeague.plan_type === 'superadmin' ? 999 : Math.min(state.activeLeague.max_players_per_team || 15, playerLimits.maxPlayers);
  const currentPlayers = _playersCache.filter(p => p.team_id === teamId);
  if (currentPlayers.length >= maxP && state.activeLeague.plan_type !== 'superadmin') {
    toast(`⚠️ Límite de ${maxP} jugadores por equipo (plan ${state.activeLeague.plan_type.toUpperCase()})`, true); return;
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
    // Delete players first (FK constraint), then team
    const { error: playersErr } = await supa.from('players').delete().eq('team_id', teamId);
    if (playersErr) throw playersErr;
    const { error } = await supa.from('teams').delete().eq('id', teamId);
    if (error) throw error;
    _teamsCache = _teamsCache.filter(t => t.id !== teamId);
    _playersCache = _playersCache.filter(p => p.team_id !== teamId);
    _activeTeamId = null;
    const detail = $('team-detail');
    if (detail) { detail.classList.add('hidden'); detail.innerHTML = ''; }
    renderTeamsList();
    toast(`🗑 ${team.name} eliminado`);
  } catch(e) { 
    console.error('Delete error:', e);
    toast('⚠️ Error al eliminar: ' + e.message, true); 
  }
};

window._uploadShield = async (teamId, event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('⚠️ Imagen muy grande (max 10MB)', true); return; }

  toast('🖼️ Procesando imagen...');

  try {
    // Compress to 200x200 JPEG
    const compressed = await new Promise((resolve, reject) => {
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
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('No se pudo leer la imagen'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsDataURL(file);
    });

    // Try Supabase Storage first, fall back to base64 in team record
    let shieldUrl = compressed;
    try {
      const fileName = teamId + '.jpg';
      const blob = await fetch(compressed).then(r => r.blob());
      const { error: upErr } = await supa.storage.from('shields').upload(fileName, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: urlData } = supa.storage.from('shields').getPublicUrl(fileName);
      shieldUrl = urlData.publicUrl + '?t=' + Date.now();
    } catch(storageErr) {
      console.warn('Storage upload failed, using base64 fallback:', storageErr.message);
      // shieldUrl stays as compressed base64 — still works as img src
    }

    const { error: updateErr } = await supa.from('teams').update({ shield_url: shieldUrl }).eq('id', teamId);
    if (updateErr) throw updateErr;

    const team = _teamsCache.find(t => t.id === teamId);
    if (team) team.shield_url = shieldUrl;
    renderTeamsList();
    window._viewTeam(teamId);
    toast('🖼️ Escudo guardado');
  } catch(e) {
    console.error('Shield upload error:', e);
    toast('⚠️ ' + e.message, true);
  }
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

// ═══════════════════════════════════════════════════════════════
// FIXTURE MODULE
// ═══════════════════════════════════════════════════════════════
let _scheduleCache = [];
let _matchesCache = [];

async function loadMatches() {
  const { data, error } = await supa.from('matches').select('*')
    .eq('league_id', state.activeLeague.id)
    .order('created_at');
  if (error) { console.error(error); return []; }
  _matchesCache = data || [];
  return _matchesCache;
}

function getMatchResult(homeId, awayId) {
  // Only match the EXACT home/away pair — A vs B is different from B vs A
  return _matchesCache.find(m => m.home_id === homeId && m.away_id === awayId);
}

function tn(teamId) {
  const t = _teamsCache.find(t => t.id === teamId);
  return t ? t.name : '?';
}

function generateCalendar(teamIds) {
  let teams = [...teamIds];
  const hasBye = teams.length % 2 !== 0;
  if (hasBye) teams.push('__BYE__');
  const n = teams.length;

  let rotation = [...teams];
  const leg1Pairs = [];

  for (let r = 0; r < n - 1; r++) {
    const roundPairs = [];
    for (let i = 0; i < n / 2; i++) {
      const t1 = rotation[i];
      const t2 = rotation[n - 1 - i];
      if (t1 !== '__BYE__' && t2 !== '__BYE__') {
        if (r % 2 === 0) roundPairs.push({ home: t1, away: t2 });
        else roundPairs.push({ home: t2, away: t1 });
      }
    }
    leg1Pairs.push(roundPairs);
    const last = rotation.pop();
    rotation.splice(1, 0, last);
  }

  const leg2Pairs = leg1Pairs.map(round =>
    round.map(f => ({ home: f.away, away: f.home }))
  );

  const shift = Math.floor((n - 1) / 2);
  const leg2Shifted = [...leg2Pairs.slice(shift), ...leg2Pairs.slice(0, shift)];

  const schedule = [];
  let rnum = 1;
  leg1Pairs.forEach(pairs => { schedule.push({ round: rnum++, fixtures: pairs }); });
  leg2Shifted.forEach(pairs => { schedule.push({ round: rnum++, fixtures: pairs }); });

  return schedule;
}

async function initFixtureSection() {
  try { await _initFixtureSectionInner(); } catch(e) {
    console.error('Fixture error:', e);
    const container = document.querySelector('[data-section="fixture"]');
    if (container) container.innerHTML = `<div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"><p class="text-red-400">Error: ${e.message}</p><button onclick="window._retryFixture()" class="mt-3 bg-white/5 text-gray-400 px-4 py-2 rounded-xl text-sm">Reintentar</button></div>`;
  }
}

async function _initFixtureSectionInner() {
  const container = document.querySelector('[data-section="fixture"]');
  if (!container) return;

  // Load data
  if (!_teamsCache.length) await loadTeams();
  await loadMatches();
  if (!_playersCache.length) await loadPlayers();
  _scheduleCache = state.activeLeague.settings?.schedule || [];

  const hasSchedule = _scheduleCache.length > 0;

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📅</span>
        <h2 class="font-display text-3xl tracking-wide text-white">FIXTURE</h2>
        <button onclick="window._showMatchHistory()" class="text-xs text-gray-500 hover:text-lime-400 bg-white/5 border border-white/10 px-2 py-1 rounded-lg transition-all">🕹 Historial</button>
      </div>
      <div class="flex gap-2">
        ${hasSchedule ? `<button onclick="window._openPlayoffs()" class="bg-purple-500/10 text-purple-400 border border-purple-400/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-purple-500/20 transition-all">🏆 Playoffs</button>` : ''}
        ${hasSchedule ? `<button id="btn-clear-fixture" class="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-500/20 transition-all">🗑 Borrar</button>` : ''}
        <button id="btn-gen-fixture" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">${hasSchedule ? '🔄 Regenerar' : '📅 Generar Fixture'}</button>
      </div>
    </div>

    <!-- Summary -->
    ${hasSchedule ? `
      <div class="grid grid-cols-3 gap-3 mb-6">
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${_scheduleCache.length}</p>
          <p class="text-xs text-gray-500 uppercase tracking-wider">Fechas</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${_scheduleCache.reduce((t, r) => t + r.fixtures.length, 0)}</p>
          <p class="text-xs text-gray-500 uppercase tracking-wider">Partidos</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-lime-400">${_matchesCache.length}</p>
          <p class="text-xs text-gray-500 uppercase tracking-wider">Jugados</p>
        </div>
      </div>
    ` : ''}

    <!-- Rounds -->
    <div id="fixture-rounds">
      ${hasSchedule ? renderFixtureRounds() : `
        <div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-2xl p-12 text-center">
          <span class="text-4xl mb-4 block">📅</span>
          <p class="text-gray-500 mb-2">No hay fixture generado</p>
          <p class="text-sm text-gray-600">Necesitás al menos 2 equipos para generar el calendario</p>
        </div>
      `}
    </div>

    <!-- Modal is global (in index.html) -->
  `;

  // Bind events
  $('btn-gen-fixture').onclick = () => {
    const activeTeams = _teamsCache.filter(t => !t.is_bye && !t.replaced);
    if (activeTeams.length < 2) { toast('⚠️ Necesitás al menos 2 equipos activos', true); return; }

    const doGen = async () => {
      const schedule = generateCalendar(activeTeams.map(t => t.id));
      _scheduleCache = schedule;
      // Save schedule in league settings
      const settings = { ...(state.activeLeague.settings || {}), schedule };
      const { error } = await supa.from('leagues').update({ settings }).eq('id', state.activeLeague.id);
      if (error) { toast('⚠️ Error: ' + error.message, true); return; }
      state.activeLeague.settings = settings;
      initFixtureSection();
      const totalGames = schedule.reduce((t, r) => t + r.fixtures.length, 0);
      toast(`📅 ${totalGames} partidos en ${schedule.length} fechas!`);
    };

    if (hasSchedule) {
      if (confirm('¿Regenerar fixture? Se borrará el actual.')) doGen();
    } else doGen();
  };

  // Render playoffs if configured
  if (state.activeLeague.settings?.playoffs) renderPlayoffsBracket();

  if ($('btn-clear-fixture')) {
    $('btn-clear-fixture').onclick = async () => {
      if (!confirm('¿Borrar fixture? Los resultados no se tocan.')) return;
      _scheduleCache = [];
      const settings = { ...(state.activeLeague.settings || {}), schedule: [] };
      const { error } = await supa.from('leagues').update({ settings }).eq('id', state.activeLeague.id);
      if (error) { toast('⚠️ Error: ' + error.message, true); return; }
      state.activeLeague.settings = settings;
      initFixtureSection();
      toast('🗑 Fixture borrado');
    };
  }
}

function renderFixtureRounds() {
  return _scheduleCache.map((round, ri) => {
    const fixtures = round.fixtures;
    const played = fixtures.filter(f => getMatchResult(f.home, f.away)).length;
    const total = fixtures.length;
    const isComplete = played === total;
    const pct = total ? Math.round(played / total * 100) : 0;

    return `<div class="mb-3">
      <button onclick="window._toggleRound(${ri})" class="w-full bg-pitch-800/60 border border-white/5 rounded-xl p-3 flex items-center justify-between hover:border-lime-400/20 transition-all">
        <div class="flex items-center gap-3">
          <span id="chev-${ri}" class="text-gray-500 transition-transform rotate-[-90deg]">▼</span>
          <span class="font-display text-lg text-white">FECHA ${round.round}</span>
          <span class="text-xs text-gray-500">${played}/${total} partidos</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-20 h-1.5 bg-pitch-700 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all ${isComplete ? 'bg-lime-400' : 'bg-lime-400/50'}" style="width:${pct}%"></div>
          </div>
          ${isComplete ? '<span class="text-lime-400 text-xs">✓</span>' : ''}
        </div>
      </button>
      <div id="round-${ri}" class="hidden mt-1 space-y-1 pl-2">
        ${fixtures.map(f => {
          const res = getMatchResult(f.home, f.away);
          const homeName = tn(f.home);
          const awayName = tn(f.away);

          if (res) {
            const hg = res.home_id === f.home ? res.home_goals : res.away_goals;
            const ag = res.home_id === f.home ? res.away_goals : res.home_goals;
            return `<div class="bg-pitch-800/40 border border-white/5 rounded-lg p-3 flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="text-sm text-white truncate flex-1 text-right">${homeName}</span>
                <span class="font-display text-lg text-lime-400 px-2">${hg} – ${ag}</span>
                <span class="text-sm text-white truncate flex-1">${awayName}</span>
              </div>
              <button onclick="window._viewMatchDetail('${res.id}')" class="text-xs text-blue-400 hover:text-blue-300 ml-1 shrink-0">📊</button>
              <button onclick="window._showH2H('${f.home}','${f.away}')" class="text-xs text-purple-400 hover:text-purple-300 ml-1 shrink-0">⚔️</button>
            </div>`;
          } else {
            return `<div class="bg-pitch-800/40 border border-white/5 rounded-lg p-3 flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="text-sm text-white truncate flex-1 text-right">${homeName}</span>
                <span class="font-display text-lg text-gray-600 px-2">vs</span>
                <span class="text-sm text-white truncate flex-1">${awayName}</span>
              </div>
              <button onclick="window._showH2H('${f.home}','${f.away}')" class="text-xs text-purple-400 hover:text-purple-300 ml-1 shrink-0">⚔️</button>
              <button onclick="window._showResultForm('${f.home}','${f.away}',${round.round})" class="text-xs bg-lime-400/10 text-lime-400 border border-lime-400/20 px-3 py-1 rounded-lg hover:bg-lime-400/20 transition-all ml-1 shrink-0">✏️</button>
            </div>`;
          }
        }).join('')}
      </div>
    </div>`;
  }).join('');
}

window._closeModal = () => {
  const el = document.getElementById('result-form');
  if (el) el.classList.add('hidden');
};

window._toggleRound = (ri) => {
  const el = $('round-' + ri);
  const chev = $('chev-' + ri);
  if (!el) return;
  const hidden = el.classList.contains('hidden');
  el.classList.toggle('hidden');
  if (chev) chev.style.transform = hidden ? '' : 'rotate(-90deg)';
};

// ─── Result Form ─────────────────────────────────────────────
window._showResultForm = (homeId, awayId, round) => {
  const body = $('result-form-body');
  if (!body) return;

  const homePlayers = _playersCache.length
    ? _playersCache.filter(p => p.team_id === homeId)
    : [];
  const awayPlayers = _playersCache.length
    ? _playersCache.filter(p => p.team_id === awayId)
    : [];

  body.innerHTML = `
    <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-5">
      <div class="text-center">
        <p class="font-semibold text-white text-sm mb-1">${tn(homeId)}</p>
        <p class="text-[10px] text-gray-500">🏠 LOCAL</p>
      </div>
      <span class="text-gray-600">vs</span>
      <div class="text-center">
        <p class="font-semibold text-white text-sm mb-1">${tn(awayId)}</p>
        <p class="text-[10px] text-gray-500">✈️ VISITANTE</p>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 30px 1fr;gap:8px;align-items:center;margin-bottom:20px;">
      <input type="number" id="rf-hg" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
      <span class="text-gray-500 text-lg text-center">–</span>
      <input type="number" id="rf-ag" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
    </div>

    <!-- Player stats (expandable) -->
    ${(homePlayers.length || awayPlayers.length) ? `
      <button id="btn-toggle-pstats" class="w-full bg-pitch-900/40 border border-white/5 rounded-xl p-2 text-xs text-gray-500 hover:text-white transition-all mb-3 text-center">📋 Agregar stats de jugadores ▼</button>
      <div id="rf-player-stats" class="hidden mb-3 max-h-60 overflow-y-auto">
        ${homePlayers.length ? `<p class="text-[10px] text-lime-400 uppercase tracking-wider mb-1 font-semibold">${tn(homeId)}</p>` : ''}
        ${homePlayers.map((p, i) => `<div class="flex items-center gap-1 py-1 border-b border-white/5 text-xs">
          <span class="text-gray-500 w-7 shrink-0">${p.pos || '?'}</span>
          <span class="text-white flex-1 truncate">${p.name}</span>
          <span class="text-gray-600">⚽</span><input type="number" id="rf-hpg-${i}" data-pid="${p.id}" data-team="home" min="0" value="0" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
          <span class="text-gray-600">🎯</span><input type="number" id="rf-hpa-${i}" min="0" value="0" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
          <span class="text-gray-600">⭐</span><input type="number" id="rf-hpr-${i}" min="0" max="10" step="0.1" value="0" class="w-11 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
        </div>`).join('')}
        ${awayPlayers.length ? `<p class="text-[10px] text-lime-400 uppercase tracking-wider mb-1 mt-2 font-semibold">${tn(awayId)}</p>` : ''}
        ${awayPlayers.map((p, i) => `<div class="flex items-center gap-1 py-1 border-b border-white/5 text-xs">
          <span class="text-gray-500 w-7 shrink-0">${p.pos || '?'}</span>
          <span class="text-white flex-1 truncate">${p.name}</span>
          <span class="text-gray-600">⚽</span><input type="number" id="rf-apg-${i}" data-pid="${p.id}" data-team="away" min="0" value="0" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
          <span class="text-gray-600">🎯</span><input type="number" id="rf-apa-${i}" min="0" value="0" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
          <span class="text-gray-600">⭐</span><input type="number" id="rf-apr-${i}" min="0" max="10" step="0.1" value="0" class="w-11 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
        </div>`).join('')}
      </div>
    ` : ''}

    <button id="btn-save-result" class="w-full bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">
      ✅ Guardar Resultado
    </button>
  `;

  $('result-form').classList.remove('hidden');

  // Toggle player stats
  const toggleBtn = $('btn-toggle-pstats');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      const el = $('rf-player-stats');
      if (el) { el.classList.toggle('hidden'); toggleBtn.textContent = el.classList.contains('hidden') ? '📋 Agregar stats de jugadores ▼' : '📋 Ocultar stats ▲'; }
    };
  }

  $('btn-save-result').onclick = async () => {
    const hg = parseInt($('rf-hg').value) || 0;
    const ag = parseInt($('rf-ag').value) || 0;

    // Collect player stats
    const playerStats = {};
    homePlayers.forEach((p, i) => {
      const goals = parseInt($(`rf-hpg-${i}`)?.value) || 0;
      const assists = parseInt($(`rf-hpa-${i}`)?.value) || 0;
      const rating = parseFloat($(`rf-hpr-${i}`)?.value) || 0;
      if (goals || assists || rating) {
        playerStats[p.id] = { goals, assists, rating, position: p.pos || '', played: true };
      }
    });
    awayPlayers.forEach((p, i) => {
      const goals = parseInt($(`rf-apg-${i}`)?.value) || 0;
      const assists = parseInt($(`rf-apa-${i}`)?.value) || 0;
      const rating = parseFloat($(`rf-apr-${i}`)?.value) || 0;
      if (goals || assists || rating) {
        playerStats[p.id] = { goals, assists, rating, position: p.pos || '', played: true };
      }
    });

    $('btn-save-result').disabled = true;
    $('btn-save-result').textContent = 'Guardando...';

    try {
      const { data, error } = await supa.from('matches').insert({
        league_id: state.activeLeague.id,
        home_id: homeId,
        away_id: awayId,
        home_goals: hg,
        away_goals: ag,
        player_stats: Object.keys(playerStats).length ? playerStats : null,
        round: round,
        date: new Date().toISOString().split('T')[0],
      }).select().single();

      if (error) throw error;

      // Update player aggregates
      for (const [pid, st] of Object.entries(playerStats)) {
        const player = _playersCache.find(p => p.id === pid);
        if (!player) continue;
        const newRatings = [...(player.ratings || [])];
        if (st.rating > 0) newRatings.push(st.rating);
        await supa.from('players').update({
          goals: (player.goals || 0) + st.goals,
          assists: (player.assists || 0) + st.assists,
          matches_played: (player.matches_played || 0) + 1,
          ratings: newRatings,
        }).eq('id', pid);
        // Update local cache
        player.goals = (player.goals || 0) + st.goals;
        player.assists = (player.assists || 0) + st.assists;
        player.matches_played = (player.matches_played || 0) + 1;
        player.ratings = newRatings;
      }

      _matchesCache.push(data);
      $('result-form').classList.add('hidden');
      $('fixture-rounds').innerHTML = renderFixtureRounds();
      toast(`✅ ${tn(homeId)} ${hg}–${ag} ${tn(awayId)}`);
    } catch(e) {
      toast('⚠️ ' + e.message, true);
    }

    $('btn-save-result').disabled = false;
    $('btn-save-result').textContent = '✅ Guardar Resultado';
  };
};

window._viewMatchDetail = async (matchId) => {
  const match = _matchesCache.find(m => m.id === matchId);
  if (!match) return;

  const ps = match.player_stats || {};
  const homeName = tn(match.home_id);
  const awayName = tn(match.away_id);

  const renderPlayers = (teamId) => {
    const entries = Object.entries(ps).filter(([pid, st]) => {
      const p = _playersCache.find(pl => pl.id === pid);
      return p && p.team_id === teamId;
    });

    if (!entries.length) return '<p class="text-gray-600 text-xs py-2">Sin stats individuales</p>';

    return entries.sort((a,b) => (b[1].rating||0) - (a[1].rating||0)).map(([pid, st]) => {
      const p = _playersCache.find(pl => pl.id === pid);
      return `<div class="flex items-center gap-2 py-1.5 border-b border-white/5 text-xs">
        <span class="text-gray-500 w-8">${st.position || p?.pos || '?'}</span>
        <span class="flex-1 text-white font-medium">${p?.name || '?'}</span>
        ${st.goals ? `<span>⚽${st.goals}</span>` : ''}
        ${st.assists ? `<span>🎯${st.assists}</span>` : ''}
        ${st.rating ? `<span class="text-yellow-400">⭐${st.rating}</span>` : ''}
      </div>`;
    }).join('');
  };

  // Show as modal
  const body = $('result-form-body');
  body.innerHTML = `
    <div class="grid grid-cols-3 gap-3 items-center text-center mb-4 py-3 bg-pitch-900/40 rounded-xl">
      <div><p class="font-display text-sm text-white">${homeName}</p></div>
      <div class="font-display text-3xl text-lime-400">${match.home_goals} – ${match.away_goals}</div>
      <div><p class="font-display text-sm text-white">${awayName}</p></div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div><p class="text-xs text-gray-500 font-semibold mb-2">🏠 ${homeName}</p>${renderPlayers(match.home_id)}</div>
      <div><p class="text-xs text-gray-500 font-semibold mb-2">✈️ ${awayName}</p>${renderPlayers(match.away_id)}</div>
    </div>
    <p class="text-xs text-gray-600 mt-3 text-center">${match.date || ''}</p>
  `;
  $('result-form').classList.remove('hidden');
};

// ═══════════════════════════════════════════════════════════════
// STANDINGS MODULE
// ═══════════════════════════════════════════════════════════════
function calculateStandings() {
  const standings = {};
  _teamsCache.filter(t => !t.is_bye && !t.replaced).forEach(t => {
    standings[t.id] = { id: t.id, name: t.name, shield_url: t.shield_url, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0, form: [] };
  });

  _matchesCache.forEach(m => {
    const h = standings[m.home_id], a = standings[m.away_id];
    if (!h || !a) return;
    h.P++; a.P++;
    h.GF += m.home_goals; h.GA += m.away_goals;
    a.GF += m.away_goals; a.GA += m.home_goals;
    if (m.home_goals > m.away_goals) { h.W++; h.Pts += 3; a.L++; h.form.push('W'); a.form.push('L'); }
    else if (m.home_goals < m.away_goals) { a.W++; a.Pts += 3; h.L++; h.form.push('L'); a.form.push('W'); }
    else { h.D++; a.D++; h.Pts++; a.Pts++; h.form.push('D'); a.form.push('D'); }
  });

  Object.values(standings).forEach(s => { s.GD = s.GF - s.GA; });
  return Object.values(standings).sort((a,b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF);
}

async function initStandingsSection() {
  try { await _initStandingsSectionInner(); } catch(e) {
    console.error('Standings error:', e);
    const container = document.querySelector('[data-section="standings"]');
    if (container) container.innerHTML = `<div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"><p class="text-red-400">Error: ${e.message}</p><button onclick="window._retryStandings()" class="mt-3 bg-white/5 text-gray-400 px-4 py-2 rounded-xl text-sm">Reintentar</button></div>`;
  }
}

async function _initStandingsSectionInner() {
  const container = document.querySelector('[data-section="standings"]');
  if (!container) return;

  if (!_teamsCache.length) await loadTeams();
  if (!_matchesCache.length) await loadMatches();

  const standings = calculateStandings();

  const formPill = (f) => {
    const colors = { W: 'bg-emerald-500', L: 'bg-red-500', D: 'bg-yellow-500' };
    return `<span class="inline-block w-5 h-5 rounded text-[10px] font-bold text-white flex items-center justify-center ${colors[f] || 'bg-gray-600'}">${f}</span>`;
  };

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-6">
      <span class="text-2xl">📊</span>
      <h2 class="font-display text-3xl tracking-wide text-white">TABLA DE POSICIONES</h2>
    </div>

    ${standings.length ? `
      <div class="bg-pitch-800/60 border border-white/5 rounded-2xl overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/10">
                <th class="text-left py-3 px-3 text-gray-500 text-xs uppercase tracking-wider w-8">#</th>
                <th class="text-left py-3 px-2 text-gray-500 text-xs uppercase tracking-wider">Equipo</th>
                <th class="text-center py-3 px-1 text-gray-500 text-xs uppercase tracking-wider">PJ</th>
                <th class="text-center py-3 px-1 text-gray-500 text-xs uppercase tracking-wider">G</th>
                <th class="text-center py-3 px-1 text-gray-500 text-xs uppercase tracking-wider">E</th>
                <th class="text-center py-3 px-1 text-gray-500 text-xs uppercase tracking-wider">P</th>
                <th class="text-center py-3 px-1 text-gray-500 text-xs uppercase tracking-wider">GF</th>
                <th class="text-center py-3 px-1 text-gray-500 text-xs uppercase tracking-wider">GC</th>
                <th class="text-center py-3 px-1 text-gray-500 text-xs uppercase tracking-wider">DG</th>
                <th class="text-center py-3 px-2 text-gray-500 text-xs uppercase tracking-wider">Pts</th>
                <th class="text-center py-3 px-2 text-gray-500 text-xs uppercase tracking-wider hidden sm:table-cell">Forma</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((s, i) => {
                const posColors = i < 1 ? 'text-lime-400 font-bold' : i < 3 ? 'text-lime-400/70' : i >= standings.length - 2 ? 'text-red-400' : 'text-gray-500';
                const streak = (() => {
                  const rev = s.form.slice().reverse();
                  if (!rev.length) return '';
                  const type = rev[0];
                  let count = 0;
                  for (const r of rev) { if (r === type) count++; else break; }
                  if (count < 3) return '';
                  const emoji = type === 'W' ? '🔥' : '❄️';
                  return `<span class="text-[10px]">${emoji}${count}</span>`;
                })();
                const shieldHtml = s.shield_url
                  ? `<img src="${s.shield_url}" class="w-6 h-6 rounded-full object-cover border border-white/10 shrink-0">`
                  : `<div class="w-6 h-6 rounded-full bg-pitch-700 border border-white/10 flex items-center justify-center text-[10px] font-display text-lime-400 shrink-0">${s.name.charAt(0)}</div>`;

                return `<tr class="border-b border-white/5 hover:bg-white/[.02] transition-colors">
                  <td class="py-2.5 px-3 ${posColors}">${i + 1}</td>
                  <td class="py-2.5 px-2">
                    <div class="flex items-center gap-2 cursor-pointer" onclick="window._viewTeamProfile('${s.id}')">
                      ${shieldHtml}
                      <span class="font-medium text-white text-sm truncate hover:text-lime-400 transition-colors">${s.name}</span>
                    </div>
                  </td>
                  <td class="text-center text-gray-400 py-2.5 px-1">${s.P}</td>
                  <td class="text-center text-gray-400 py-2.5 px-1">${s.W}</td>
                  <td class="text-center text-gray-400 py-2.5 px-1">${s.D}</td>
                  <td class="text-center text-gray-400 py-2.5 px-1">${s.L}</td>
                  <td class="text-center text-gray-400 py-2.5 px-1">${s.GF}</td>
                  <td class="text-center text-gray-400 py-2.5 px-1">${s.GA}</td>
                  <td class="text-center py-2.5 px-1 ${s.GD > 0 ? 'text-emerald-400' : s.GD < 0 ? 'text-red-400' : 'text-gray-500'}">${s.GD > 0 ? '+' : ''}${s.GD}</td>
                  <td class="text-center py-2.5 px-2 font-display text-lg text-white">${s.Pts}</td>
                  <td class="text-center py-2.5 px-2 hidden sm:table-cell">
                    <div class="flex items-center justify-center gap-0.5">
                      ${streak}${s.form.slice(-5).map(f => formPill(f)).join('')}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-lime-400">${_matchesCache.length}</p>
          <p class="text-xs text-gray-500 uppercase">Partidos</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${_matchesCache.reduce((t,m) => t + m.home_goals + m.away_goals, 0)}</p>
          <p class="text-xs text-gray-500 uppercase">Goles</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${standings.length ? standings[0].name : '—'}</p>
          <p class="text-xs text-gray-500 uppercase">Líder</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${_matchesCache.length ? (_matchesCache.reduce((t,m) => t + m.home_goals + m.away_goals, 0) / _matchesCache.length).toFixed(1) : '0'}</p>
          <p class="text-xs text-gray-500 uppercase">Goles/Partido</p>
        </div>
      </div>
    ` : `
      <div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-2xl p-12 text-center">
        <span class="text-4xl mb-4 block">📊</span>
        <p class="text-gray-500 mb-2">Sin datos para mostrar</p>
        <p class="text-sm text-gray-600">Cargá resultados en el Fixture para ver la tabla</p>
      </div>
    `}
  `;
}

// ═══════════════════════════════════════════════════════════════
// LEADERS MODULE
// ═══════════════════════════════════════════════════════════════
let _leadersSort = 'goals';

async function initLeadersSection() {
  try { await _initLeadersSectionInner(); } catch(e) {
    console.error('Leaders error:', e);
    const container = document.querySelector('[data-section="leaders"]');
    if (container) container.innerHTML = `<div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"><p class="text-red-400">Error: ${e.message}</p></div>`;
  }
}

async function _initLeadersSectionInner() {
  const container = document.querySelector('[data-section="leaders"]');
  if (!container) return;

  if (!_teamsCache.length) await loadTeams();
  if (!_playersCache.length) await loadPlayers();

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <span class="text-2xl">⭐</span>
        <h2 class="font-display text-3xl tracking-wide text-white">LÍDERES</h2>
      </div>
      <button onclick="window._comparePlayersUI()" class="bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all">⚖️ Comparar</button>
    </div>

    <!-- Sort tabs -->
    <div class="flex gap-2 mb-4 flex-wrap">
      ${[['goals','⚽ Goleadores'],['assists','🎯 Asistidores'],['rating','⭐ Rendimiento'],['matches_played','🎮 Más partidos']].map(([col, lbl]) =>
        `<button onclick="window._sortLeaders('${col}')" class="px-4 py-2 rounded-xl text-sm font-semibold transition-all ${_leadersSort === col ? 'bg-lime-400/10 text-lime-400 border border-lime-400/20' : 'bg-pitch-800/60 text-gray-500 border border-white/5 hover:text-white'}">${lbl}</button>`
      ).join('')}
    </div>

    <div id="leaders-list" class="bg-pitch-800/60 border border-white/5 rounded-2xl overflow-hidden">
      ${renderLeadersHTML()}
    </div>
  `;
}

function renderLeadersHTML() {
  const sorted = [..._playersCache].sort((a, b) => {
    if (_leadersSort === 'rating') {
      const avgA = a.ratings?.length ? a.ratings.reduce((x,y) => x + Number(y), 0) / a.ratings.length : 0;
      const avgB = b.ratings?.length ? b.ratings.reduce((x,y) => x + Number(y), 0) / b.ratings.length : 0;
      return avgB - avgA;
    }
    return (b[_leadersSort] || 0) - (a[_leadersSort] || 0);
  }).filter(p => {
    if (_leadersSort === 'goals') return p.goals > 0;
    if (_leadersSort === 'assists') return p.assists > 0;
    if (_leadersSort === 'rating') return p.ratings?.length > 0;
    return p.matches_played > 0;
  }).slice(0, 20);

  if (!sorted.length) return '<div class="p-8 text-center text-gray-600">Sin datos todavía</div>';

  return sorted.map((p, i) => {
    const avgRating = p.ratings?.length ? (p.ratings.reduce((x,y) => x + Number(y), 0) / p.ratings.length).toFixed(1) : '—';
    const mainStat = _leadersSort === 'goals' ? `⚽ ${p.goals}`
      : _leadersSort === 'assists' ? `🎯 ${p.assists}`
      : _leadersSort === 'rating' ? `⭐ ${avgRating}`
      : `🎮 ${p.matches_played}`;

    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';

    return `<div class="flex items-center gap-3 py-3 px-4 border-b border-white/5 last:border-0 hover:bg-white/[.02] transition-colors">
      <span class="w-6 text-center ${i < 3 ? 'text-lg' : 'text-gray-600 text-sm'}">${medal || (i + 1)}</span>
      <div class="flex-1 min-w-0">
        <p class="font-medium text-white text-sm truncate cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewPlayerProfile('${p.id}')">${p.name}</p>
        <p class="text-xs text-gray-500">${tn(p.team_id)}</p>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span class="font-display text-lg text-lime-400">${mainStat}</span>
        ${_leadersSort !== 'goals' ? `<span class="text-gray-600">⚽${p.goals}</span>` : ''}
        ${_leadersSort !== 'assists' ? `<span class="text-gray-600">🎯${p.assists}</span>` : ''}
        ${_leadersSort !== 'rating' ? `<span class="text-gray-600">⭐${avgRating}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

window._sortLeaders = (col) => {
  _leadersSort = col;
  initLeadersSection();
};

// ═══════════════════════════════════════════════════════════════
// SETTINGS MODULE
// ═══════════════════════════════════════════════════════════════
async function initSettingsSection() {
  try { await _initSettingsSectionInner(); } catch(e) {
    console.error('Settings error:', e);
    const container = document.querySelector('[data-section="settings"]');
    if (container) container.innerHTML = `<div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"><p class="text-red-400">Error: ${e.message}</p></div>`;
  }
}

async function _initSettingsSectionInner() {
  const container = document.querySelector('[data-section="settings"]');
  if (!container) return;

  const league = state.activeLeague;
  if (!league) return;

  if (!_teamsCache.length) await loadTeams();

  const planColors = { superadmin: 'text-yellow-400 border-yellow-400/20 bg-yellow-400/5', elite: 'text-purple-400 border-purple-400/20 bg-purple-400/5', pro: 'text-lime-400 border-lime-400/20 bg-lime-400/5', amateur: 'text-gray-400 border-gray-600 bg-white/5' };
  const planClass = planColors[league.plan_type] || planColors.amateur;

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-6">
      <span class="text-2xl">⚙️</span>
      <h2 class="font-display text-3xl tracking-wide text-white">AJUSTES</h2>
    </div>

    <!-- League info -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Máx equipos</label>
          <div class="flex items-center gap-2">
            <span class="w-full bg-pitch-900/30 border border-white/5 rounded-xl px-4 py-2.5 text-gray-400 text-sm">${getPlanLimits(league.plan_type).maxTeams === 999 ? 'Ilimitado' : getPlanLimits(league.plan_type).maxTeams}</span>
          </div>
          <p class="text-xs text-gray-600 mt-1">Determinado por tu plan (${league.plan_type.toUpperCase()})</p>
        </div>
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Máx jugadores / equipo</label>
          <input id="set-max-players" type="number" value="${league.max_players_per_team}" min="5" max="${getPlanLimits(league.plan_type).maxPlayers}" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-lime-400/40 text-sm">
          <p class="text-xs text-gray-600 mt-1">Máximo permitido: ${getPlanLimits(league.plan_type).maxPlayers === 999 ? 'Ilimitado' : getPlanLimits(league.plan_type).maxPlayers}</p>
        </div>
      </div>
      <div class="flex flex-col gap-3 mt-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="set-is-public" ${league.is_public ? 'checked' : ''} class="w-4 h-4 accent-lime-400">
          <span class="text-sm text-gray-400">🌐 Liga pública (visible en el buscador)</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="set-require-photos" ${league.settings?.requirePhotos ? 'checked' : ''} class="w-4 h-4 accent-lime-400">
          <span class="text-sm text-gray-400">📸 Fotos obligatorias para DTs (deben subir al menos 1 foto)</span>
        </label>
      </div>
      <button id="btn-save-settings" class="mt-4 bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2.5 px-6 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">
        💾 Guardar Cambios
      </button>
      <div id="settings-msg" class="hidden mt-3 text-sm text-center py-2 px-4 rounded-lg"></div>
    </div>

    <!-- Team codes -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="font-display text-lg text-white mb-3">🔑 Códigos de DT</h3>
      <p class="text-xs text-gray-500 mb-3">Compartí estos códigos con los DTs para que puedan subir capturas</p>
      <div class="space-y-2" id="team-codes-list">
        ${renderTeamCodes()}
      </div>
    </div>

    <!-- Danger zone -->
    <div class="bg-pitch-800/60 border border-red-500/20 rounded-2xl p-5">
      <h3 class="font-display text-lg text-red-400 mb-3">⚠️ Zona Peligrosa</h3>
      <div class="flex gap-3 flex-wrap">
        <button id="btn-reset-stats" class="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-500/20 transition-all">🔄 Resetear Stats</button>
        <button id="btn-delete-league" class="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-500/20 transition-all">🗑 Eliminar Liga</button>
      </div>
    </div>
  `;

  // Save settings
  $('btn-save-settings').onclick = async () => {
    const btn = $('btn-save-settings');
    const msgEl = $('settings-msg');
    btn.disabled = true; btn.textContent = 'Guardando...';

    try {
      const requirePhotos = $('set-require-photos')?.checked || false;
      const updates = {
        max_players_per_team: parseInt($('set-max-players').value) || 15,
        is_public: $('set-is-public').checked,
        settings: { ...(league.settings || {}), requirePhotos },
      };
      // Enforce player limit by plan
      const saveLimits = getPlanLimits(league.plan_type);
      if (updates.max_players_per_team > saveLimits.maxPlayers) {
        updates.max_players_per_team = saveLimits.maxPlayers;
      }
      // max_teams is always determined by plan, never editable
      updates.max_teams = saveLimits.maxTeams;

      const { error } = await supa.from('leagues').update(updates).eq('id', league.id);
      if (error) throw error;

      Object.assign(league, updates);
      // Update in leagues list too
      const idx = state.leagues.findIndex(l => l.id === league.id);
      if (idx >= 0) Object.assign(state.leagues[idx], updates);

      msgEl.textContent = '✅ Cambios guardados';
      msgEl.className = 'mt-3 text-sm text-center py-2 px-4 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      msgEl.classList.remove('hidden');
      

    } catch(e) {
      msgEl.textContent = '⚠️ ' + e.message;
      msgEl.className = 'mt-3 text-sm text-center py-2 px-4 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20';
      msgEl.classList.remove('hidden');
    }

    btn.disabled = false; btn.textContent = '💾 Guardar Cambios';
  };

  // Reset stats
  $('btn-reset-stats').onclick = async () => {
    if (!confirm('¿Resetear TODAS las estadísticas? Se borran partidos, goles, asistencias, ratings. Los equipos y jugadores se mantienen. No se puede deshacer.')) return;
    if (!confirm('¿Estás SEGURO? Esta acción es irreversible.')) return;

    try {
      // Delete all matches
      const { error: matchErr } = await supa.from('matches').delete().eq('league_id', league.id);
      if (matchErr) throw matchErr;

      // Reset all player stats
      const { error: playerErr } = await supa.from('players').update({
        goals: 0, assists: 0, cs: 0, matches_played: 0, ratings: []
      }).eq('league_id', league.id);
      if (playerErr) throw playerErr;

      // Clear schedule
      const settings = { ...(league.settings || {}), schedule: [] };
      await supa.from('leagues').update({ settings }).eq('id', league.id);
      league.settings = settings;

      _matchesCache = [];
      _scheduleCache = [];
      toast('🔄 Estadísticas reseteadas');
    } catch(e) { toast('⚠️ ' + e.message, true); }
  };

  // Delete league
  $('btn-delete-league').onclick = async () => {
    if (!confirm('¿Eliminar esta liga completamente? Se borran todos los equipos, jugadores, partidos y datos. No se puede deshacer.')) return;
    if (!confirm('¿Estás SEGURO? Esta acción es IRREVERSIBLE.')) return;

    try {
      const { error } = await supa.from('leagues').delete().eq('id', league.id);
      if (error) throw error;

      state.leagues = state.leagues.filter(l => l.id !== league.id);
      state.activeLeague = null;
      _teamsCache = []; _playersCache = []; _matchesCache = []; _scheduleCache = [];
      _bound.dash = false;
      _bound.hub = false;
      showScreen('hub');
      initHubUI();
      toast('🗑 Liga eliminada');
    } catch(e) { toast('⚠️ ' + e.message, true); }
  };
}

function renderTeamCodes() {
  if (!_teamsCache.length) return '<p class="text-gray-600 text-sm">Sin equipos</p>';

  return _teamsCache.filter(t => !t.is_bye && !t.replaced).map(t => {
    return `<div class="flex items-center justify-between py-2 px-3 bg-pitch-900/30 rounded-lg">
      <span class="text-sm text-white font-medium">${t.name}</span>
      <div class="flex items-center gap-2">
        <code class="text-xs text-lime-400 bg-lime-400/10 px-2 py-1 rounded font-mono">${t.code || '—'}</code>
        ${t.code ? `<button onclick="navigator.clipboard.writeText('${t.code}');window._settingsToast('📋 Copiado')" class="text-xs text-gray-500 hover:text-white transition-colors">📋</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

window._settingsToast = (msg) => toast(msg);

// ═══════════════════════════════════════════════════════════════
// ADMIN SUBMISSIONS INBOX
// ═══════════════════════════════════════════════════════════════
async function loadAdminSubmissions() {
  const list = $('admin-submissions-list');
  if (!list) return;

  try {
    const { data: pending } = await supa.from('submissions').select('*')
      .eq('league_id', state.activeLeague.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const { data: recent } = await supa.from('submissions').select('*')
      .eq('league_id', state.activeLeague.id)
      .neq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      .order('created_at', { ascending: false });

    const badge = $('sub-count-badge');
    if (badge) badge.textContent = pending?.length ? pending.length + ' pendientes' : '';

    let html = '';

    if (pending?.length) {
      html += pending.map(sub => {
        const sc = sub.scan_result?.score || {};
        const ps = sub.scan_result?.playerStats || {};
        const playerCount = Object.keys(ps).length;
        const hasDetail = playerCount > 0;
        const subType = sub.scan_result?.submissionType || 'rápido';

        return `<div class="bg-pitch-800/60 border border-lime-400/20 rounded-2xl p-4 mb-3 glow">
          <div class="flex items-center justify-between mb-3">
            <div>
              <span class="text-xs text-lime-400 font-semibold uppercase tracking-wider">⏳ Pendiente</span>
              <span class="text-xs text-gray-600 ml-2">${new Date(sub.created_at).toLocaleString()}</span>
            </div>
            <span class="text-[10px] text-gray-500 bg-pitch-900/40 px-2 py-0.5 rounded">${subType}</span>
          </div>

          <!-- Score -->
          <div class="flex items-center justify-center gap-4 py-3 bg-pitch-900/40 rounded-xl mb-3">
            <span class="text-sm text-white font-medium">${sc.home || '?'}</span>
            <span class="font-display text-2xl text-lime-400">${sc.homeGoals ?? '?'} – ${sc.awayGoals ?? '?'}</span>
            <span class="text-sm text-white font-medium">${sc.away || '?'}</span>
          </div>

          ${sub.team_name ? `<p class="text-xs text-gray-500 mb-2">Enviado por: <span class="text-white">${sub.team_name}</span></p>` : ''}
          ${hasDetail ? `<p class="text-xs text-gray-600 mb-2">📋 ${playerCount} jugadores con stats</p>` : ''}

          <!-- Photo thumbnails -->
          ${(sub.scan_result?.photos?.length) ? `
            <div class="flex gap-1 mb-3 overflow-x-auto">
              ${sub.scan_result.photos.map((ph, pi) => `<img src="${ph}" class="h-14 w-20 object-cover rounded-lg border border-white/10 cursor-pointer shrink-0 hover:border-lime-400/30 transition-all" onclick="window._previewPhoto('${sub.id}', ${pi})">`).join('')}
            </div>
          ` : ''}

          <!-- Actions -->
          <div class="flex gap-2 mt-3">
            <button onclick="window._adminApproveSub('${sub.id}')" class="flex-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-500/20 transition-all">✅ Aprobar</button>
            <button onclick="window._adminRejectSub('${sub.id}')" class="flex-1 bg-red-500/10 text-red-400 border border-red-500/20 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-500/20 transition-all">✕ Rechazar</button>
          </div>
        </div>`;
      }).join('');
    } else {
      html += '<div class="bg-pitch-800/40 border border-white/5 rounded-xl p-6 text-center text-gray-600 text-sm">Sin submissions pendientes</div>';
    }

    // Recent history
    if (recent?.length) {
      html += `<div class="mt-4 opacity-60">
        <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">📋 Historial (24h)</p>
        ${recent.map(sub => {
          const sc = sub.scan_result?.score || {};
          const icon = sub.status === 'approved' ? '✅' : '✕';
          const color = sub.status === 'approved' ? 'text-emerald-400' : 'text-red-400';
          return `<div class="flex items-center justify-between py-2 border-b border-white/5 text-sm">
            <span class="${color} font-semibold">${icon} ${sc.home || '?'} ${sc.homeGoals ?? '?'}–${sc.awayGoals ?? '?'} ${sc.away || '?'}</span>
            <span class="text-xs text-gray-600">${sub.status} · ${new Date(sub.created_at).toLocaleString()}</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    list.innerHTML = html;
  } catch(e) {
    console.error('Load submissions error:', e);
    list.innerHTML = '<div class="text-red-400 text-sm text-center py-4">Error cargando submissions</div>';
  }
}

window._adminApproveSub = async (subId) => {
  try {
    // Get the submission data
    const { data: sub, error: fetchErr } = await supa.from('submissions').select('*').eq('id', subId).single();
    if (fetchErr) throw fetchErr;

    const sc = sub.scan_result;
    const homeId = sc.homeId || sc.score?.homeId;
    const awayId = sc.awayId || sc.score?.awayId;
    const hg = sc.score?.homeGoals ?? 0;
    const ag = sc.score?.awayGoals ?? 0;
    const ps = sc.playerStats || {};

    if (homeId && awayId) {
      // Save match
      const { error: matchErr } = await supa.from('matches').insert({
        league_id: state.activeLeague.id,
        home_id: homeId,
        away_id: awayId,
        home_goals: hg,
        away_goals: ag,
        player_stats: ps,
        date: new Date().toISOString().split('T')[0],
      });
      if (matchErr) throw matchErr;

      // Update player aggregate stats
      for (const [playerId, st] of Object.entries(ps)) {
        if (!st.played) continue;
        const { data: player } = await supa.from('players').select('goals, assists, cs, matches_played, ratings').eq('id', playerId).single();
        if (!player) continue;
        const newRatings = [...(player.ratings || [])];
        if (st.rating > 0) newRatings.push(st.rating);
        const isGK = ['GK','POR','PO'].includes((st.position || '').toUpperCase());
        const isHome = (await supa.from('players').select('team_id').eq('id', playerId).single()).data?.team_id === homeId;
        const autoCS = isGK && (isHome ? ag === 0 : hg === 0);
        await supa.from('players').update({
          goals: (player.goals || 0) + (st.goals || 0),
          assists: (player.assists || 0) + (st.assists || 0),
          cs: (player.cs || 0) + (autoCS || st.cs ? 1 : 0),
          matches_played: (player.matches_played || 0) + 1,
          ratings: newRatings,
        }).eq('id', playerId);
      }
    }

    // Mark as approved
    await supa.from('submissions').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', subId);
    toast('✅ Submission aprobada y partido guardado');
    loadAdminSubmissions();
    // Refresh matches cache
    await loadMatches();
  } catch(e) {
    console.error('Approve error:', e);
    toast('⚠️ Error: ' + e.message, true);
  }
};

window._adminRejectSub = async (subId) => {
  if (!confirm('¿Rechazar esta submission? El DT tendrá que reenviar.')) return;
  try {
    await supa.from('submissions').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', subId);
    toast('✕ Submission rechazada');
    loadAdminSubmissions();
  } catch(e) {
    toast('⚠️ Error: ' + e.message, true);
  }
};

// ═══════════════════════════════════════════════════════════════
// DT (CAPTAIN) MODULE — Single progressive form
// ═══════════════════════════════════════════════════════════════
let _dtTeam = null;
let _dtLeague = null;
let _dtPlayers = [];
let _dtPhotos = [];

function initPublicDTButton() {
  const btn = $('btn-goto-dt');
  if (btn) btn.onclick = () => showDTCodeEntry();
}

function showDTCodeEntry() {
  showScreen('dt');
  const content = $('dt-content');
  content.innerHTML = `
    <div class="max-w-sm mx-auto pt-12 text-center">
      <div class="text-5xl mb-4">🔑</div>
      <h2 class="font-display text-3xl text-white mb-2">ACCESO RÁPIDO</h2>
      <p class="text-sm text-gray-500 mb-6">Ingresá el código de tu equipo para enviar resultados sin crear cuenta</p>

      <input id="dt-code-input" type="text" placeholder="Ej: HK3T47" maxlength="10"
        class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-4 py-3.5 text-white text-center font-mono text-xl tracking-[.3em] uppercase placeholder-gray-600 outline-none focus:border-lime-400/40 mb-4">
      <button id="btn-dt-enter" class="w-full bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">
        Entrar
      </button>

      <div id="dt-code-error" class="hidden mt-4 text-sm text-center py-2 px-4 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20"></div>

      <p class="text-xs text-gray-600 mt-6">¿Tenés cuenta? <button onclick="showScreen('auth');initLoginUI&&initLoginUI()" class="text-lime-400 hover:text-lime-300">Iniciá sesión</button> para ver todas tus ligas y equipos</p>
    </div>
  `;

  $('dt-code-input').onkeydown = e => { if (e.key === 'Enter') $('btn-dt-enter').click(); };

  $('btn-dt-enter').onclick = async () => {
    const code = $('dt-code-input').value.trim().toUpperCase();
    const errEl = $('dt-code-error');
    if (!code) { errEl.textContent = 'Ingresá un código'; errEl.classList.remove('hidden'); return; }

    $('btn-dt-enter').disabled = true;
    $('btn-dt-enter').textContent = 'Verificando...';

    try {
      // Search for team with this code across ALL public leagues
      const { data: teams, error } = await supa.from('teams').select('*, leagues!inner(id, name, plan_type, max_players_per_team, settings, is_public)')
        .eq('code', code).limit(1);

      if (error) throw error;
      if (!teams?.length) { errEl.textContent = 'Código no encontrado'; errEl.classList.remove('hidden'); throw new Error('skip'); }

      const team = teams[0];
      _dtTeam = team;
      _dtLeague = team.leagues;

      // Load players for this team
      const { data: players } = await supa.from('players').select('*').eq('team_id', team.id).order('name');
      _dtPlayers = players || [];

      // Show league name
      const leagueNameEl = $('dt-league-name');
      if (leagueNameEl) leagueNameEl.textContent = _dtLeague.name;

      // Show submission form
      showDTSubmissionForm();

    } catch(e) {
      if (e.message !== 'skip') { errEl.textContent = 'Error: ' + e.message; errEl.classList.remove('hidden'); }
    }

    $('btn-dt-enter').disabled = false;
    $('btn-dt-enter').textContent = 'Entrar';
  };

  $('btn-dt-back').onclick = () => { _dtTeam = null; _dtLeague = null; _dtPlayers = []; _dtPhotos = []; showScreen('public'); };

}

function showDTSubmissionForm() {
  const content = $('dt-content');
  const team = _dtTeam;
  const league = _dtLeague;
  const canScan = ['pro', 'elite', 'superadmin'].includes(league.plan_type);
  _dtPhotos = [];

  // Add navigation tabs for DT
  const tabsHtml = `
    <div class="flex gap-1 mb-4 overflow-x-auto pb-1">
      <button onclick="window._dtSendAnother()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20 shrink-0">📤 Enviar Resultado</button>
      <button onclick="window._dtViewStandings()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 hover:text-white shrink-0">📊 Tabla</button>
      <button onclick="window._dtViewFixture()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 hover:text-white shrink-0">📅 Fixture</button>
      <button onclick="window._dtViewLeaders()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 hover:text-white shrink-0">⭐ Líderes</button>
    </div>
  `;

  const shieldHtml = team.shield_url
    ? `<img src="${team.shield_url}" class="w-12 h-12 rounded-full object-cover border-2 border-lime-400/20">`
    : `<div class="w-12 h-12 rounded-full bg-pitch-700 border-2 border-lime-400/20 flex items-center justify-center text-xl font-display text-lime-400">${team.name.charAt(0)}</div>`;

  content.innerHTML = `
    ${tabsHtml}

    <!-- Team header -->
    <div class="flex items-center gap-4 mb-6">
      ${shieldHtml}
      <div>
        <h2 class="font-display text-2xl text-white">${team.name}</h2>
        <p class="text-xs text-gray-500">${league.name} · ${_dtPlayers.length} jugadores</p>
      </div>
    </div>

    <!-- STEP 1: Score (always visible) -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-4">📊 Resultado del partido</h3>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1">🏠 Local</label>
          <select id="dt-home-team" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
            <option value="">— Elegí —</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">✈️ Visitante</label>
          <select id="dt-away-team" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
            <option value="">— Elegí —</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 30px 1fr;gap:8px;align-items:center;">
        <input type="number" id="dt-hg" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-3 text-white text-center font-display text-3xl outline-none focus:border-lime-400/40">
        <span class="text-gray-500 text-xl text-center">–</span>
        <input type="number" id="dt-ag" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-3 text-white text-center font-display text-3xl outline-none focus:border-lime-400/40">
      </div>
    </div>

    <!-- STEP 2: Photo proof (optional by default) -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">📸 Fotos de prueba <span class="text-gray-700">(opcional)</span></h3>
      <p class="text-xs text-gray-600 mb-3">Subí capturas como comprobante para que el admin verifique</p>
      <div class="grid grid-cols-2 gap-2 mb-3">
        ${[
          { idx: 0, icon: '📊', label: 'Marcador' },
          { idx: 1, icon: '👥', label: 'Jugadores' },
          { idx: 2, icon: '📈', label: 'Stats Local' },
          { idx: 3, icon: '📈', label: 'Stats Visitante' },
        ].map(p => `<div class="relative">
          <input type="file" accept="image/*,image/heic,image/heif" capture="environment" id="dt-photo-${p.idx}" class="hidden" onchange="window._dtPhotoChange(${p.idx}, event)">
          <label for="dt-photo-${p.idx}" id="dt-photo-zone-${p.idx}" class="block bg-pitch-900/40 border-2 border-dashed border-white/10 rounded-xl p-3 text-center cursor-pointer hover:border-lime-400/30 transition-all min-h-[70px] flex flex-col items-center justify-center gap-1">
            <span class="text-lg">${p.icon}</span>
            <span class="text-[10px] text-gray-600">${p.label}</span>
          </label>
          <img id="dt-photo-preview-${p.idx}" class="hidden absolute inset-0 w-full h-full object-cover rounded-xl">
        </div>`).join('')}
      </div>
    </div>

    <!-- STEP 3: Player details (expandable) -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl overflow-hidden mb-4">
      <button id="btn-dt-expand-detail" class="w-full p-4 flex items-center justify-between text-left hover:bg-white/[.02] transition-all" onclick="window._dtToggleDetail()">
        <div>
          <h3 class="text-sm text-white font-semibold">📋 Agregar detalle de jugadores</h3>
          <p class="text-xs text-gray-500">Goles, asistencias y más por jugador</p>
        </div>
        <span id="dt-detail-chevron" class="text-gray-500 transition-transform rotate-[-90deg]">▼</span>
      </button>
      <div id="dt-detail-section" class="hidden border-t border-white/5">
        <!-- Detail level selector -->
        <div class="p-4 border-b border-white/5 flex gap-2">
          <button onclick="window._dtSetDetailLevel('medio')" id="dt-level-medio" class="flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-lime-400/10 text-lime-400 border border-lime-400/20">📊 Goles + Asistencias</button>
          <button onclick="window._dtSetDetailLevel('completo')" id="dt-level-completo" class="flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-pitch-800 text-gray-500 border border-white/5">🏟 Todo (Rating + Posición)</button>
        </div>
        <!-- Player list -->
        <div class="p-4" id="dt-players-form">
          ${renderDTPlayerFields('medio')}
        </div>
      </div>
    </div>

    <!-- AI Auto-fill button -->
    <div class="bg-pitch-800/60 border ${canScan ? 'border-purple-400/20' : 'border-white/5'} rounded-2xl p-5 mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold ${canScan ? 'text-purple-400' : 'text-gray-600'}">🤖 Auto-llenar con IA</h3>
          <p class="text-xs ${canScan ? 'text-gray-500' : 'text-gray-700'}">${canScan ? 'La IA lee tus fotos y rellena todo automáticamente' : 'Función disponible en plan Pro — contactá a tu admin'}</p>
        </div>
        <button id="btn-dt-ai" ${canScan ? '' : 'disabled'} onclick="window._dtRunAI()"
          class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${canScan
            ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-400 hover:to-indigo-400 shadow-lg shadow-purple-500/10'
            : 'bg-pitch-700 text-gray-600 cursor-not-allowed'}">
          🤖 Escanear
        </button>
      </div>
    </div>

    <!-- Ad banner for amateur leagues -->
    ${league.plan_type === 'amateur' ? `
      <div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-xl p-3 mb-4 text-center">
        <p class="text-[10px] text-gray-700 uppercase tracking-wider">Espacio publicitario</p>
      </div>
    ` : ''}

    <!-- Submit button -->
    <button id="btn-dt-submit" onclick="window._dtSubmit()" class="w-full bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-4 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98] mb-4">
      📤 Enviar al Admin
    </button>

    <p class="text-xs text-gray-600 text-center">El admin revisará y aprobará tu resultado</p>
  `;

  // Load teams for dropdowns
  loadDTTeamDropdowns();

  // Bind back button
  $('btn-dt-back').onclick = () => {
    _dtTeam = null; _dtLeague = null; _dtPlayers = []; _dtPhotos = [];
    showScreen('public');
  };
}

function renderDTPlayerFields(level) {
  if (!_dtPlayers.length) return '<p class="text-gray-600 text-sm text-center py-4">Sin jugadores registrados</p>';

  const showRating = level === 'completo';
  return _dtPlayers.map((p, i) => `
    <div class="flex items-center gap-2 py-2 border-b border-white/5 last:border-0 flex-wrap">
      <span class="text-xs text-gray-500 w-7 shrink-0">${p.pos || '?'}</span>
      <span class="text-sm text-white font-medium flex-1 min-w-[100px]">${p.name}</span>
      <div class="flex items-center gap-1">
        <span class="text-xs text-gray-600">⚽</span>
        <input type="number" id="dt-pg-${i}" min="0" value="0" class="w-10 bg-pitch-900/60 border border-white/10 rounded-lg px-1 py-1 text-white text-center text-xs outline-none focus:border-lime-400/40">
      </div>
      <div class="flex items-center gap-1">
        <span class="text-xs text-gray-600">🎯</span>
        <input type="number" id="dt-pa-${i}" min="0" value="0" class="w-10 bg-pitch-900/60 border border-white/10 rounded-lg px-1 py-1 text-white text-center text-xs outline-none focus:border-lime-400/40">
      </div>
      ${showRating ? `
        <div class="flex items-center gap-1">
          <span class="text-xs text-gray-600">⭐</span>
          <input type="number" id="dt-pr-${i}" min="0" max="10" step="0.1" value="0" class="w-12 bg-pitch-900/60 border border-white/10 rounded-lg px-1 py-1 text-white text-center text-xs outline-none focus:border-lime-400/40">
        </div>
        <select id="dt-pp-${i}" class="bg-pitch-900/60 border border-white/10 rounded-lg px-1 py-1 text-white text-xs outline-none w-14">
          <option value="">POS</option>
          <option value="POR">POR</option><option value="DFC">DFC</option><option value="LI">LI</option><option value="LD">LD</option>
          <option value="MCD">MCD</option><option value="MC">MC</option><option value="MCO">MCO</option><option value="MI">MI</option><option value="MD">MD</option>
          <option value="EI">EI</option><option value="ED">ED</option><option value="DC">DC</option><option value="MP">MP</option>
        </select>
      ` : ''}
    </div>
  `).join('');
}

async function loadDTTeamDropdowns() {
  // Load all teams in this league
  const { data: teams } = await supa.from('teams').select('id, name')
    .eq('league_id', _dtLeague.id).eq('is_bye', false).eq('replaced', false);
  if (!teams) return;

  const opts = teams.map(t => `<option value="${t.id}" ${t.id === _dtTeam.id ? 'selected' : ''}>${t.name}</option>`).join('');
  const homeEl = $('dt-home-team');
  const awayEl = $('dt-away-team');
  if (homeEl) homeEl.innerHTML = `<option value="">— Elegí —</option>${opts}`;
  if (awayEl) awayEl.innerHTML = `<option value="">— Elegí —</option>${opts}`;
}

// ─── DT UI handlers ──────────────────────────────────────────
window._dtPhotoChange = (index, event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    _dtPhotos[index] = ev.target.result;
    const preview = $(`dt-photo-preview-${index}`);
    if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
    const zone = $(`dt-photo-zone-${index}`);
    if (zone) zone.style.borderColor = 'rgba(0,255,135,.4)';
  };
  reader.readAsDataURL(file);
};

window._dtSendAnother = () => { showDTSubmissionForm(); };
window._retryTeams = () => { initTeamsSection(); };
window._retryFixture = () => { initFixtureSection(); };
window._retryStandings = () => { initStandingsSection(); };
window._openPlayoffs = () => { initPlayoffsSection(); };
window._refreshInbox = () => { initInboxSection(); };
window._dtExit = () => { _dtTeam = null; _dtLeague = null; _dtPlayers = []; _dtPhotos = []; showScreen('public'); };

window._dtToggleDetail = () => {
  const section = $('dt-detail-section');
  const chev = $('dt-detail-chevron');
  if (!section) return;
  section.classList.toggle('hidden');
  if (chev) chev.style.transform = section.classList.contains('hidden') ? 'rotate(-90deg)' : '';
};

let _dtDetailLevel = 'medio';
window._dtSetDetailLevel = (level) => {
  _dtDetailLevel = level;
  const form = $('dt-players-form');
  if (form) form.innerHTML = renderDTPlayerFields(level);
  // Update button styles
  const medioBtn = $('dt-level-medio');
  const compBtn = $('dt-level-completo');
  if (level === 'medio') {
    if (medioBtn) medioBtn.className = 'flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-lime-400/10 text-lime-400 border border-lime-400/20';
    if (compBtn) compBtn.className = 'flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-pitch-800 text-gray-500 border border-white/5';
  } else {
    if (compBtn) compBtn.className = 'flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-lime-400/10 text-lime-400 border border-lime-400/20';
    if (medioBtn) medioBtn.className = 'flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-pitch-800 text-gray-500 border border-white/5';
  }
};

// ─── AI Auto-fill ────────────────────────────────────────────
window._dtRunAI = async () => {
  const photos = _dtPhotos.filter(Boolean);
  if (!photos.length) { toast('⚠️ Subí al menos una foto primero', true); return; }

  const btn = $('btn-dt-ai');
  btn.disabled = true;
  btn.innerHTML = '<svg class="animate-spin h-4 w-4 inline mr-1" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Escaneando...';

  try {
    // Get session token for Edge Function auth
    const { data: { session } } = await supa.auth.getSession();
    let authHeader = '';
    if (session) {
      authHeader = `Bearer ${session.access_token}`;
    }

    // Label photos for AI context
    const labeledPhotos = [];
    const labels = ['score', 'players', 'stats_home', 'stats_away'];
    _dtPhotos.forEach((photo, i) => {
      if (photo) labeledPhotos.push({ image: photo, type: labels[i] || 'unknown' });
    });

    // Call Edge Function
    const res = await fetch(`${supa.supabaseUrl}/functions/v1/scan-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {}),
      },
      body: JSON.stringify({
        images: labeledPhotos.map(p => p.image),
        image_labels: labeledPhotos.map(p => p.type),
        registered_players: _dtPlayers.map(p => ({ id: p.id, name: p.name, pos: p.pos })),
        league_id: _dtLeague.id,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.message || data.error || 'Error del servidor');

    const result = data.result;

    // Fill in score
    if (result.score) {
      if ($('dt-hg')) $('dt-hg').value = result.score.homeGoals ?? 0;
      if ($('dt-ag')) $('dt-ag').value = result.score.awayGoals ?? 0;
    }

    // Expand detail section and switch to completo
    const section = $('dt-detail-section');
    if (section) section.classList.remove('hidden');
    window._dtSetDetailLevel('completo');

    // Fill in player stats
    if (result.stats) {
      const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      result.stats.forEach(sp => {
        const idx = _dtPlayers.findIndex(p => {
          const pn = norm(p.name), sn = norm(sp.name);
          return pn === sn || pn.includes(sn) || sn.includes(pn);
        });
        if (idx < 0) return;
        const gEl = $(`dt-pg-${idx}`), aEl = $(`dt-pa-${idx}`), rEl = $(`dt-pr-${idx}`), pEl = $(`dt-pp-${idx}`);
        if (gEl) gEl.value = sp.goals || 0;
        if (aEl) aEl.value = sp.assists || 0;
        if (rEl) rEl.value = sp.rating || 0;
        if (pEl) pEl.value = (sp.pos || sp.position || '').toUpperCase();
      });
    }

    toast('✅ IA completó los datos — revisá antes de enviar');
  } catch(e) {
    console.error('AI scan error:', e);
    toast('⚠️ ' + e.message, true);
  }

  btn.disabled = false;
  btn.innerHTML = '🤖 Escanear';
};

// ─── Submit to admin ─────────────────────────────────────────
window._dtSubmit = async () => {
  const homeId = $('dt-home-team')?.value;
  const awayId = $('dt-away-team')?.value;
  const hg = parseInt($('dt-hg')?.value ?? 0);
  const ag = parseInt($('dt-ag')?.value ?? 0);
  const photos = _dtPhotos.filter(Boolean);

  if (!homeId || !awayId) { toast('⚠️ Seleccioná ambos equipos', true); return; }
  if (homeId === awayId) { toast('⚠️ Los equipos no pueden ser iguales', true); return; }
  // Check if league requires photos
  if (_dtLeague.settings?.requirePhotos && !photos.length) {
    toast('⚠️ Tu admin requiere al menos 1 foto como comprobante', true); return;
  }

  const btn = $('btn-dt-submit');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    // Gather player stats
    const playerStats = {};
    _dtPlayers.forEach((p, i) => {
      const goals = parseInt($(`dt-pg-${i}`)?.value ?? 0);
      const assists = parseInt($(`dt-pa-${i}`)?.value ?? 0);
      const rating = parseFloat($(`dt-pr-${i}`)?.value ?? 0);
      const pos = $(`dt-pp-${i}`)?.value || p.pos || '';
      if (goals || assists || rating) {
        playerStats[p.id] = { goals, assists, rating, position: pos.toUpperCase(), played: true };
      }
    });

    // Build scan_result object
    // Compress photos to small thumbnails for admin preview (keeps submission size manageable)
    const photoThumbs = [];
    for (const photo of photos) {
      try {
        const thumb = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 120; canvas.height = 90;
            const ctx = canvas.getContext('2d');
            const scale = Math.min(120 / img.width, 90 / img.height);
            const w = img.width * scale, h = img.height * scale;
            ctx.drawImage(img, (120 - w) / 2, (90 - h) / 2, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
          };
          img.onerror = () => resolve(null);
          img.src = photo;
        });
        if (thumb) photoThumbs.push(thumb);
      } catch(e) {}
    }

    const scanResult = {
      score: { home: $('dt-home-team')?.selectedOptions[0]?.text || '', away: $('dt-away-team')?.selectedOptions[0]?.text || '', homeGoals: hg, awayGoals: ag },
      homeId, awayId, playerStats,
      submittedBy: _dtTeam.name,
      submissionType: _dtDetailLevel,
      photos: photoThumbs,
    };

    // Insert submission (DT is NOT logged in — uses public_insert RLS policy)
    const { error } = await supa.from('submissions').insert({
      league_id: _dtLeague.id,
      team_code: _dtTeam.code,
      team_name: _dtTeam.name,
      scan_result: scanResult,
      status: 'pending',
    });

    if (error) {
      console.error('Submission insert error:', error);
      throw new Error(error.message || 'Error al enviar');
    }

    // Show confirmation screen instead of just a toast
    showDTConfirmation(scanResult);
    return; // Don't reset form — confirmation screen replaces it

    // Reset form (kept for reference but unreachable)
    $('dt-hg').value = 0;
    $('dt-ag').value = 0;
    _dtPhotos = [];
    [0,1,2,3].forEach(i => {
      const p = $(`dt-photo-preview-${i}`);
      const z = $(`dt-photo-zone-${i}`);
      if (p) { p.classList.add('hidden'); p.src = ''; }
      if (z) z.style.borderColor = '';
      const inp = $(`dt-photo-${i}`);
      if (inp) inp.value = '';
    });
    // Reset player fields
    _dtPlayers.forEach((_, i) => {
      [$(`dt-pg-${i}`), $(`dt-pa-${i}`), $(`dt-pr-${i}`)].forEach(el => { if (el) el.value = 0; });
      const posEl = $(`dt-pp-${i}`);
      if (posEl) posEl.value = '';
    });

  } catch(e) {
    console.error('Submit error:', e);
    toast('⚠️ Error al enviar: ' + e.message, true);
  }

  btn.disabled = false;
  btn.textContent = '📤 Enviar al Admin';
};

// ═══════════════════════════════════════════════════════════════
// SUBMISSIONS INBOX (Admin)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// INBOX SECTION (dedicated tab)
// ═══════════════════════════════════════════════════════════════
async function initInboxSection() {
  const container = document.querySelector('[data-section="inbox"]');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📥</span>
        <h2 class="font-display text-3xl tracking-wide text-white">BANDEJA</h2>
        <span id="inbox-count" class="text-xs text-gray-500"></span>
      </div>
      <button onclick="window._refreshInbox()" class="text-xs text-gray-500 hover:text-lime-400 transition-colors">🔄 Actualizar</button>
    </div>
    <div id="admin-submissions-list"><div class="text-center py-8 text-gray-600 text-sm">Cargando submissions...</div></div>
  `;

  await loadAdminSubmissions();

  // Update sidebar badge
  setTimeout(async () => {
    try {
      const { count } = await supa.from('submissions').select('*', { count: 'exact', head: true })
        .eq('league_id', state.activeLeague.id).eq('status', 'pending');
      const badge = $('inbox-badge');
      if (badge && count > 0) { badge.textContent = count; badge.classList.remove('hidden'); }
      else if (badge) badge.classList.add('hidden');
    } catch(e) {}
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// ADMIN SCANNER SECTION (admin scans their own matches)
// ═══════════════════════════════════════════════════════════════
let _adminScanPhotos = { score: null, players: null, stats_home: null, stats_away: null };

async function initAdminScannerSection() {
  const container = document.querySelector('[data-section="scanner"]');
  if (!container) return;

  if (!_teamsCache.length) await loadTeams();
  if (!_playersCache.length) await loadPlayers();

  const canScan = ['pro', 'elite', 'superadmin'].includes(state.activeLeague.plan_type);

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-6">
      <span class="text-2xl">🤖</span>
      <h2 class="font-display text-3xl tracking-wide text-white">ESCÁNER IA</h2>
    </div>

    <!-- Teams selection -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">📊 Partido a escanear</h3>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label class="block text-xs text-gray-500 mb-1">🏠 Local</label>
          <select id="as-home" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
            <option value="">— Elegí —</option>
            ${_teamsCache.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">✈️ Visitante</label>
          <select id="as-away" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
            <option value="">— Elegí —</option>
            ${_teamsCache.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <!-- Photo upload -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">📸 Capturas del partido</h3>
      <div class="grid grid-cols-2 gap-2">
        ${[
          { key: 'score', icon: '📊', label: 'Marcador' },
          { key: 'players', icon: '👥', label: 'Jugadores' },
          { key: 'stats_home', icon: '📈', label: 'Stats Local' },
          { key: 'stats_away', icon: '📈', label: 'Stats Visitante' },
        ].map(p => `<div class="relative">
          <input type="file" accept="image/*,image/heic,image/heif" id="as-photo-${p.key}" class="hidden" onchange="window._asPhotoChange('${p.key}', event)">
          <label for="as-photo-${p.key}" id="as-zone-${p.key}" class="block bg-pitch-900/40 border-2 border-dashed border-white/10 rounded-xl p-3 text-center cursor-pointer hover:border-lime-400/30 transition-all min-h-[70px] flex flex-col items-center justify-center gap-1">
            <span class="text-lg">${p.icon}</span>
            <span class="text-[10px] text-gray-600">${p.label}</span>
          </label>
          <img id="as-preview-${p.key}" class="hidden absolute inset-0 w-full h-full object-cover rounded-xl">
        </div>`).join('')}
      </div>
    </div>

    <!-- Scan button -->
    <button id="btn-admin-scan" onclick="window._adminRunScan()" ${canScan ? '' : 'disabled'}
      class="w-full py-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all mb-4 ${canScan
        ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-400 hover:to-indigo-400 shadow-lg shadow-purple-500/10 active:scale-[.98]'
        : 'bg-pitch-700 text-gray-600 cursor-not-allowed'}">
      ${canScan ? '🤖 Escanear con IA' : '🔒 Scanner disponible en plan Pro'}
    </button>

    <!-- Manual result entry -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">✏️ O cargá el resultado manualmente</h3>
      <div style="display:grid;grid-template-columns:1fr 30px 1fr;gap:8px;align-items:center;margin-bottom:16px;">
        <input type="number" id="as-hg" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-3 text-white text-center font-display text-3xl outline-none focus:border-lime-400/40">
        <span class="text-gray-500 text-xl text-center">–</span>
        <input type="number" id="as-ag" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-3 text-white text-center font-display text-3xl outline-none focus:border-lime-400/40">
      </div>
      <button id="btn-admin-save" onclick="window._adminSaveManual()" class="w-full bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">
        ✅ Guardar Resultado
      </button>
    </div>

    <!-- Scan results (hidden, shown after AI scan) -->
    <div id="as-scan-results" class="hidden"></div>
  `;
}

window._asPhotoChange = (key, event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    _adminScanPhotos[key] = ev.target.result;
    const preview = $('as-preview-' + key);
    if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
    const zone = $('as-zone-' + key);
    if (zone) zone.style.borderColor = 'rgba(0,255,135,.4)';
  };
  reader.readAsDataURL(file);
};

window._adminRunScan = async () => {
  const photos = Object.values(_adminScanPhotos).filter(Boolean);
  if (!photos.length) { toast('⚠️ Subí al menos una foto', true); return; }

  const btn = $('btn-admin-scan');
  btn.disabled = true;
  btn.innerHTML = '<svg class="animate-spin h-5 w-5 inline mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Escaneando...';

  try {
    const { data: { session } } = await supa.auth.getSession();
    if (!session) throw new Error('No hay sesión activa');

    const res = await fetch(supa.supabaseUrl + '/functions/v1/scan-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
      body: JSON.stringify({
        images: photos,
        registered_players: _playersCache.map(p => ({ id: p.id, name: p.name, pos: p.pos })),
        league_id: state.activeLeague.id,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.message || data.error);

    const result = data.result;

    // Fill in score
    if (result.score) {
      if ($('as-hg')) $('as-hg').value = result.score.homeGoals ?? 0;
      if ($('as-ag')) $('as-ag').value = result.score.awayGoals ?? 0;
    }

    // Try to auto-select teams
    if (result.score) {
      const norm = s => (s || '').toLowerCase().trim();
      _teamsCache.forEach(t => {
        if (norm(t.name).includes(norm(result.score.home)) || norm(result.score.home).includes(norm(t.name))) {
          if ($('as-home')) $('as-home').value = t.id;
        }
        if (norm(t.name).includes(norm(result.score.away)) || norm(result.score.away).includes(norm(t.name))) {
          if ($('as-away')) $('as-away').value = t.id;
        }
      });
    }

    // Show scan details
    const resultsDiv = $('as-scan-results');
    if (resultsDiv && result.stats) {
      resultsDiv.innerHTML = `<div class="bg-pitch-800/60 border border-lime-400/20 rounded-2xl p-5 glow">
        <h3 class="font-display text-lg text-lime-400 mb-3">✅ Resultado del escaneo</h3>
        <div class="space-y-1">
          ${result.stats.map(sp => `<div class="flex items-center gap-2 py-1.5 border-b border-white/5 text-sm">
            <span class="text-xs text-gray-500 w-8">${sp.pos || sp.position || '?'}</span>
            <span class="flex-1 text-white">${sp.name}</span>
            ${sp.goals ? '<span>⚽' + sp.goals + '</span>' : ''}
            ${sp.assists ? '<span>🎯' + sp.assists + '</span>' : ''}
            ${sp.rating ? '<span class="text-yellow-400">⭐' + sp.rating + '</span>' : ''}
          </div>`).join('')}
        </div>
      </div>`;
      resultsDiv.classList.remove('hidden');
      // Store result for saving
      window._lastScanResult = result;
    }

    toast('✅ Escaneo completado — verificá y guardá');
  } catch(e) {
    console.error('Admin scan error:', e);
    toast('⚠️ ' + e.message, true);
  }

  btn.disabled = false;
  btn.innerHTML = '🤖 Escanear con IA';
};

window._adminSaveManual = async () => {
  const homeId = $('as-home')?.value;
  const awayId = $('as-away')?.value;
  const hg = parseInt($('as-hg')?.value ?? 0);
  const ag = parseInt($('as-ag')?.value ?? 0);

  if (!homeId || !awayId) { toast('⚠️ Seleccioná ambos equipos', true); return; }
  if (homeId === awayId) { toast('⚠️ Los equipos no pueden ser iguales', true); return; }

  const btn = $('btn-admin-save');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    // Build player stats from scan result if available
    const ps = {};
    const scanResult = window._lastScanResult;
    if (scanResult?.stats) {
      const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      scanResult.stats.forEach(sp => {
        const player = _playersCache.find(p => {
          const pn = norm(p.name), sn = norm(sp.name);
          return pn === sn || pn.includes(sn) || sn.includes(pn);
        });
        if (player) {
          const isGK = ['GK','POR','PO'].includes((sp.pos || sp.position || '').toUpperCase());
          const isHome = player.team_id === homeId;
          const autoCS = isGK && (isHome ? ag === 0 : hg === 0);
          ps[player.id] = { goals: sp.goals || 0, assists: sp.assists || 0, rating: sp.rating || 0, position: (sp.pos || sp.position || '').toUpperCase(), played: true, cs: autoCS };
        }
      });
    }

    const { error } = await supa.from('matches').insert({
      league_id: state.activeLeague.id,
      home_id: homeId, away_id: awayId,
      home_goals: hg, away_goals: ag,
      player_stats: ps,
      date: new Date().toISOString().split('T')[0],
    });
    if (error) throw error;

    // Update player aggregates
    for (const [pid, st] of Object.entries(ps)) {
      const { data: player } = await supa.from('players').select('goals,assists,cs,matches_played,ratings').eq('id', pid).single();
      if (!player) continue;
      const newRatings = [...(player.ratings || [])];
      if (st.rating > 0) newRatings.push(st.rating);
      await supa.from('players').update({
        goals: (player.goals || 0) + (st.goals || 0),
        assists: (player.assists || 0) + (st.assists || 0),
        cs: (player.cs || 0) + (st.cs ? 1 : 0),
        matches_played: (player.matches_played || 0) + 1,
        ratings: newRatings,
      }).eq('id', pid);
    }

    window._lastScanResult = null;
    $('as-scan-results')?.classList.add('hidden');
    $('as-hg').value = 0; $('as-ag').value = 0;
    $('as-home').value = ''; $('as-away').value = '';
    _adminScanPhotos = { score: null, players: null, stats_home: null, stats_away: null };
    ['score','players','stats_home','stats_away'].forEach(k => {
      const p = $('as-preview-' + k); if (p) { p.classList.add('hidden'); p.src = ''; }
      const z = $('as-zone-' + k); if (z) z.style.borderColor = '';
      const inp = $('as-photo-' + k); if (inp) inp.value = '';
    });

    await loadMatches();
    const homeName = _teamsCache.find(t => t.id === homeId)?.name || '?';
    const awayName = _teamsCache.find(t => t.id === awayId)?.name || '?';
    toast('✅ ' + homeName + ' ' + hg + '–' + ag + ' ' + awayName);
  } catch(e) {
    toast('⚠️ ' + e.message, true);
  }

  btn.disabled = false; btn.textContent = '✅ Guardar Resultado';
};

// ═══════════════════════════════════════════════════════════════
// TRANSFERS (FICHAJES) MODULE
// ═══════════════════════════════════════════════════════════════
async function initTransfersSection() {
  try { await _initTransfersSectionInner(); } catch(e) {
    console.error('Transfers error:', e);
    const container = document.querySelector('[data-section="transfers"]');
    if (container) container.innerHTML = '<div class="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"><p class="text-red-400">Error: ' + e.message + '</p></div>';
  }
}

async function _initTransfersSectionInner() {
  const container = document.querySelector('[data-section="transfers"]');
  if (!container) return;

  if (!_teamsCache.length) await loadTeams();

  // Load pending fichaje requests
  const { data: fichajes } = await supa.from('fichaje_requests').select('*')
    .eq('league_id', state.activeLeague.id).order('created_at', { ascending: false });

  const pending = (fichajes || []).filter(f => f.status === 'pending');
  const recent = (fichajes || []).filter(f => f.status !== 'pending');

  container.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📋</span>
        <h2 class="font-display text-3xl tracking-wide text-white">FICHAJES</h2>
      </div>
      <button id="btn-new-fichaje" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">+ Nuevo Fichaje</button>
    </div>

    <!-- New fichaje form (hidden) -->
    <div id="fichaje-form" class="hidden bg-pitch-800/60 border border-lime-400/20 rounded-2xl p-5 mb-4 glow">
      <h3 class="font-display text-lg text-white mb-4">📋 Registrar Fichaje</h3>
      <div class="grid gap-3 md:grid-cols-3 mb-4">
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Equipo</label>
          <select id="fj-team" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
            <option value="">— Elegí —</option>
            ${_teamsCache.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Jugador</label>
          <input id="fj-player" type="text" placeholder="Gamertag" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder-gray-600 outline-none focus:border-lime-400/40 text-sm">
        </div>
        <div>
          <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Posición</label>
          <select id="fj-pos" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
            <option value="">POS</option>
            <option value="POR">POR</option><option value="DFC">DFC</option><option value="LI">LI</option><option value="LD">LD</option>
            <option value="MCD">MCD</option><option value="MC">MC</option><option value="MCO">MCO</option><option value="MI">MI</option><option value="MD">MD</option>
            <option value="EI">EI</option><option value="ED">ED</option><option value="DC">DC</option><option value="MP">MP</option>
          </select>
        </div>
      </div>
      <div class="flex gap-2">
        <button id="btn-confirm-fichaje" class="flex-1 bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2.5 rounded-xl text-sm uppercase tracking-wider">Registrar</button>
        <button onclick="document.getElementById('fichaje-form').classList.add('hidden')" class="bg-pitch-700 text-gray-400 py-2.5 px-4 rounded-xl text-sm hover:bg-pitch-600 transition-all">Cancelar</button>
      </div>
    </div>

    <!-- Pending requests -->
    <div id="fichajes-list">
      ${pending.length ? pending.map(f => {
        const teamName = _teamsCache.find(t => t.id === f.team_id)?.name || f.team_name || '?';
        return `<div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 mb-2 flex items-center justify-between">
          <div>
            <span class="text-sm text-white font-medium">${f.player_name}</span>
            <span class="text-xs text-gray-500 ml-2">${f.pos || ''}</span>
            <span class="text-xs text-gray-600 ml-2">→ ${teamName}</span>
          </div>
          <div class="flex gap-2">
            <button onclick="window._approveFichaje('${f.id}','${f.team_id}','${f.player_name.replace(/'/g,"\\'")}','${f.pos}')" class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-all">✅</button>
            <button onclick="window._rejectFichaje('${f.id}')" class="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-500/20 transition-all">✕</button>
          </div>
        </div>`;
      }).join('') : '<div class="bg-pitch-800/40 border border-white/5 rounded-xl p-6 text-center text-gray-600 text-sm">Sin fichajes pendientes</div>'}
    </div>

    ${recent.length ? `
      <div class="mt-4 opacity-60">
        <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">📋 Historial reciente</p>
        ${recent.slice(0, 10).map(f => {
          const icon = f.status === 'approved' ? '✅' : '✕';
          const color = f.status === 'approved' ? 'text-emerald-400' : 'text-red-400';
          return `<div class="flex items-center justify-between py-2 border-b border-white/5 text-sm">
            <span class="${color}">${icon} ${f.player_name} ${f.pos ? '(' + f.pos + ')' : ''}</span>
            <span class="text-xs text-gray-600">${f.status} · ${new Date(f.created_at).toLocaleString()}</span>
          </div>`;
        }).join('')}
      </div>
    ` : ''}
  `;

  // Bind events
  $('btn-new-fichaje').onclick = () => $('fichaje-form').classList.toggle('hidden');

  $('btn-confirm-fichaje').onclick = async () => {
    const teamId = $('fj-team')?.value;
    const playerName = $('fj-player')?.value.trim();
    const pos = $('fj-pos')?.value || '';
    if (!teamId || !playerName) { toast('⚠️ Completá equipo y jugador', true); return; }

    // Check player limit
    const limits = getPlanLimits(state.activeLeague.plan_type);
    const currentCount = _playersCache.filter(p => p.team_id === teamId).length;
    const pendingCount = (pending || []).filter(f => f.team_id === teamId && f.status === 'pending').length;
    if ((currentCount + pendingCount) >= limits.maxPlayers && state.activeLeague.plan_type !== 'superadmin') {
      toast('⚠️ Equipo al límite de jugadores', true); return;
    }

    try {
      const teamName = _teamsCache.find(t => t.id === teamId)?.name || '';
      const { error } = await supa.from('fichaje_requests').insert({
        league_id: state.activeLeague.id,
        team_id: teamId,
        team_name: teamName,
        player_name: playerName,
        pos: pos.toUpperCase(),
        status: 'pending',
      });
      if (error) throw error;
      $('fj-player').value = '';
      $('fichaje-form').classList.add('hidden');
      toast('✅ Fichaje registrado');
      initTransfersSection();
    } catch(e) { toast('⚠️ ' + e.message, true); }
  };
}

window._approveFichaje = async (fichajeId, teamId, playerName, pos) => {
  try {
    // Create the player
    const { error: playerErr } = await supa.from('players').insert({
      league_id: state.activeLeague.id,
      team_id: teamId,
      name: playerName,
      pos: pos || '',
    });
    if (playerErr) throw playerErr;

    // Mark fichaje as approved
    await supa.from('fichaje_requests').update({ status: 'approved' }).eq('id', fichajeId);
    toast('✅ ' + playerName + ' fichado');
    _playersCache = []; // clear cache
    initTransfersSection();
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._rejectFichaje = async (fichajeId) => {
  if (!confirm('¿Rechazar este fichaje?')) return;
  try {
    await supa.from('fichaje_requests').update({ status: 'rejected' }).eq('id', fichajeId);
    toast('✕ Fichaje rechazado');
    initTransfersSection();
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

// ═══════════════════════════════════════════════════════════════
// PLAYER PROFILES + POSITION STATS
// ═══════════════════════════════════════════════════════════════
window._viewPlayerProfile = async (playerId) => {
  const player = _playersCache.find(p => p.id === playerId);
  if (!player) { await loadPlayers(); }
  const p = _playersCache.find(pl => pl.id === playerId);
  if (!p) { toast('Jugador no encontrado', true); return; }

  if (!_matchesCache.length) await loadMatches();

  // Aggregate position stats from matches
  const posStats = {};
  let matchHistory = [];
  _matchesCache.forEach(m => {
    const st = m.player_stats?.[playerId];
    if (!st || !st.played) return;
    const pos = (st.position || p.pos || '?').toUpperCase();
    if (!posStats[pos]) posStats[pos] = { count: 0, goals: 0, assists: 0, ratings: [], cs: 0 };
    posStats[pos].count++;
    posStats[pos].goals += st.goals || 0;
    posStats[pos].assists += st.assists || 0;
    if (st.rating > 0) posStats[pos].ratings.push(st.rating);
    if (st.cs) posStats[pos].cs++;

    const homeName = tn(m.home_id), awayName = tn(m.away_id);
    matchHistory.push({
      date: m.date || '', home: homeName, away: awayName,
      score: m.home_goals + '–' + m.away_goals,
      goals: st.goals || 0, assists: st.assists || 0,
      rating: st.rating || 0, position: pos,
    });
  });

  const avgRating = p.ratings?.length ? (p.ratings.reduce((a,b) => a + Number(b), 0) / p.ratings.length).toFixed(1) : '—';
  const teamName = tn(p.team_id);

  const body = $('result-form-body');
  body.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <div class="w-12 h-12 rounded-full bg-pitch-700 border-2 border-lime-400/20 flex items-center justify-center font-display text-xl text-lime-400">${(p.pos || '?').slice(0,3)}</div>
      <div>
        <h3 class="font-display text-xl text-white">${p.name}</h3>
        <p class="text-xs text-gray-500">${teamName} · ${p.pos || '?'}</p>
      </div>
    </div>

    <!-- Main stats -->
    <div class="grid grid-cols-5 gap-2 mb-4 text-center">
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-white">${p.matches_played}</p><p class="text-[10px] text-gray-600">PJ</p></div>
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-white">${p.goals}</p><p class="text-[10px] text-gray-600">Goles</p></div>
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-white">${p.assists}</p><p class="text-[10px] text-gray-600">Asist</p></div>
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-yellow-400">${avgRating}</p><p class="text-[10px] text-gray-600">Rating</p></div>
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-white">${p.cs}</p><p class="text-[10px] text-gray-600">CS</p></div>
    </div>

    <!-- Position stats -->
    ${Object.keys(posStats).length ? `
      <div class="mb-4">
        <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">📊 Stats por Posición</p>
        <div class="space-y-1">
          ${Object.entries(posStats).sort((a,b) => b[1].count - a[1].count).map(([pos, s]) => {
            const avg = s.ratings.length ? (s.ratings.reduce((a,b) => a+b, 0) / s.ratings.length).toFixed(1) : '—';
            const pct = p.matches_played ? Math.round(s.count / p.matches_played * 100) : 0;
            return `<div class="flex items-center gap-2 py-1.5 bg-pitch-900/30 rounded-lg px-2 text-xs">
              <span class="font-bold text-lime-400 w-8">${pos}</span>
              <div class="flex-1 bg-pitch-700 rounded-full h-1.5"><div class="bg-lime-400 h-1.5 rounded-full" style="width:${pct}%"></div></div>
              <span class="text-gray-500">${s.count}x</span>
              <span class="text-gray-400">⚽${s.goals}</span>
              <span class="text-gray-400">🎯${s.assists}</span>
              <span class="text-yellow-400">⭐${avg}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Rating chart -->
    ${buildRatingChart(p.ratings)}

    <!-- Match history -->
    ${matchHistory.length ? `
      <div>
        <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">🕹 Últimos Partidos</p>
        <div class="max-h-40 overflow-y-auto space-y-1">
          ${matchHistory.reverse().slice(0, 10).map(m => `<div class="flex items-center justify-between py-1.5 border-b border-white/5 text-xs">
            <span class="text-gray-500 w-8">${m.position}</span>
            <span class="text-white flex-1">${m.home} ${m.score} ${m.away}</span>
            ${m.goals ? '<span>⚽' + m.goals + '</span>' : ''}
            ${m.assists ? '<span>🎯' + m.assists + '</span>' : ''}
            ${m.rating ? '<span class="text-yellow-400">⭐' + m.rating + '</span>' : ''}
          </div>`).join('')}
        </div>
      </div>
    ` : '<p class="text-xs text-gray-600">Sin historial de partidos</p>'}
  `;
  $('result-form').classList.remove('hidden');
};

// ═══════════════════════════════════════════════════════════════
// TEAM PROFILES
// ═══════════════════════════════════════════════════════════════
window._viewTeamProfile = async (teamId) => {
  const team = _teamsCache.find(t => t.id === teamId);
  if (!team) return;

  if (!_matchesCache.length) await loadMatches();
  const players = _playersCache.filter(p => p.team_id === teamId);

  // Calculate team stats
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  const teamMatches = [];
  _matchesCache.forEach(m => {
    const isHome = m.home_id === teamId, isAway = m.away_id === teamId;
    if (!isHome && !isAway) return;
    const scored = isHome ? m.home_goals : m.away_goals;
    const conceded = isHome ? m.away_goals : m.home_goals;
    gf += scored; ga += conceded;
    if (scored > conceded) w++; else if (scored < conceded) l++; else d++;
    teamMatches.push({ ...m, scored, conceded, opponent: isHome ? tn(m.away_id) : tn(m.home_id), isHome });
  });

  const shieldHtml = team.shield_url
    ? `<img src="${team.shield_url}" class="w-16 h-16 rounded-full object-cover border-2 border-lime-400/20">`
    : `<div class="w-16 h-16 rounded-full bg-pitch-700 border-2 border-lime-400/20 flex items-center justify-center text-2xl font-display text-lime-400">${team.name.charAt(0)}</div>`;

  const body = $('result-form-body');
  body.innerHTML = `
    <div class="flex items-center gap-4 mb-4">
      ${shieldHtml}
      <div>
        <h3 class="font-display text-2xl text-white">${team.name}</h3>
        <p class="text-xs text-gray-500">${players.length} jugadores · ${w+d+l} partidos</p>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-2 mb-4 text-center">
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-emerald-400">${w}</p><p class="text-[10px] text-gray-600">Victorias</p></div>
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-yellow-400">${d}</p><p class="text-[10px] text-gray-600">Empates</p></div>
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-red-400">${l}</p><p class="text-[10px] text-gray-600">Derrotas</p></div>
      <div class="bg-pitch-900/40 rounded-lg p-2"><p class="font-display text-lg text-white">${gf}:${ga}</p><p class="text-[10px] text-gray-600">GF:GC</p></div>
    </div>

    <!-- Roster -->
    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">👤 Plantel</p>
    <div class="max-h-32 overflow-y-auto space-y-1 mb-4">
      ${players.sort((a,b) => (b.goals||0) - (a.goals||0)).map(p => {
        const avg = p.ratings?.length ? (p.ratings.reduce((a,b) => a + Number(b), 0) / p.ratings.length).toFixed(1) : '—';
        return `<div class="flex items-center gap-2 py-1 text-xs cursor-pointer hover:bg-white/5 rounded px-1 transition-all" onclick="window._viewPlayerProfile('${p.id}')">
          <span class="text-gray-500 w-7">${p.pos || '?'}</span>
          <span class="flex-1 text-white">${p.name}</span>
          <span>⚽${p.goals}</span><span>🎯${p.assists}</span><span class="text-yellow-400">⭐${avg}</span>
        </div>`;
      }).join('')}
    </div>

    <!-- Recent matches -->
    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">🕹 Últimos Partidos</p>
    <div class="max-h-32 overflow-y-auto space-y-1">
      ${teamMatches.reverse().slice(0, 8).map(m => {
        const result = m.scored > m.conceded ? 'W' : m.scored < m.conceded ? 'L' : 'D';
        const rc = { W: 'text-emerald-400', L: 'text-red-400', D: 'text-yellow-400' };
        return `<div class="flex items-center gap-2 py-1.5 border-b border-white/5 text-xs">
          <span class="font-bold ${rc[result]} w-4">${result}</span>
          <span class="flex-1 text-white">${m.isHome ? 'vs' : '@'} ${m.opponent}</span>
          <span class="text-lime-400 font-display">${m.scored}–${m.conceded}</span>
        </div>`;
      }).join('') || '<p class="text-gray-600 text-xs">Sin partidos</p>'}
    </div>
  `;
  $('result-form').classList.remove('hidden');
};

// ═══════════════════════════════════════════════════════════════
// H2H (Head to Head)
// ═══════════════════════════════════════════════════════════════
window._showH2H = async (teamAId, teamBId) => {
  if (!teamAId || !teamBId || teamAId === teamBId) return;
  if (!_matchesCache.length) await loadMatches();

  const nameA = tn(teamAId), nameB = tn(teamBId);
  let wA = 0, wB = 0, draws = 0, gfA = 0, gfB = 0;
  const h2hMatches = [];

  _matchesCache.forEach(m => {
    const aHome = m.home_id === teamAId && m.away_id === teamBId;
    const bHome = m.home_id === teamBId && m.away_id === teamAId;
    if (!aHome && !bHome) return;
    const goalsA = aHome ? m.home_goals : m.away_goals;
    const goalsB = aHome ? m.away_goals : m.home_goals;
    gfA += goalsA; gfB += goalsB;
    if (goalsA > goalsB) wA++; else if (goalsB > goalsA) wB++; else draws++;
    h2hMatches.push({ goalsA, goalsB, date: m.date || '' });
  });

  const total = wA + wB + draws;
  const body = $('result-form-body');
  body.innerHTML = `
    <h3 class="font-display text-lg text-white text-center mb-4">⚔️ H2H</h3>
    <div class="grid grid-cols-3 gap-3 items-center text-center mb-4">
      <div><p class="font-display text-xl text-white">${nameA}</p></div>
      <div><span class="text-gray-600 text-sm">vs</span></div>
      <div><p class="font-display text-xl text-white">${nameB}</p></div>
    </div>
    <div class="grid grid-cols-3 gap-3 items-center text-center mb-4 py-3 bg-pitch-900/40 rounded-xl">
      <div><p class="font-display text-2xl text-emerald-400">${wA}</p><p class="text-[10px] text-gray-600">Victorias</p></div>
      <div><p class="font-display text-2xl text-yellow-400">${draws}</p><p class="text-[10px] text-gray-600">Empates</p></div>
      <div><p class="font-display text-2xl text-emerald-400">${wB}</p><p class="text-[10px] text-gray-600">Victorias</p></div>
    </div>
    <div class="grid grid-cols-3 gap-3 text-center mb-4">
      <div><span class="text-sm text-white">${gfA}</span><p class="text-[10px] text-gray-600">Goles</p></div>
      <div><span class="text-sm text-gray-500">${total} partidos</span></div>
      <div><span class="text-sm text-white">${gfB}</span><p class="text-[10px] text-gray-600">Goles</p></div>
    </div>
    ${h2hMatches.length ? `<div class="border-t border-white/5 pt-3">
      ${h2hMatches.reverse().map(m => `<div class="flex items-center justify-center gap-4 py-1.5 text-sm">
        <span class="text-white">${nameA}</span>
        <span class="font-display text-lime-400">${m.goalsA}–${m.goalsB}</span>
        <span class="text-white">${nameB}</span>
      </div>`).join('')}
    </div>` : '<p class="text-gray-600 text-xs text-center">Sin enfrentamientos</p>'}
  `;
  $('result-form').classList.remove('hidden');
};

// ═══════════════════════════════════════════════════════════════
// PLAYER COMPARISON
// ═══════════════════════════════════════════════════════════════
window._comparePlayersUI = async () => {
  if (!_playersCache.length) await loadPlayers();

  const opts = _playersCache.map(p => `<option value="${p.id}">${p.name} (${tn(p.team_id)})</option>`).join('');
  const body = $('result-form-body');
  body.innerHTML = `
    <h3 class="font-display text-lg text-white text-center mb-4">⚖️ Comparar Jugadores</h3>
    <div class="grid grid-cols-2 gap-3 mb-4">
      <select id="cmp-a" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none"><option value="">Jugador A</option>${opts}</select>
      <select id="cmp-b" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none"><option value="">Jugador B</option>${opts}</select>
    </div>
    <button onclick="window._runComparison()" class="w-full bg-lime-400/10 text-lime-400 border border-lime-400/20 py-2.5 rounded-xl text-sm font-semibold hover:bg-lime-400/20 transition-all mb-4">⚖️ Comparar</button>
    <div id="cmp-result"></div>
  `;
  $('result-form').classList.remove('hidden');
};

window._runComparison = () => {
  const aId = $('cmp-a')?.value, bId = $('cmp-b')?.value;
  if (!aId || !bId) { toast('Seleccioná 2 jugadores', true); return; }
  const a = _playersCache.find(p => p.id === aId), b = _playersCache.find(p => p.id === bId);
  if (!a || !b) return;

  const avgA = a.ratings?.length ? (a.ratings.reduce((x,y) => x + Number(y), 0) / a.ratings.length).toFixed(1) : 0;
  const avgB = b.ratings?.length ? (b.ratings.reduce((x,y) => x + Number(y), 0) / b.ratings.length).toFixed(1) : 0;

  const stats = [
    ['Partidos', a.matches_played, b.matches_played],
    ['Goles', a.goals, b.goals],
    ['Asistencias', a.assists, b.assists],
    ['Rating', avgA, avgB],
    ['CS', a.cs, b.cs],
  ];

  $('cmp-result').innerHTML = `
    <div class="grid grid-cols-3 gap-2 text-center mb-3">
      <div><p class="font-semibold text-white text-sm">${a.name}</p><p class="text-[10px] text-gray-500">${tn(a.team_id)}</p></div>
      <div><span class="text-gray-600 text-xs">vs</span></div>
      <div><p class="font-semibold text-white text-sm">${b.name}</p><p class="text-[10px] text-gray-500">${tn(b.team_id)}</p></div>
    </div>
    ${stats.map(([label, va, vb]) => {
      const na = Number(va), nb = Number(vb);
      const better = na > nb ? 'a' : nb > na ? 'b' : 'tie';
      return `<div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5 border-b border-white/5">
        <span class="text-right font-display text-sm ${better === 'a' ? 'text-lime-400' : 'text-gray-400'}">${va}</span>
        <span class="text-[10px] text-gray-600 w-16 text-center">${label}</span>
        <span class="text-left font-display text-sm ${better === 'b' ? 'text-lime-400' : 'text-gray-400'}">${vb}</span>
      </div>`;
    }).join('')}
  `;
};

// ═══════════════════════════════════════════════════════════════
// RATING EVOLUTION CHART
// ═══════════════════════════════════════════════════════════════
function buildRatingChart(ratings) {
  if (!ratings || ratings.length < 2) return '';
  const nums = ratings.map(Number);
  const min = Math.min(...nums) - 0.5;
  const max = Math.max(...nums) + 0.5;
  const range = max - min || 1;
  const w = 300, h = 70, pad = 8;
  const avg = (nums.reduce((a,b) => a+b, 0) / nums.length).toFixed(1);
  const avgY = (h - pad - ((avg - min) / range) * (h - pad * 2)).toFixed(1);

  const points = nums.map((r, i) => {
    const x = (pad + (i / (nums.length - 1)) * (w - pad * 2)).toFixed(1);
    const y = (h - pad - ((r - min) / range) * (h - pad * 2)).toFixed(1);
    return x + ',' + y;
  }).join(' ');

  const dots = nums.map((r, i) => {
    const x = (pad + (i / (nums.length - 1)) * (w - pad * 2)).toFixed(1);
    const y = (h - pad - ((r - min) / range) * (h - pad * 2)).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="2.5" fill="#00ff87"/>`;
  }).join('');

  return `<div class="mb-4">
    <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">📈 Evolución de Rating</p>
    <svg viewBox="0 0 ${w} ${h}" class="w-full bg-pitch-900/30 rounded-lg" style="height:80px">
      <line x1="${pad}" y1="${avgY}" x2="${w-pad}" y2="${avgY}" stroke="rgba(0,255,135,0.15)" stroke-dasharray="3"/>
      <polyline points="${points}" fill="none" stroke="#00ff87" stroke-width="2" stroke-linejoin="round"/>
      ${dots}
      <text x="${w-pad}" y="${avgY - 4}" text-anchor="end" fill="rgba(0,255,135,0.4)" font-size="8" font-family="monospace">${avg}</text>
    </svg>
  </div>`;
}

// Photo preview modal
window._previewPhoto = (subId, index) => {
  const body = $('result-form-body');
  // Find the submission from the DOM data attributes or re-query
  supa.from('submissions').select('scan_result').eq('id', subId).single().then(({ data }) => {
    const photos = data?.scan_result?.photos || [];
    if (!photos[index]) { toast('Foto no disponible', true); return; }
    body.innerHTML = `
      <div class="text-center">
        <img src="${photos[index]}" class="w-full rounded-xl mb-3 border border-white/10">
        <div class="flex gap-2 justify-center">
          ${photos.map((ph, i) => `<img src="${ph}" class="w-12 h-9 rounded cursor-pointer border ${i === index ? 'border-lime-400' : 'border-white/10'} object-cover" onclick="window._previewPhoto('${subId}', ${i})">`).join('')}
        </div>
      </div>
    `;
    $('result-form').classList.remove('hidden');
  });
};

// ═══════════════════════════════════════════════════════════════
// PLAYOFFS BRACKET
// ═══════════════════════════════════════════════════════════════
async function initPlayoffsSection() {
  // This will be triggered from fixture section via a button
  const standings = calculateStandings();
  if (!standings.length) { toast('⚠️ Necesitás partidos jugados para generar playoffs', true); return; }

  const body = $('result-form-body');
  body.innerHTML = `
    <h3 class="font-display text-lg text-white mb-4">🏆 Configurar Playoffs</h3>
    <div class="space-y-4">
      <div>
        <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Formato</label>
        <select id="po-format" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none">
          <option value="4">Semifinales (4 equipos)</option>
          <option value="8">Cuartos de Final (8 equipos)</option>
          <option value="16">Octavos de Final (16 equipos)</option>
          <option value="2">Final Directa (2 equipos)</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Equipos que pasan directo a la final</label>
        <input id="po-byes-final" type="number" min="0" max="2" value="0" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none">
        <p class="text-xs text-gray-600 mt-1">Ej: 2 = los 2 primeros van directo a la final</p>
      </div>
      <div>
        <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">Equipos que pasan directo a semis</label>
        <input id="po-byes-semi" type="number" min="0" max="4" value="0" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none">
      </div>
      <button onclick="window._generatePlayoffs()" class="w-full bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3 rounded-xl text-sm uppercase tracking-wider">🏆 Generar Bracket</button>
    </div>
  `;
  $('result-form').classList.remove('hidden');
}

window._generatePlayoffs = async () => {
  const format = parseInt($('po-format')?.value || 4);
  const byesFinal = parseInt($('po-byes-final')?.value || 0);
  const byesSemi = parseInt($('po-byes-semi')?.value || 0);
  const standings = calculateStandings();

  if (standings.length < format) {
    toast(`⚠️ Necesitás al menos ${format} equipos con partidos`, true); return;
  }

  const qualified = standings.slice(0, format);

  // Build bracket structure
  const bracket = { format, byesFinal, byesSemi, rounds: [] };

  // First round matchups (1st vs last, 2nd vs second-to-last, etc.)
  let currentRound = [];
  const seedOrder = [];
  for (let i = 0; i < qualified.length / 2; i++) {
    seedOrder.push({ home: qualified[i], away: qualified[qualified.length - 1 - i] });
  }

  // Apply byes
  const directToFinal = seedOrder.splice(0, byesFinal);
  const directToSemi = seedOrder.splice(0, byesSemi);

  bracket.rounds.push({ name: getRoundName(format, 0), matches: seedOrder.map(m => ({
    homeId: m.home.id, homeName: m.home.name,
    awayId: m.away.id, awayName: m.away.name,
    homeGoals: null, awayGoals: null, played: false
  }))});

  if (directToSemi.length) {
    bracket.directToSemi = directToSemi.map(m => ({ id: m.home.id, name: m.home.name }));
  }
  if (directToFinal.length) {
    bracket.directToFinal = directToFinal.map(m => ({ id: m.home.id, name: m.home.name }));
  }

  // Save to league settings
  const settings = { ...(state.activeLeague.settings || {}), playoffs: bracket };
  const { error } = await supa.from('leagues').update({ settings }).eq('id', state.activeLeague.id);
  if (error) { toast('⚠️ ' + error.message, true); return; }
  state.activeLeague.settings = settings;

  window._closeModal();
  toast('🏆 Playoffs generados');
  renderPlayoffsBracket();
};

function getRoundName(format, roundIdx) {
  const names = { 16: ['Octavos','Cuartos','Semis','Final'], 8: ['Cuartos','Semis','Final'], 4: ['Semis','Final'], 2: ['Final'] };
  return (names[format] || ['Ronda'])[roundIdx] || 'Ronda ' + (roundIdx + 1);
}

function renderPlayoffsBracket() {
  const playoffs = state.activeLeague.settings?.playoffs;
  if (!playoffs) return;

  // Find or create playoffs display in fixture section
  let container = $('playoffs-bracket');
  if (!container) {
    const fixtureSection = document.querySelector('[data-section="fixture"]');
    if (!fixtureSection) return;
    const div = document.createElement('div');
    div.id = 'playoffs-bracket';
    div.className = 'mt-6';
    fixtureSection.appendChild(div);
    container = div;
  }

  const round = playoffs.rounds[0];
  container.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <span class="text-xl">🏆</span>
        <h3 class="font-display text-xl text-white">${round?.name || 'PLAYOFFS'}</h3>
      </div>
      <button onclick="window._clearPlayoffs()" class="text-xs text-red-400 hover:text-red-300">🗑 Borrar</button>
    </div>
    ${playoffs.directToFinal?.length ? `<p class="text-xs text-yellow-400 mb-2">⭐ Directo a la Final: ${playoffs.directToFinal.map(t => t.name).join(', ')}</p>` : ''}
    ${playoffs.directToSemi?.length ? `<p class="text-xs text-yellow-400 mb-2">⭐ Directo a Semis: ${playoffs.directToSemi.map(t => t.name).join(', ')}</p>` : ''}
    <div class="space-y-2">
      ${round.matches.map((m, i) => `
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-3 flex items-center justify-between">
          <div class="flex items-center gap-2 flex-1">
            <span class="text-sm text-white flex-1 text-right truncate">${m.homeName}</span>
            ${m.played
              ? `<span class="font-display text-lg text-lime-400 px-2">${m.homeGoals} – ${m.awayGoals}</span>`
              : `<span class="text-gray-600 px-2">vs</span>`}
            <span class="text-sm text-white flex-1 truncate">${m.awayName}</span>
          </div>
          ${!m.played ? `<button onclick="window._playoffResult(${i})" class="text-xs bg-lime-400/10 text-lime-400 border border-lime-400/20 px-3 py-1 rounded-lg ml-2">✏️</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

window._playoffResult = (matchIdx) => {
  const playoffs = state.activeLeague.settings?.playoffs;
  if (!playoffs) return;
  const m = playoffs.rounds[0].matches[matchIdx];

  const body = $('result-form-body');
  body.innerHTML = `
    <h3 class="font-display text-lg text-white text-center mb-4">🏆 ${playoffs.rounds[0].name}</h3>
    <div class="grid grid-cols-3 gap-3 items-center text-center mb-4">
      <p class="text-sm text-white font-medium">${m.homeName}</p>
      <span class="text-gray-600">vs</span>
      <p class="text-sm text-white font-medium">${m.awayName}</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 30px 1fr;gap:8px;align-items:center;margin-bottom:16px;">
      <input type="number" id="po-hg" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-3 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
      <span class="text-gray-500 text-xl text-center">–</span>
      <input type="number" id="po-ag" min="0" value="0" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-3 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
    </div>
    <button onclick="window._savePlayoffResult(${matchIdx})" class="w-full bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3 rounded-xl text-sm uppercase tracking-wider">✅ Guardar</button>
  `;
  $('result-form').classList.remove('hidden');
};

window._savePlayoffResult = async (matchIdx) => {
  const hg = parseInt($('po-hg')?.value ?? 0);
  const ag = parseInt($('po-ag')?.value ?? 0);
  const playoffs = state.activeLeague.settings.playoffs;
  playoffs.rounds[0].matches[matchIdx].homeGoals = hg;
  playoffs.rounds[0].matches[matchIdx].awayGoals = ag;
  playoffs.rounds[0].matches[matchIdx].played = true;

  const settings = { ...state.activeLeague.settings, playoffs };
  await supa.from('leagues').update({ settings }).eq('id', state.activeLeague.id);
  state.activeLeague.settings = settings;
  window._closeModal();
  renderPlayoffsBracket();
  toast('✅ Resultado guardado');
};

window._clearPlayoffs = async () => {
  if (!confirm('¿Borrar el bracket de playoffs?')) return;
  const settings = { ...state.activeLeague.settings };
  delete settings.playoffs;
  await supa.from('leagues').update({ settings }).eq('id', state.activeLeague.id);
  state.activeLeague.settings = settings;
  const el = $('playoffs-bracket');
  if (el) el.remove();
  toast('🗑 Playoffs borrados');
};

// ═══════════════════════════════════════════════════════════════
// DT CONFIRMATION AFTER SUBMISSION
// ═══════════════════════════════════════════════════════════════
function showDTConfirmation(scanResult) {
  const sc = scanResult.score || {};
  const ps = scanResult.playerStats || {};
  const playerCount = Object.keys(ps).length;

  const content = $('dt-content');
  content.innerHTML = `
    <div class="max-w-md mx-auto pt-8 text-center">
      <div class="text-5xl mb-4">✅</div>
      <h2 class="font-display text-2xl text-white mb-2">Resultado Enviado</h2>
      <p class="text-sm text-gray-500 mb-6">El admin revisará y aprobará tu resultado</p>

      <div class="bg-pitch-800/60 border border-lime-400/20 rounded-2xl p-5 mb-6 glow">
        <div class="flex items-center justify-center gap-4 py-3">
          <span class="text-sm text-white font-medium">${sc.home || '?'}</span>
          <span class="font-display text-3xl text-lime-400">${sc.homeGoals ?? '?'} – ${sc.awayGoals ?? '?'}</span>
          <span class="text-sm text-white font-medium">${sc.away || '?'}</span>
        </div>
        ${playerCount ? `<p class="text-xs text-gray-500 mt-2">📋 ${playerCount} jugadores con stats</p>` : ''}
        ${scanResult.photos?.length ? `<p class="text-xs text-gray-500">📸 ${scanResult.photos.length} fotos adjuntas</p>` : ''}
      </div>

      <div class="flex gap-3">
        <button id="btn-dt-send-another" class="flex-1 bg-lime-400/10 text-lime-400 border border-lime-400/20 py-3 rounded-xl text-sm font-semibold hover:bg-lime-400/20 transition-all">📤 Enviar Otro</button>
        <button id="btn-dt-exit" class="flex-1 bg-white/5 text-gray-400 border border-white/10 py-3 rounded-xl text-sm font-semibold hover:text-white transition-all">← Salir</button>
      </div>
    </div>
  `;

  // Attach listeners directly (avoids inline onclick issues)
  $('btn-dt-send-another').onclick = () => showDTSubmissionForm();
  $('btn-dt-exit').onclick = () => {
    _dtTeam = null; _dtLeague = null; _dtPlayers = []; _dtPhotos = [];
    showScreen('public');
  };
}

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
// DT READ-ONLY VIEWS (standings, fixture, leaders)
// ═══════════════════════════════════════════════════════════════
window._dtViewStandings = async () => {
  const content = $('dt-content');
  showLoading(content, 'Cargando tabla...');

  const leagueId = _dtLeague.id;
  const { data: teams } = await supa.from('teams').select('*').eq('league_id', leagueId).eq('is_bye', false).eq('replaced', false);
  const { data: matches } = await supa.from('matches').select('*').eq('league_id', leagueId);

  if (!teams?.length) { content.innerHTML = '<p class="text-gray-500 text-center py-8">Sin equipos</p>'; return; }

  // Calculate standings
  const s = {};
  teams.forEach(t => { s[t.id] = { name: t.name, P:0, W:0, D:0, L:0, GF:0, GA:0, Pts:0 }; });
  (matches || []).forEach(m => {
    if (!s[m.home_id] || !s[m.away_id]) return;
    s[m.home_id].P++; s[m.away_id].P++;
    s[m.home_id].GF += m.home_goals; s[m.home_id].GA += m.away_goals;
    s[m.away_id].GF += m.away_goals; s[m.away_id].GA += m.home_goals;
    if (m.home_goals > m.away_goals) { s[m.home_id].W++; s[m.home_id].Pts += 3; s[m.away_id].L++; }
    else if (m.home_goals < m.away_goals) { s[m.away_id].W++; s[m.away_id].Pts += 3; s[m.home_id].L++; }
    else { s[m.home_id].D++; s[m.away_id].D++; s[m.home_id].Pts++; s[m.away_id].Pts++; }
  });
  const sorted = Object.values(s).sort((a,b) => b.Pts - a.Pts || (b.GF-b.GA) - (a.GF-a.GA));

  content.innerHTML = `
    <div class="flex gap-1 mb-4 overflow-x-auto pb-1">
      <button onclick="window._dtSendAnother()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📤 Enviar</button>
      <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20 shrink-0">📊 Tabla</button>
      <button onclick="window._dtViewFixture()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📅 Fixture</button>
      <button onclick="window._dtViewLeaders()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">⭐ Líderes</button>
    </div>
    <h3 class="font-display text-2xl text-white mb-4">📊 TABLA — ${_dtLeague.name}</h3>
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl overflow-hidden">
      <table class="w-full text-sm">
        <thead><tr class="border-b border-white/10"><th class="py-2 px-2 text-left text-gray-500 text-xs">#</th><th class="text-left text-gray-500 text-xs">Equipo</th><th class="text-center text-gray-500 text-xs">PJ</th><th class="text-center text-gray-500 text-xs">G</th><th class="text-center text-gray-500 text-xs">E</th><th class="text-center text-gray-500 text-xs">P</th><th class="text-center text-gray-500 text-xs">DG</th><th class="text-center text-gray-500 text-xs">Pts</th></tr></thead>
        <tbody>${sorted.map((t, i) => `<tr class="border-b border-white/5"><td class="py-2 px-2 ${i<3?'text-lime-400':'text-gray-500'}">${i+1}</td><td class="text-white font-medium">${t.name}</td><td class="text-center text-gray-400">${t.P}</td><td class="text-center text-gray-400">${t.W}</td><td class="text-center text-gray-400">${t.D}</td><td class="text-center text-gray-400">${t.L}</td><td class="text-center ${(t.GF-t.GA)>0?'text-emerald-400':(t.GF-t.GA)<0?'text-red-400':'text-gray-500'}">${t.GF-t.GA>0?'+':''}${t.GF-t.GA}</td><td class="text-center font-bold text-white">${t.Pts}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  `;
};

window._dtViewFixture = async () => {
  const content = $('dt-content');
  showLoading(content, 'Cargando fixture...');

  const leagueId = _dtLeague.id;
  const { data: leagueData } = await supa.from('leagues').select('settings').eq('id', leagueId).single();
  const schedule = leagueData?.settings?.schedule || [];
  const { data: teams } = await supa.from('teams').select('id, name').eq('league_id', leagueId);
  const { data: matches } = await supa.from('matches').select('*').eq('league_id', leagueId);

  const getName = id => teams?.find(t => t.id === id)?.name || '?';
  const getResult = (hid, aid) => matches?.find(m => m.home_id === hid && m.away_id === aid);

  content.innerHTML = `
    <div class="flex gap-1 mb-4 overflow-x-auto pb-1">
      <button onclick="window._dtSendAnother()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📤 Enviar</button>
      <button onclick="window._dtViewStandings()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📊 Tabla</button>
      <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20 shrink-0">📅 Fixture</button>
      <button onclick="window._dtViewLeaders()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">⭐ Líderes</button>
    </div>
    <h3 class="font-display text-2xl text-white mb-4">📅 FIXTURE — ${_dtLeague.name}</h3>
    ${schedule.length ? schedule.map((round, ri) => `
      <div class="mb-2">
        <button onclick="document.getElementById('dt-round-${ri}').classList.toggle('hidden')" class="w-full bg-pitch-800/60 border border-white/5 rounded-xl p-3 text-left flex items-center justify-between hover:border-lime-400/20 transition-all">
          <span class="font-display text-sm text-white">FECHA ${round.round}</span>
        </button>
        <div id="dt-round-${ri}" class="hidden mt-1 space-y-1 pl-2">
          ${round.fixtures.map(f => {
            const res = getResult(f.home, f.away);
            return `<div class="bg-pitch-800/40 border border-white/5 rounded-lg p-2 flex items-center justify-center gap-2 text-sm">
              <span class="text-white flex-1 text-right truncate">${getName(f.home)}</span>
              ${res ? `<span class="font-display text-lime-400 px-2">${res.home_goals} – ${res.away_goals}</span>` : '<span class="text-gray-600 px-2">vs</span>'}
              <span class="text-white flex-1 truncate">${getName(f.away)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    `).join('') : '<p class="text-gray-500 text-center py-8">Fixture no generado</p>'}
  `;
};

window._dtViewLeaders = async () => {
  const content = $('dt-content');
  showLoading(content, 'Cargando líderes...');

  const leagueId = _dtLeague.id;
  const { data: players } = await supa.from('players').select('*').eq('league_id', leagueId).order('goals', { ascending: false });
  const { data: teams } = await supa.from('teams').select('id, name').eq('league_id', leagueId);
  const getName = id => teams?.find(t => t.id === id)?.name || '?';

  const topScorers = (players || []).filter(p => p.goals > 0).slice(0, 15);

  content.innerHTML = `
    <div class="flex gap-1 mb-4 overflow-x-auto pb-1">
      <button onclick="window._dtSendAnother()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📤 Enviar</button>
      <button onclick="window._dtViewStandings()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📊 Tabla</button>
      <button onclick="window._dtViewFixture()" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pitch-800 text-gray-500 border border-white/5 shrink-0">📅 Fixture</button>
      <button class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20 shrink-0">⭐ Líderes</button>
    </div>
    <h3 class="font-display text-2xl text-white mb-4">⭐ GOLEADORES — ${_dtLeague.name}</h3>
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl overflow-hidden">
      ${topScorers.length ? topScorers.map((p, i) => {
        const avg = p.ratings?.length ? (p.ratings.reduce((a,b) => a + Number(b), 0) / p.ratings.length).toFixed(1) : '—';
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        return `<div class="flex items-center gap-3 py-3 px-4 border-b border-white/5">
          <span class="w-6 text-center ${i < 3 ? 'text-lg' : 'text-gray-600 text-sm'}">${medal || (i+1)}</span>
          <div class="flex-1"><p class="text-sm text-white font-medium">${p.name}</p><p class="text-xs text-gray-500">${getName(p.team_id)}</p></div>
          <span class="text-sm font-display text-lime-400">⚽ ${p.goals}</span>
          <span class="text-xs text-gray-500">🎯 ${p.assists}</span>
          <span class="text-xs text-yellow-400">⭐ ${avg}</span>
        </div>`;
      }).join('') : '<p class="text-gray-500 text-center py-8">Sin goleadores todavía</p>'}
    </div>
  `;
};

// ═══════════════════════════════════════════════════════════════
// MATCH HISTORY SECTION
// ═══════════════════════════════════════════════════════════════
async function initHistorySection() {
  const container = document.querySelector('[data-section="standings"]');
  if (!container) return;

  // History is shown as a sub-tab within standings
  // Already handled by standings section — matches are clickable via fixture
}

// Standalone match history accessible from fixture
window._showMatchHistory = async () => {
  if (!_matchesCache.length) await loadMatches();
  if (!_teamsCache.length) await loadTeams();

  const body = $('result-form-body');
  body.innerHTML = `
    <h3 class="font-display text-lg text-white mb-4">🕹 Historial Completo</h3>
    <div class="mb-3">
      <select id="mh-filter" onchange="window._filterMatchHistory()" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none">
        <option value="all">Todos los equipos</option>
        ${_teamsCache.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div id="mh-list" class="max-h-[60vh] overflow-y-auto space-y-1">
      ${renderMatchHistoryItems('all')}
    </div>
  `;
  $('result-form').classList.remove('hidden');
};

function renderMatchHistoryItems(filterTeamId) {
  let matches = [..._matchesCache].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  if (filterTeamId !== 'all') {
    matches = matches.filter(m => m.home_id === filterTeamId || m.away_id === filterTeamId);
  }
  if (!matches.length) return '<p class="text-gray-600 text-sm text-center py-4">Sin partidos</p>';

  return matches.map(m => {
    const homeName = tn(m.home_id), awayName = tn(m.away_id);
    const ps = Object.keys(m.player_stats || {}).length;
    return `<div class="bg-pitch-900/30 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-all" onclick="window._viewMatchDetail('${m.id}')">
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <span class="text-sm text-white truncate flex-1 text-right">${homeName}</span>
        <span class="font-display text-lg text-lime-400 px-2 shrink-0">${m.home_goals} – ${m.away_goals}</span>
        <span class="text-sm text-white truncate flex-1">${awayName}</span>
      </div>
      <div class="flex items-center gap-2 ml-2 shrink-0">
        ${ps ? `<span class="text-[10px] text-gray-600">${ps} stats</span>` : ''}
        <span class="text-[10px] text-gray-700">${m.date || ''}</span>
      </div>
    </div>`;
  }).join('');
}

window._filterMatchHistory = () => {
  const filter = document.getElementById('mh-filter')?.value || 'all';
  const list = document.getElementById('mh-list');
  if (list) list.innerHTML = renderMatchHistoryItems(filter);
};

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
// ADMIN: DT EMAIL MANAGEMENT (in team detail)
// ═══════════════════════════════════════════════════════════════
async function renderDTEmails(teamId) {
  const { data: members } = await supa.from('team_members').select('*')
    .eq('team_id', teamId).eq('league_id', state.activeLeague.id);

  return `
    <div class="mt-4 pt-4 border-t border-white/5">
      <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">📧 DTs Vinculados</p>
      <div class="space-y-1 mb-3" id="dt-emails-list">
        ${(members || []).map(m => `
          <div class="flex items-center justify-between py-1.5 px-2 bg-pitch-900/30 rounded-lg text-xs">
            <div class="flex items-center gap-2">
              <span class="${m.user_id ? 'text-lime-400' : 'text-yellow-400'}">●</span>
              <span class="text-white">${m.email}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-600">${m.user_id ? 'Vinculado' : 'Pendiente'}</span>
              <button onclick="window._removeDTEmail('${m.id}','${teamId}')" class="text-gray-700 hover:text-red-400 transition-colors">✕</button>
            </div>
          </div>
        `).join('') || '<p class="text-xs text-gray-600">Sin DTs vinculados</p>'}
      </div>
      <div class="flex gap-2">
        <input id="new-dt-email" type="email" placeholder="email@deldt.com" class="flex-1 bg-pitch-900/60 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs outline-none focus:border-lime-400/40 placeholder-gray-600">
        <button onclick="window._addDTEmail('${teamId}')" class="bg-lime-400/10 text-lime-400 border border-lime-400/20 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-lime-400/20 transition-all">+ Agregar</button>
      </div>
      <p class="text-[10px] text-gray-700 mt-1">El DT crea cuenta con este email y se vincula automáticamente</p>
    </div>
  `;
}

window._addDTEmail = async (teamId) => {
  const input = document.getElementById('new-dt-email');
  const email = input?.value.trim().toLowerCase();
  if (!email || !email.includes('@')) { toast('⚠️ Email inválido', true); return; }

  try {
    const { error } = await supa.from('team_members').insert({
      league_id: state.activeLeague.id,
      team_id: teamId,
      email,
    });
    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') { toast('⚠️ Este email ya está vinculado', true); return; }
      throw error;
    }

    input.value = '';
    toast('✅ DT vinculado — el trigger auto-vincula cuando se registre');
    window._viewTeam(teamId);
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._removeDTEmail = async (memberId, teamId) => {
  if (!confirm('¿Desvincular este DT?')) return;
  try {
    await supa.from('team_members').delete().eq('id', memberId);
    toast('✕ DT desvinculado');
    window._viewTeam(teamId);
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

// ═══════════════════════════════════════════════════════════════
// DT AUTHENTICATED VIEW (DT logs in with their account)
// ═══════════════════════════════════════════════════════════════
function showDTAuthenticatedView() {
  const content = $('dt-content');
  if (!content) return;

  const memberships = state.memberships || [];
  const leagueName = $('dt-league-name');

  if (!memberships.length) {
    content.innerHTML = `
      <div class="max-w-sm mx-auto pt-12 text-center">
        <div class="text-5xl mb-4">🔒</div>
        <h2 class="font-display text-2xl text-white mb-2">Sin equipos vinculados</h2>
        <p class="text-sm text-gray-500 mb-6">Tu email no está vinculado a ningún equipo. Pedile al admin de tu liga que te agregue.</p>
        <button onclick="window._dtLogout()" class="bg-white/5 text-gray-400 border border-white/10 py-2 px-6 rounded-xl text-sm font-semibold hover:text-white transition-all">← Salir</button>
      </div>
    `;
    return;
  }

  // If only one membership, go directly to that team
  if (memberships.length === 1) {
    const m = memberships[0];
    _dtTeam = m.teams;
    _dtLeague = m.leagues;
    if (leagueName) leagueName.textContent = _dtLeague.name;
    // Load players and show form
    supa.from('players').select('*').eq('team_id', m.team_id).order('name').then(({ data }) => {
      _dtPlayers = data || [];
      showDTSubmissionForm();
    });
    return;
  }

  // Multiple memberships — let DT choose
  if (leagueName) leagueName.textContent = 'Mis Equipos';

  content.innerHTML = `
    <div class="pt-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="font-display text-2xl text-white">🎮 Mis Equipos</h2>
        <button onclick="window._dtLogout()" class="text-xs text-gray-500 hover:text-white transition-colors">Cerrar sesión</button>
      </div>
      <div class="space-y-3">
        ${memberships.map(m => {
          const team = m.teams;
          const league = m.leagues;
          const shieldHtml = team?.shield_url
            ? `<img src="${team.shield_url}" class="w-10 h-10 rounded-full object-cover border border-white/10">`
            : `<div class="w-10 h-10 rounded-full bg-pitch-700 border border-white/10 flex items-center justify-center text-lg font-display text-lime-400">${(team?.name || '?').charAt(0)}</div>`;

          return `<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-4 hover:border-lime-400/20 transition-all cursor-pointer" onclick="window._dtSelectTeam('${m.team_id}', '${m.league_id}')">
            <div class="flex items-center gap-4">
              ${shieldHtml}
              <div class="flex-1">
                <h3 class="font-semibold text-white">${team?.name || '?'}</h3>
                <p class="text-xs text-gray-500">${league?.name || '?'}</p>
              </div>
              <span class="text-gray-600">→</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

window._dtSelectTeam = async (teamId, leagueId) => {
  const m = state.memberships.find(x => x.team_id === teamId && x.league_id === leagueId);
  if (!m) return;

  _dtTeam = m.teams;
  _dtLeague = m.leagues;

  showScreen('dt');
  const leagueName = $('dt-league-name');
  if (leagueName) leagueName.textContent = _dtLeague.name;
  $('btn-dt-back').onclick = () => { _dtTeam = null; _dtLeague = null; showScreen('hub'); };

  const { data } = await supa.from('players').select('*').eq('team_id', teamId).order('name');
  _dtPlayers = data || [];
  showDTSubmissionForm();
};

window._dtLogout = async () => {
  _dtTeam = null; _dtLeague = null; _dtPlayers = []; _dtPhotos = [];
  try { await signOut(); } catch(e) {}
  showScreen('public');
};

// ═══════════════════════════════════════════════════════════════
// HUB: Render DT memberships alongside admin leagues
// ═══════════════════════════════════════════════════════════════
function renderHubMemberships() {
  const memberships = state.memberships || [];
  if (!memberships.length) return;

  // Find or create the memberships container
  let container = document.getElementById('hub-memberships');
  if (!container) {
    const hubList = $('hub-leagues-list');
    if (!hubList) return;
    container = document.createElement('div');
    container.id = 'hub-memberships';
    container.className = 'mt-8';
    hubList.parentElement.appendChild(container);
  }

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-4">
      <h2 class="font-display text-2xl text-white">🎮 Mis Equipos (DT)</h2>
    </div>
    <div class="space-y-3">
      ${memberships.map(m => {
        const team = m.teams;
        const league = m.leagues;
        const shieldHtml = team?.shield_url
          ? `<img src="${team.shield_url}" class="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0">`
          : `<div class="w-10 h-10 rounded-full bg-pitch-700 border border-white/10 flex items-center justify-center text-lg font-display text-lime-400 shrink-0">${(team?.name || '?').charAt(0)}</div>`;

        return `<div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-4 hover:border-lime-400/20 transition-all">
          <div class="flex items-center gap-4">
            ${shieldHtml}
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-white truncate">${team?.name || '?'}</h3>
              <p class="text-xs text-gray-500">${league?.name || '?'} · ${m.role || 'DT'}</p>
            </div>
            <button onclick="window._enterAsDT('${m.team_id}','${m.league_id}')" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2 px-5 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shrink-0">Entrar →</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
}

window._enterAsDT = async (teamId, leagueId) => {
  const m = state.memberships.find(x => x.team_id === teamId && x.league_id === leagueId);
  if (!m) return;

  _dtTeam = m.teams;
  _dtLeague = m.leagues;

  const leagueName = $('dt-league-name');
  if (leagueName) leagueName.textContent = _dtLeague.name;

  showScreen('dt');

  const { data } = await supa.from('players').select('*').eq('team_id', teamId).order('name');
  _dtPlayers = data || [];
  showDTSubmissionForm();
};
