// ═══════════════════════════════════════════════════════════════
// app.js — App Orchestrator + Scanner Integration
// ═══════════════════════════════════════════════════════════════
import { supa, state, on, signUp, signIn, signOut, createLeague, initAuth } from './auth.js';
import { callAI, processResult, saveSubmission, saveMatchStats, updatePlayerStats, approveSubmission, rejectSubmission, posToES } from './scanner.js';

const $ = id => document.getElementById(id);
let _loginBound = false, _onboardBound = false, _dashBound = false;

// ─── Screen Router ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('[data-screen]').forEach(el => el.classList.add('hidden'));
  const t = $(`screen-${id}`);
  if (t) t.classList.remove('hidden');
}

// ─── Toast ───────────────────────────────────────────────────
function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = `fixed bottom-4 right-4 z-[9999] px-5 py-3 rounded-xl text-sm font-semibold shadow-xl transition-all duration-300 ${isError ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-pitch-900'}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// LOGIN / REGISTER
// ═══════════════════════════════════════════════════════════════
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

  function showError(msg, isErr = true) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    errorEl.className = `mt-4 text-sm text-center py-2 px-4 rounded-lg ${isErr ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`;
  }

  submitBtn.onclick = async () => {
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    if (!email || !password) { showError('Completá email y contraseña'); return; }
    if (password.length < 6) { showError('Mínimo 6 caracteres'); return; }
    submitBtn.disabled = true;
    const orig = submitBtn.textContent;
    submitBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>';
    try {
      if (isRegister) { await signUp(email, password); showError('✅ Revisá tu email para confirmar', false); }
      else { await signIn(email, password); }
    } catch (e) { showError(e.message); }
    submitBtn.disabled = false;
    submitBtn.textContent = orig;
  };

  $('auth-password').onkeydown = e => { if (e.key === 'Enter') submitBtn.click(); };
  setMode(false);
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════
function initOnboardingUI() {
  if (_onboardBound) return;
  _onboardBound = true;

  const submitBtn = $('onboard-submit');
  const errorEl = $('onboard-error');

  submitBtn.onclick = async () => {
    const name = $('league-name').value.trim();
    const maxPlayers = parseInt($('league-max-players').value) || 11;
    if (!name || name.length < 3) { errorEl.textContent = 'Mínimo 3 caracteres'; errorEl.classList.remove('hidden'); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando liga...';
    try { await createLeague(name, maxPlayers); }
    catch (e) { errorEl.textContent = e.message; errorEl.classList.remove('hidden'); submitBtn.disabled = false; submitBtn.textContent = 'Crear Liga →'; }
  };
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD + SCANNER INTEGRATION
// ═══════════════════════════════════════════════════════════════

// Scanner state
let scanImages = { score: null, players: null, stats: null };
let scanResult = null;
let apiKey = '';

function initDashboard() {
  if (_dashBound) return;
  _dashBound = true;

  // Populate info
  const ln = $('dash-league-name');
  const lnm = $('dash-league-name-mobile');
  const ue = $('dash-user-email');
  if (ln) ln.textContent = state.league.name;
  if (lnm) lnm.textContent = state.league.name;
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

  // Logout
  $('btn-logout').onclick = () => { _dashBound = false; _loginBound = false; signOut(); };

  // Mobile sidebar
  const sidebar = $('sidebar'), overlay = $('sidebar-overlay');
  $('btn-menu').onclick = () => { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); };
  overlay.onclick = () => { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); };

  // ─── Scanner UI ────────────────────────────────────────────
  initScannerUI();

  // ─── Load API key from league settings ─────────────────────
  apiKey = state.league.settings?.apiKey || localStorage.getItem('lcna_api_key') || '';
  if ($('api-key-input')) $('api-key-input').value = apiKey ? '••••••••' : '';

  // ─── Load pending submissions ──────────────────────────────
  loadSubmissions();
}

function initScannerUI() {
  const container = document.querySelector('[data-section="scanner"]');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center gap-3 mb-6">
      <span class="text-2xl">🤖</span>
      <h2 class="font-display text-3xl tracking-wide text-white">ESCÁNER IA</h2>
    </div>

    <!-- API Key -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <div class="flex items-center gap-3 mb-3">
        <span>🔑</span>
        <span class="text-sm font-semibold text-gray-400 uppercase tracking-wider">Claude API Key</span>
      </div>
      <div class="flex gap-2">
        <input id="api-key-input" type="password" placeholder="sk-ant-..." class="flex-1 bg-pitch-900/60 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
        <button id="btn-save-key" class="bg-lime-400/10 text-lime-400 border border-lime-400/20 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-lime-400/20 transition-all">Guardar</button>
      </div>
    </div>

    <!-- Upload zones -->
    <div class="grid grid-cols-3 gap-3 mb-4">
      ${['score|📊|Marcador', 'players|👥|Jugadores', 'stats|📈|Stats'].map(z => {
        const [key, icon, label] = z.split('|');
        return `<div class="relative">
          <input type="file" accept="image/*" id="img-${key}" class="hidden" data-scan-type="${key}">
          <label for="img-${key}" id="zone-${key}" class="block bg-pitch-800/60 border-2 border-dashed border-white/10 rounded-2xl p-4 text-center cursor-pointer hover:border-lime-400/30 transition-all min-h-[120px] flex flex-col items-center justify-center gap-2">
            <span class="text-2xl">${icon}</span>
            <span class="text-xs text-gray-500 font-semibold uppercase tracking-wider">${label}</span>
            <img id="preview-${key}" class="hidden w-full rounded-lg mt-2 max-h-24 object-cover">
          </label>
        </div>`;
      }).join('')}
    </div>

    <!-- Scan button -->
    <button id="btn-scan" disabled class="w-full bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3.5 rounded-xl hover:from-lime-300 hover:to-emerald-400 transition-all text-sm uppercase tracking-wider shadow-lg shadow-lime-400/10 active:scale-[.98] disabled:opacity-30 disabled:cursor-not-allowed mb-6">
      🤖 Escanear con IA
    </button>

    <!-- Results area -->
    <div id="scan-results" class="hidden">
      <div class="bg-pitch-800/60 border border-lime-400/20 rounded-2xl p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-xl">✅</span>
          <h3 class="font-display text-xl text-white">RESULTADO DEL ESCANEO</h3>
        </div>
        <div id="scan-results-body"></div>
      </div>
    </div>

    <!-- Pending submissions -->
    <div id="submissions-section" class="mt-6">
      <div class="flex items-center gap-3 mb-4">
        <span class="text-xl">📋</span>
        <h3 class="font-display text-xl text-white">SUBMISSIONS PENDIENTES</h3>
      </div>
      <div id="submissions-list"></div>
    </div>
  `;

  // ─── Event Listeners ───────────────────────────────────────

  // Save API Key
  $('btn-save-key').onclick = () => {
    const val = $('api-key-input').value.trim();
    if (!val || val === '••••••••') return;
    apiKey = val;
    localStorage.setItem('lcna_api_key', val);
    $('api-key-input').value = '••••••••';
    toast('🔑 API Key guardada');
  };

  // Image upload handlers
  document.querySelectorAll('[data-scan-type]').forEach(input => {
    input.onchange = (e) => {
      const type = input.dataset.scanType;
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        scanImages[type] = ev.target.result;
        const preview = $(`preview-${type}`);
        if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
        const zone = $(`zone-${type}`);
        if (zone) zone.classList.add('border-lime-400/40');
        updateScanBtn();
      };
      reader.readAsDataURL(file);
    };
  });

  // Scan button
  $('btn-scan').onclick = runScan;
}

function updateScanBtn() {
  const btn = $('btn-scan');
  if (!btn) return;
  const hasImages = scanImages.score || scanImages.players || scanImages.stats;
  btn.disabled = !hasImages || !apiKey;
}

// ═══════════════════════════════════════════════════════════════
// RUN SCAN
// ═══════════════════════════════════════════════════════════════
async function runScan() {
  const btn = $('btn-scan');
  btn.disabled = true;
  btn.innerHTML = '<svg class="animate-spin h-5 w-5 mx-auto inline" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Escaneando...';

  try {
    // Fetch registered players for this league
    const { data: players } = await supa.from('players').select('id, name, pos, team_id').eq('league_id', state.league.id);

    // Build images array (only non-null)
    const images = [scanImages.score, scanImages.players, scanImages.stats].filter(Boolean);
    if (!images.length) { toast('⚠️ Subí al menos una imagen', true); return; }

    // Call AI
    const raw = await callAI(images, players || [], apiKey);
    scanResult = processResult(raw, players || []);

    // Render results
    renderScanResults(scanResult);
    $('scan-results').classList.remove('hidden');
    toast('✅ Escaneo completado');

  } catch (e) {
    console.error('Scan error:', e);
    toast('⚠️ Error: ' + e.message, true);
  }

  btn.disabled = false;
  btn.innerHTML = '🤖 Escanear con IA';
  updateScanBtn();
}

// ═══════════════════════════════════════════════════════════════
// RENDER SCAN RESULTS
// ═══════════════════════════════════════════════════════════════
function renderScanResults(result) {
  const body = $('scan-results-body');
  if (!body) return;

  const sc = result.score || {};
  const posColor = pos => {
    const p = posToES(pos);
    if (p === 'POR') return 'bg-orange-500';
    if (['DFC','LI','LD','CAI','CAD','DEF'].includes(p)) return 'bg-blue-500';
    if (['MCD','MC','MCO','MI','MD'].includes(p)) return 'bg-emerald-500';
    return 'bg-red-500';
  };

  body.innerHTML = `
    <!-- Score -->
    <div class="grid grid-cols-3 gap-4 items-center text-center mb-6 py-4 bg-pitch-900/40 rounded-xl">
      <div>
        <p class="font-display text-lg text-white">${sc.home || '?'}</p>
        <p class="text-xs text-gray-500">🏠 LOCAL</p>
      </div>
      <div class="font-display text-4xl text-lime-400">${sc.homeGoals ?? '?'} – ${sc.awayGoals ?? '?'}</div>
      <div>
        <p class="font-display text-lg text-white">${sc.away || '?'}</p>
        <p class="text-xs text-gray-500">✈️ VISITANTE</p>
      </div>
    </div>

    <!-- Players table -->
    <div class="mb-4">
      <p class="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">👤 Jugadores detectados (${result.players.length})</p>
      <div class="space-y-1">
        ${result.players.map(p => `
          <div class="flex items-center gap-2 py-2 px-3 bg-pitch-900/30 rounded-lg text-sm">
            <span class="${posColor(p.position)} text-[10px] font-bold text-white px-1.5 py-0.5 rounded">${posToES(p.position)}</span>
            <span class="flex-1 font-medium text-white">${p.playerName}</span>
            <span class="text-gray-500">${p.team === 'home' ? '🏠' : '✈️'}</span>
            ${p.goals ? `<span class="text-xs">⚽${p.goals}</span>` : ''}
            ${p.assists ? `<span class="text-xs">🎯${p.assists}</span>` : ''}
            ${p.rating ? `<span class="text-xs text-yellow-400">⭐${p.rating}</span>` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    ${result.unregistered.length ? `
      <div class="mb-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
        <p class="text-xs text-yellow-400 font-semibold mb-1">⚠️ Jugadores no registrados (${result.unregistered.length})</p>
        <p class="text-xs text-gray-500">${result.unregistered.join(', ')}</p>
      </div>
    ` : ''}

    <!-- Team selectors -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div>
        <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">🏠 Local</label>
        <select id="scan-home-team" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
          <option value="">— Elegí —</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1 font-semibold">✈️ Visitante</label>
        <select id="scan-away-team" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
          <option value="">— Elegí —</option>
        </select>
      </div>
    </div>

    <!-- Editable score -->
    <div class="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-4">
      <input type="number" id="scan-hg" min="0" value="${sc.homeGoals ?? 0}" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
      <span class="text-gray-500 text-lg">–</span>
      <input type="number" id="scan-ag" min="0" value="${sc.awayGoals ?? 0}" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
    </div>

    <!-- Actions -->
    <div class="flex gap-3">
      <button id="btn-approve-scan" class="flex-1 bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3 rounded-xl hover:from-lime-300 hover:to-emerald-400 transition-all text-sm uppercase tracking-wider">
        ✅ Guardar Partido
      </button>
      <button id="btn-discard-scan" class="bg-pitch-700 text-gray-400 font-semibold py-3 px-6 rounded-xl hover:bg-pitch-600 transition-all text-sm">
        ✕
      </button>
    </div>
  `;

  // Populate team dropdowns
  loadTeamDropdowns();

  // Approve button
  $('btn-approve-scan').onclick = saveScanResult;

  // Discard
  $('btn-discard-scan').onclick = () => {
    $('scan-results').classList.add('hidden');
    scanResult = null;
  };
}

// ═══════════════════════════════════════════════════════════════
// LOAD TEAMS INTO DROPDOWNS
// ═══════════════════════════════════════════════════════════════
async function loadTeamDropdowns() {
  const { data: teams } = await supa.from('teams').select('id, name').eq('league_id', state.league.id).eq('is_bye', false).eq('replaced', false);
  if (!teams) return;

  const opts = teams.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const homeEl = $('scan-home-team');
  const awayEl = $('scan-away-team');
  if (homeEl) homeEl.innerHTML = `<option value="">— Elegí —</option>${opts}`;
  if (awayEl) awayEl.innerHTML = `<option value="">— Elegí —</option>${opts}`;

  // Try to pre-select by matching scan team names
  if (scanResult?.score) {
    const norm = s => (s || '').toLowerCase().trim();
    const guessH = teams.find(t => norm(t.name).includes(norm(scanResult.score.home)) || norm(scanResult.score.home).includes(norm(t.name)));
    const guessA = teams.find(t => norm(t.name).includes(norm(scanResult.score.away)) || norm(scanResult.score.away).includes(norm(t.name)));
    if (guessH && homeEl) homeEl.value = guessH.id;
    if (guessA && awayEl) awayEl.value = guessA.id;
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE SCAN RESULT → SUPABASE
// ═══════════════════════════════════════════════════════════════
async function saveScanResult() {
  const homeId = $('scan-home-team')?.value;
  const awayId = $('scan-away-team')?.value;
  const hg = parseInt($('scan-hg')?.value ?? 0);
  const ag = parseInt($('scan-ag')?.value ?? 0);

  if (!homeId || !awayId) { toast('⚠️ Seleccioná ambos equipos', true); return; }
  if (homeId === awayId) { toast('⚠️ Los equipos no pueden ser iguales', true); return; }

  const btn = $('btn-approve-scan');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    // Build playerStats keyed by player ID
    const ps = {};
    for (const p of (scanResult?.players || [])) {
      if (!p.playerId) continue;
      const isGK = ['GK', 'POR', 'PO'].includes((p.position || '').toUpperCase());
      const isHome = p.team === 'home';
      const autoCS = isGK && (isHome ? ag === 0 : hg === 0);
      ps[p.playerId] = {
        goals: p.goals || 0,
        assists: p.assists || 0,
        rating: p.rating || 0,
        position: (p.position || 'N/A').toUpperCase(),
        played: true,
        cs: autoCS,
      };
    }

    // Save match
    const matchId = await saveMatchStats(homeId, awayId, hg, ag, ps, null, new Date().toISOString().split('T')[0]);

    // Update player aggregates
    await updatePlayerStats(ps);

    // Save submission for audit
    await saveSubmission(scanResult, [scanImages.score, scanImages.players, scanImages.stats].filter(Boolean), '', '');

    // Reset
    scanResult = null;
    scanImages = { score: null, players: null, stats: null };
    document.querySelectorAll('[data-scan-type]').forEach(el => el.value = '');
    document.querySelectorAll('[id^="preview-"]').forEach(el => { el.classList.add('hidden'); el.src = ''; });
    document.querySelectorAll('[id^="zone-"]').forEach(el => el.classList.remove('border-lime-400/40'));
    $('scan-results').classList.add('hidden');

    toast('✅ Partido guardado correctamente');
    loadSubmissions();

  } catch (e) {
    console.error('Save error:', e);
    toast('⚠️ Error al guardar: ' + e.message, true);
  }

  btn.disabled = false;
  btn.innerHTML = '✅ Guardar Partido';
}

// ═══════════════════════════════════════════════════════════════
// LOAD PENDING SUBMISSIONS
// ═══════════════════════════════════════════════════════════════
async function loadSubmissions() {
  const list = $('submissions-list');
  if (!list) return;

  const { data: subs } = await supa
    .from('submissions')
    .select('*')
    .eq('league_id', state.league.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (!subs?.length) {
    list.innerHTML = '<div class="bg-pitch-800/40 border border-white/5 rounded-xl p-6 text-center text-gray-600 text-sm">No hay submissions pendientes</div>';
    return;
  }

  list.innerHTML = subs.map(sub => {
    const sc = sub.scan_result?.score || {};
    return `<div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 mb-3">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm font-semibold text-white">${sc.home || '?'} ${sc.homeGoals ?? '?'} – ${sc.awayGoals ?? '?'} ${sc.away || '?'}</div>
        <span class="text-[10px] text-gray-600">${new Date(sub.created_at).toLocaleString()}</span>
      </div>
      ${sub.team_name ? `<p class="text-xs text-gray-500 mb-2">Enviado por: ${sub.team_name}</p>` : ''}
      <div class="flex gap-2">
        <button onclick="window._approveSub('${sub.id}')" class="flex-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-500/20 transition-all">✅ Aprobar</button>
        <button onclick="window._rejectSub('${sub.id}')" class="flex-1 bg-red-500/10 text-red-400 border border-red-500/20 py-2 rounded-lg text-xs font-semibold hover:bg-red-500/20 transition-all">✕ Rechazar</button>
      </div>
    </div>`;
  }).join('');
}

// Expose approval/rejection globally for onclick
window._approveSub = async (id) => {
  try { await approveSubmission(id); toast('✅ Submission aprobada'); loadSubmissions(); }
  catch (e) { toast('⚠️ Error: ' + e.message, true); }
};

window._rejectSub = async (id) => {
  try { await rejectSubmission(id); toast('✕ Submission rechazada'); loadSubmissions(); }
  catch (e) { toast('⚠️ Error: ' + e.message, true); }
};

// ═══════════════════════════════════════════════════════════════
// AUTH EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════
on('auth:loading', () => showScreen('loading'));
on('auth:logout', () => { showScreen('auth'); _loginBound = false; initLoginUI(); });
on('auth:needs-onboarding', () => { showScreen('onboarding'); _onboardBound = false; initOnboardingUI(); });
on('auth:ready', () => { showScreen('dashboard'); _dashBound = false; initDashboard(); });
on('auth:error', (e) => { console.error(e); showScreen('auth'); _loginBound = false; initLoginUI(); });

// ─── Boot ────────────────────────────────────────────────────
initAuth();
