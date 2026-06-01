// ═══════════════════════════════════════════════════════════════
// dt.js — DT code entry, submission form, DT views, DT auth
// ═══════════════════════════════════════════════════════════════
import { supa, state, signOut, loadMyMemberships } from './auth.js';
import { $, showScreen, showLoading, toast, getPlanLimits, cache, getSeasonId, isArchivedSeason } from './shared.js';
import { callAI, processResult, saveSubmission, posToES } from './scanner.js';

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
      const { data: teams, error } = await supa.from('teams').select('*, leagues!inner(id, name, plan_type, max_players_per_team, settings, is_public, active_season_id)')
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
  const canScan = ['pro', 'elite', 'superadmin'].includes(league.plan_type); // DTs only scan in paid plans
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

    ${canScan ? `
    <!-- AI Auto-fill button (Pro/Elite only) -->
    <div class="bg-pitch-800/60 border border-purple-400/20 rounded-2xl p-5 mb-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-purple-400">🤖 Auto-llenar con IA</h3>
          <p class="text-xs text-gray-500">La IA lee tus fotos y rellena todo automáticamente</p>
        </div>
        <button id="btn-dt-ai" onclick="window._dtRunAI()"
          class="px-5 py-2.5 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-400 hover:to-indigo-400 shadow-lg shadow-purple-500/10">
          🤖 Escanear
        </button>
      </div>
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
  // Load all teams in this league (active season only)
  const _sid = _dtLeague.active_season_id || null;
  let _tq = supa.from('teams').select('id, name')
    .eq('league_id', _dtLeague.id).eq('is_bye', false).eq('replaced', false);
  if (_sid) _tq = _tq.eq('season_id', _sid);
  const { data: teams } = await _tq;
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
            canvas.width = 480; canvas.height = 360;
            const ctx = canvas.getContext('2d');
            const scale = Math.min(480 / img.width, 360 / img.height);
            const w2 = img.width * scale, h2 = img.height * scale;
            ctx.drawImage(img, (480 - w2) / 2, (360 - h2) / 2, w2, h2);
            resolve(canvas.toDataURL('image/jpeg', 0.75));
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
      season_id: _dtLeague.active_season_id || null,
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

window._dtViewStandings = async () => {
  const content = $('dt-content');
  showLoading(content, 'Cargando tabla...');

  const leagueId = _dtLeague.id;
  const seasonId = _dtLeague.active_season_id || null;
  let teamsQ = supa.from('teams').select('*').eq('league_id', leagueId).eq('is_bye', false).eq('replaced', false);
  let matchesQ = supa.from('matches').select('*').eq('league_id', leagueId);
  if (seasonId) { teamsQ = teamsQ.eq('season_id', seasonId); matchesQ = matchesQ.eq('season_id', seasonId); }
  const { data: teams } = await teamsQ;
  const { data: matches } = await matchesQ;

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
  const _sid1 = _dtLeague.active_season_id || null;
  let _tq1 = supa.from('teams').select('id, name').eq('league_id', leagueId);
  let _mq1 = supa.from('matches').select('*').eq('league_id', leagueId);
  if (_sid1) { _tq1 = _tq1.eq('season_id', _sid1); _mq1 = _mq1.eq('season_id', _sid1); }
  const { data: teams } = await _tq1;
  const { data: matches } = await _mq1;

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
  const _sid2 = _dtLeague.active_season_id || null;
  let _pq2 = supa.from('players').select('*').eq('league_id', leagueId).order('goals', { ascending: false });
  let _tq2 = supa.from('teams').select('id, name').eq('league_id', leagueId);
  if (_sid2) { _pq2 = _pq2.eq('season_id', _sid2); _tq2 = _tq2.eq('season_id', _sid2); }
  const { data: players } = await _pq2;
  const { data: teams } = await _tq2;
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

// DT state (accessible by other modules)
const dtState = { get team() { return _dtTeam; }, set team(v) { _dtTeam = v; }, get league() { return _dtLeague; }, set league(v) { _dtLeague = v; }, get players() { return _dtPlayers; }, set players(v) { _dtPlayers = v; }, get photos() { return _dtPhotos; }, set photos(v) { _dtPhotos = v; } };
export { dtState, initPublicDTButton, showDTCodeEntry, showDTSubmissionForm, showDTAuthenticatedView, showDTConfirmation, renderHubMemberships };
