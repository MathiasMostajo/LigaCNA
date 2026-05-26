// ═══════════════════════════════════════════════════════════════
// teams.js — Teams CRUD, players, team profiles, DT email management
// ═══════════════════════════════════════════════════════════════
import { supa, state } from './auth.js';
import { $, showLoading, toast, getPlanLimits, cache, getSeasonId, isArchivedSeason, loadTeams, loadPlayers } from './shared.js';

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
        <span class="text-xs text-gray-500 bg-pitch-800 px-2 py-1 rounded-lg">${cache.teams.filter(t=>!t.is_bye&&!t.replaced).length}/${getPlanLimits(state.activeLeague.plan_type).maxTeams === 999 ? '∞' : getPlanLimits(state.activeLeague.plan_type).maxTeams}</span>
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
    const activeTeams = cache.teams.filter(t => !t.is_bye && !t.replaced).length;
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
    if (cache.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = 'Ya existe un equipo con ese nombre'; errEl.classList.remove('hidden'); return;
    }

    // Double-check team limit right before insert
    const currentActiveTeams = cache.teams.filter(t => !t.is_bye && !t.replaced).length;
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
        season_id: getSeasonId(),
        name,
        code: autoCode,
      }).select().single();

      if (error) throw error;
      cache.teams.push(data);
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

  if (!cache.teams.length) {
    el.innerHTML = '<div class="bg-pitch-800/40 border border-dashed border-white/10 rounded-2xl p-12 text-center"><span class="text-4xl mb-4 block">🏟</span><p class="text-gray-500 mb-2">No hay equipos todavía</p><p class="text-sm text-gray-600">Creá tu primer equipo para empezar</p></div>';
    return;
  }

  const activeTeams = cache.teams.filter(t => !t.is_bye);
  const fee = state.activeLeague?.settings?.inscriptionFee || 0;
  const paidCount = activeTeams.filter(t => t.paid).length;
  const totalCollected = paidCount * fee;

  const summaryHtml = fee > 0 ? `
    <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-4 text-xs">
      <span class="text-gray-500">💰 Inscripción: <span class="text-white font-semibold">$${fee.toFixed(2)}</span></span>
      <span class="text-gray-500">✅ Pagaron: <span class="text-lime-400 font-semibold">${paidCount}/${activeTeams.length}</span></span>
      <span class="text-gray-500">💵 Recaudado: <span class="text-white font-semibold">$${totalCollected.toFixed(2)}</span></span>
    </div>
  ` : '';

  el.innerHTML = summaryHtml + activeTeams.map(t => {
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
  cache.activeTeamId = teamId;
  const team = cache.teams.find(t => t.id === teamId);
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
      <button onclick="event.stopPropagation(); window._editPlayerStats('${p.id}')" class="text-gray-700 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100 text-xs" title="Editar stats">✏️</button>
      <button onclick="event.stopPropagation(); window._removePlayer('${p.id}','${p.name}')" class="text-gray-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-xs">✕</button>
    </div>`;
  }).join('');
}

window._editPlayerStats = (playerId) => {
  if (isArchivedSeason()) { toast('📁 Temporada archivada — solo lectura', true); return; }
  const player = cache.players.find(p => p.id === playerId);
  if (!player) return;

  const avgRating = player.ratings?.length ? (player.ratings.reduce((a,b) => a + Number(b), 0) / player.ratings.length).toFixed(1) : '0';

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'edit-player-modal';
  modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-pitch-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
      <h3 class="font-display text-xl text-white mb-4">✏️ ${player.name}</h3>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label class="text-[10px] text-gray-500 uppercase tracking-wider">⚽ Goles</label>
          <input type="number" id="ep-goals" min="0" value="${player.goals || 0}" class="w-full bg-pitch-900/60 border border-white/10 rounded-lg px-3 py-2 text-white text-center outline-none focus:border-lime-400/30 mt-1">
        </div>
        <div>
          <label class="text-[10px] text-gray-500 uppercase tracking-wider">🎯 Asistencias</label>
          <input type="number" id="ep-assists" min="0" value="${player.assists || 0}" class="w-full bg-pitch-900/60 border border-white/10 rounded-lg px-3 py-2 text-white text-center outline-none focus:border-lime-400/30 mt-1">
        </div>
        <div>
          <label class="text-[10px] text-gray-500 uppercase tracking-wider">📅 Partidos</label>
          <input type="number" id="ep-matches" min="0" value="${player.matches_played || 0}" class="w-full bg-pitch-900/60 border border-white/10 rounded-lg px-3 py-2 text-white text-center outline-none focus:border-lime-400/30 mt-1">
        </div>
        <div>
          <label class="text-[10px] text-gray-500 uppercase tracking-wider">🧤 Clean Sheets</label>
          <input type="number" id="ep-cs" min="0" value="${player.cs || 0}" class="w-full bg-pitch-900/60 border border-white/10 rounded-lg px-3 py-2 text-white text-center outline-none focus:border-lime-400/30 mt-1">
        </div>
      </div>
      <p class="text-[10px] text-gray-600 mb-4">⭐ Rating promedio: ${avgRating} (${player.ratings?.length || 0} partidos)</p>
      <div class="flex gap-2">
        <button id="ep-save" class="flex-1 bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-2.5 rounded-xl text-sm">Guardar</button>
        <button id="ep-cancel" class="bg-pitch-900/60 border border-white/10 text-gray-400 font-semibold py-2.5 px-4 rounded-xl text-sm hover:text-white">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#ep-cancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  modal.querySelector('#ep-save').onclick = async () => {
    const goals = parseInt(document.getElementById('ep-goals').value) || 0;
    const assists = parseInt(document.getElementById('ep-assists').value) || 0;
    const matches_played = parseInt(document.getElementById('ep-matches').value) || 0;
    const cs = parseInt(document.getElementById('ep-cs').value) || 0;

    try {
      const { error } = await supa.from('players').update({
        goals, assists, matches_played, cs,
      }).eq('id', playerId);
      if (error) throw error;

      player.goals = goals;
      player.assists = assists;
      player.matches_played = matches_played;
      player.cs = cs;

      modal.remove();
      toast('✅ Stats actualizadas');

      // Re-render player list
      const teamPlayers = cache.players.filter(p => p.team_id === player.team_id);
      const sorted = [...teamPlayers].sort((a,b) => (b.goals||0) - (a.goals||0));
      const listEl = document.getElementById('player-list');
      if (listEl) listEl.innerHTML = renderPlayersHTML(sorted);
    } catch(e) {
      toast('⚠️ ' + e.message, true);
    }
  };
};

window._closeTeamDetail = () => {
  cache.activeTeamId = null;
  const detail = $('team-detail');
  if (detail) { detail.classList.add('hidden'); detail.innerHTML = ''; }
};

// ─── Team Actions ────────────────────────────────────────────
window._addPlayer = async (teamId) => {
  if (isArchivedSeason()) { toast('📁 Temporada archivada — solo lectura', true); return; }
  const nameEl = $('new-player-name');
  const posEl = $('new-player-pos');
  const name = nameEl?.value.trim();
  const pos = posEl?.value || '';
  if (!name) { toast('⚠️ Nombre vacío', true); return; }

  // Check max players
  const playerLimits = getPlanLimits(state.activeLeague.plan_type);
  const maxP = state.activeLeague.plan_type === 'superadmin' ? 999 : Math.min(state.activeLeague.max_players_per_team || 15, playerLimits.maxPlayers);
  const currentPlayers = cache.players.filter(p => p.team_id === teamId);
  if (currentPlayers.length >= maxP && state.activeLeague.plan_type !== 'superadmin') {
    toast(`⚠️ Límite de ${maxP} jugadores por equipo (plan ${state.activeLeague.plan_type.toUpperCase()})`, true); return;
  }

  // Check duplicate
  if (cache.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    toast('⚠️ Ya existe un jugador con ese nombre', true); return;
  }

  try {
    const { data, error } = await supa.from('players').insert({
      league_id: state.activeLeague.id,
      season_id: getSeasonId(),
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
  if (isArchivedSeason()) { toast('📁 Temporada archivada — solo lectura', true); return; }
  if (!confirm(`¿Eliminar a ${playerName}? Esto borra todas sus estadísticas.`)) return;
  try {
    const { error } = await supa.from('players').delete().eq('id', playerId);
    if (error) throw error;
    toast(`🗑 ${playerName} eliminado`);
    window._viewTeam(cache.activeTeamId);
  } catch(e) { toast('⚠️ ' + e.message, true); }
};

window._editTeam = (teamId) => {
  const team = cache.teams.find(t => t.id === teamId);
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
  const team = cache.teams.find(t => t.id === teamId);
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
  const team = cache.teams.find(t => t.id === teamId);
  if (!team) return;
  if (!confirm(`¿Eliminar ${team.name}? Se borrarán todos sus jugadores y partidos. No se puede deshacer.`)) return;

  try {
    // Delete players first (FK constraint), then team
    const { error: playersErr } = await supa.from('players').delete().eq('team_id', teamId);
    if (playersErr) throw playersErr;
    const { error } = await supa.from('teams').delete().eq('id', teamId);
    if (error) throw error;
    cache.teams = cache.teams.filter(t => t.id !== teamId);
    cache.players = cache.players.filter(p => p.team_id !== teamId);
    cache.activeTeamId = null;
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
          const w2 = img.width * scale, h2 = img.height * scale;
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

    const team = cache.teams.find(t => t.id === teamId);
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
  const sorted = [...cache.players].sort((a, b) => {
    if (col === 'rating') {
      const avgA = a.ratings?.length ? a.ratings.reduce((x,y) => x + Number(y), 0) / a.ratings.length : 0;
      const avgB = b.ratings?.length ? b.ratings.reduce((x,y) => x + Number(y), 0) / b.ratings.length : 0;
      return avgB - avgA;
    }
    return (b[col] || 0) - (a[col] || 0);
  });
  el.innerHTML = renderPlayersHTML(sorted);
};

window._viewTeamProfile = async (teamId) => {
  const team = cache.teams.find(t => t.id === teamId);
  if (!team) return;

  if (!cache.matches.length) await loadMatches();
  const players = cache.players.filter(p => p.team_id === teamId);

  // Calculate team stats
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  const teamMatches = [];
  cache.matches.forEach(m => {
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

export { initTeamsSection, renderTeamsList, renderPlayersHTML, renderDTEmails };
