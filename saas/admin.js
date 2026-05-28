// ═══════════════════════════════════════════════════════════════
// admin.js — Settings, inbox, admin scanner, transfers, playoffs
// ═══════════════════════════════════════════════════════════════
import { supa, state } from './auth.js';
import { $, showLoading, toast, getPlanLimits, cache, getSeasonId, isArchivedSeason, loadTeams, loadPlayers, tn } from './shared.js';
import { callAI, processResult, saveMatchStats, updatePlayerStats, approveSubmission, rejectSubmission, posToES } from './scanner.js';
import { calculateStandings } from './fixture.js';

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

  if (!cache.teams.length) await loadTeams();

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

    <!-- Inscription fee -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="font-display text-lg text-white mb-2">💰 Precio de Inscripción</h3>
      <p class="text-xs text-gray-500 mb-3">Establecé un monto que cada equipo debe pagar para participar. Podés marcar quién pagó desde la pestaña Equipos.</p>
      <div class="flex items-center gap-3">
        <span class="text-white font-semibold">$</span>
        <input type="number" id="set-inscription-fee" min="0" step="0.01" value="${league.settings?.inscriptionFee || 0}" class="w-32 bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2 text-white text-center outline-none focus:border-lime-400/40 text-sm" placeholder="0.00">
        <span class="text-xs text-gray-500">USD</span>
        <button id="btn-save-fee" class="bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold py-2 px-4 rounded-xl text-sm hover:bg-lime-400/20 transition-all">💾 Guardar</button>
      </div>
    </div>

    <!-- Tiebreaker config -->
    <div class="bg-pitch-800/60 border border-white/5 rounded-2xl p-5 mb-4">
      <h3 class="font-display text-lg text-white mb-2">⚖️ Criterios de Desempate</h3>
      <p class="text-xs text-gray-500 mb-4">Cuando dos equipos tienen los mismos puntos, se aplican estos criterios en orden. Usá ▲ ▼ para reordenar.</p>
      <div id="tiebreaker-list"></div>
      <button id="btn-save-tiebreakers" class="mt-3 bg-lime-400/10 text-lime-400 border border-lime-400/20 font-semibold py-2 px-4 rounded-xl text-sm hover:bg-lime-400/20 transition-all">💾 Guardar Criterios</button>
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
      const inscriptionFee = parseFloat($('set-inscription-fee')?.value) || 0;
      const updates = {
        max_players_per_team: parseInt($('set-max-players').value) || 15,
        is_public: $('set-is-public').checked,
        settings: { ...(league.settings || {}), requirePhotos, inscriptionFee },
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

  // Tiebreaker config
  const allCriteria = [
    { type: 'gd', label: 'Diferencia de goles', icon: '➖' },
    { type: 'gf', label: 'Goles a favor', icon: '⚽' },
    { type: 'ga', label: 'Goles en contra (menos es mejor)', icon: '🧤' },
    { type: 'wins', label: 'Victorias', icon: '✅' },
    { type: 'h2h', label: 'Resultado directo', icon: '⚔️', hasModes: true },
  ];

  let currentTiebreakers = [...(league.settings?.tiebreakers || [
    { type: 'gd' }, { type: 'gf' }
  ])];

  function renderTiebreakerList() {
    const el = $('tiebreaker-list');
    if (!el) return;

    // Enabled items first (in order), then disabled
    const enabledTypes = currentTiebreakers.map(t => t.type);
    const disabled = allCriteria.filter(c => !enabledTypes.includes(c.type));

    el.innerHTML = currentTiebreakers.map((tb, i) => {
      const crit = allCriteria.find(c => c.type === tb.type) || { label: tb.type, icon: '?' };
      const h2hMode = tb.type === 'h2h' ? `
        <select data-h2h-mode="${i}" class="ml-2 bg-pitch-900/60 border border-white/10 rounded-lg px-2 py-0.5 text-[10px] text-gray-400 outline-none">
          <option value="aggregate" ${(tb.mode || 'aggregate') === 'aggregate' ? 'selected' : ''}>Global (suma goles)</option>
          <option value="wins" ${tb.mode === 'wins' ? 'selected' : ''}>Solo victorias</option>
        </select>
      ` : '';

      return `<div class="flex items-center gap-2 py-2 border-b border-white/5">
        <span class="text-sm">${i + 1}.</span>
        <span class="text-sm">${crit.icon}</span>
        <span class="flex-1 text-sm text-white">${crit.label}</span>
        ${h2hMode}
        <button onclick="window._moveTiebreaker(${i}, -1)" class="text-gray-600 hover:text-white text-xs px-1" ${i === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
        <button onclick="window._moveTiebreaker(${i}, 1)" class="text-gray-600 hover:text-white text-xs px-1" ${i === currentTiebreakers.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
        <button onclick="window._removeTiebreaker(${i})" class="text-gray-600 hover:text-red-400 text-xs px-1">✕</button>
      </div>`;
    }).join('')

    + (disabled.length ? `
      <div class="mt-3 pt-3 border-t border-white/5">
        <p class="text-[10px] text-gray-600 uppercase tracking-wider mb-2">Disponibles</p>
        ${disabled.map(c => `
          <button onclick="window._addTiebreaker('${c.type}')" class="inline-flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-500 hover:text-white hover:border-lime-400/20 transition-all mr-1 mb-1">
            ${c.icon} ${c.label}
          </button>
        `).join('')}
      </div>
    ` : '');

    // Bind h2h mode dropdowns
    el.querySelectorAll('[data-h2h-mode]').forEach(sel => {
      sel.onchange = (e) => {
        const idx = parseInt(e.target.getAttribute('data-h2h-mode'));
        currentTiebreakers[idx].mode = e.target.value;
      };
    });
  }

  window._moveTiebreaker = (index, direction) => {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= currentTiebreakers.length) return;
    [currentTiebreakers[index], currentTiebreakers[newIdx]] = [currentTiebreakers[newIdx], currentTiebreakers[index]];
    renderTiebreakerList();
  };

  window._removeTiebreaker = (index) => {
    currentTiebreakers.splice(index, 1);
    renderTiebreakerList();
  };

  window._addTiebreaker = (type) => {
    const entry = { type };
    if (type === 'h2h') entry.mode = 'aggregate';
    currentTiebreakers.push(entry);
    renderTiebreakerList();
  };

  renderTiebreakerList();

  $('btn-save-tiebreakers').onclick = async () => {
    try {
      const settings = { ...(league.settings || {}), tiebreakers: currentTiebreakers };
      const { error } = await supa.from('leagues').update({ settings }).eq('id', league.id);
      if (error) throw error;
      league.settings = settings;
      toast('✅ Criterios de desempate guardados');
    } catch(e) { toast('⚠️ ' + e.message, true); }
  };

  // Inscription fee save (quick save)
  $('btn-save-fee').onclick = async () => {
    const fee = parseFloat($('set-inscription-fee')?.value) || 0;
    try {
      const settings = { ...(league.settings || {}), inscriptionFee: fee };
      const { error } = await supa.from('leagues').update({ settings }).eq('id', league.id);
      if (error) throw error;
      league.settings = settings;
      toast('✅ Precio de inscripción: $' + fee.toFixed(2));
    } catch(e) { toast('⚠️ ' + e.message, true); }
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

      cache.matches = [];
      cache.schedule = [];
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
      cache.teams = []; cache.players = []; cache.matches = []; cache.schedule = [];
      toast('🗑 Liga eliminada');
      setTimeout(() => { window.location.hash = ''; window.location.reload(); }, 500);
    } catch(e) { toast('⚠️ ' + e.message, true); }
  };
}

function renderTeamCodes() {
  if (!cache.teams.length) return '<p class="text-gray-600 text-sm">Sin equipos</p>';

  return cache.teams.filter(t => !t.is_bye && !t.replaced).map(t => {
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
        season_id: getSeasonId(),
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

  if (!cache.teams.length) await loadTeams();
  if (!cache.players.length) await loadPlayers();

  const plan = state.activeLeague.plan_type;
  const isPaid = ['pro', 'elite', 'superadmin'].includes(plan);
  const scansRemaining = state.profile?.ai_trial_scans || 0;
  const canScan = isPaid || scansRemaining > 0;
  const scanLabel = isPaid
    ? '🤖 Escanear con IA'
    : (scansRemaining > 0 ? `🤖 Escanear con IA (${scansRemaining} restantes este mes)` : '🔒 Sin scans disponibles — se renuevan el próximo mes');

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
            ${cache.teams.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">✈️ Visitante</label>
          <select id="as-away" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-lime-400/40">
            <option value="">— Elegí —</option>
            ${cache.teams.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
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
      ${canScan ? scanLabel : '🔒 Sin scans disponibles — se renuevan el próximo mes'}
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
        registered_players: cache.players.map(p => ({ id: p.id, name: p.name, pos: p.pos })),
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
      cache.teams.forEach(t => {
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

    // Decrement scan counter for Amateur
    if (!['pro', 'elite', 'superadmin'].includes(state.activeLeague.plan_type) && state.profile) {
      state.profile.ai_trial_scans = Math.max(0, (state.profile.ai_trial_scans || 0) - 1);
      await supa.from('profiles').update({ ai_trial_scans: state.profile.ai_trial_scans }).eq('id', state.user.id);
    }
  } catch(e) {
    console.error('Admin scan error:', e);
    toast('⚠️ ' + e.message, true);
  }

  btn.disabled = false;
  const remaining = state.profile?.ai_trial_scans || 0;
  const isPaidPlan = ['pro', 'elite', 'superadmin'].includes(state.activeLeague?.plan_type);
  btn.innerHTML = isPaidPlan ? '🤖 Escanear con IA' : (remaining > 0 ? `🤖 Escanear con IA (${remaining} restantes)` : '🔒 Sin scans disponibles');
  if (!isPaidPlan && remaining <= 0) btn.disabled = true;
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
        const player = cache.players.find(p => {
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
    const homeName = cache.teams.find(t => t.id === homeId)?.name || '?';
    const awayName = cache.teams.find(t => t.id === awayId)?.name || '?';
    toast('✅ ' + homeName + ' ' + hg + '–' + ag + ' ' + awayName);
  } catch(e) {
    toast('⚠️ ' + e.message, true);
  }

  btn.disabled = false; btn.textContent = '✅ Guardar Resultado';
};

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

  if (!cache.teams.length) await loadTeams();

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
            ${cache.teams.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
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
        const teamName = cache.teams.find(t => t.id === f.team_id)?.name || f.team_name || '?';
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
    const currentCount = cache.players.filter(p => p.team_id === teamId).length;
    const pendingCount = (pending || []).filter(f => f.team_id === teamId && f.status === 'pending').length;
    if ((currentCount + pendingCount) >= limits.maxPlayers && state.activeLeague.plan_type !== 'superadmin') {
      toast('⚠️ Equipo al límite de jugadores', true); return;
    }

    try {
      const teamName = cache.teams.find(t => t.id === teamId)?.name || '';
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
    cache.players = []; // clear cache
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


export { initSettingsSection, initInboxSection, initAdminScannerSection, initTransfersSection, initPlayoffsSection, renderPlayoffsBracket, renderTeamCodes };
