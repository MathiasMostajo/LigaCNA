// ═══════════════════════════════════════════════════════════════
// fixture.js — Fixture generation, results, standings, H2H, match history
// ═══════════════════════════════════════════════════════════════
import { supa, state } from './auth.js';
import { $, showScreen, showLoading, toast, cache, getSeasonId, isArchivedSeason, loadTeams, loadPlayers, loadMatches, tn } from './shared.js';

function getMatchResult(homeId, awayId) {
  // Only match the EXACT home/away pair — A vs B is different from B vs A
  return cache.matches.find(m => m.home_id === homeId && m.away_id === awayId);
}
function generateCalendar(teamIds, format = 'idayvuelta') {
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

  const schedule = [];
  let rnum = 1;
  leg1Pairs.forEach(pairs => { schedule.push({ round: rnum++, fixtures: pairs }); });

  // Only add vuelta if format is idayvuelta
  if (format === 'idayvuelta') {
    const leg2Pairs = leg1Pairs.map(round =>
      round.map(f => ({ home: f.away, away: f.home }))
    );
    const shift = Math.floor((n - 1) / 2);
    const leg2Shifted = [...leg2Pairs.slice(shift), ...leg2Pairs.slice(0, shift)];
    leg2Shifted.forEach(pairs => { schedule.push({ round: rnum++, fixtures: pairs }); });
  }

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
  if (!cache.teams.length) await loadTeams();
  await loadMatches();
  if (!cache.players.length) await loadPlayers();
  const seasonId = getSeasonId();
  cache.schedule = (state.activeLeague.settings?.schedules || {})[seasonId] || state.activeLeague.settings?.schedule || [];

  const hasSchedule = cache.schedule.length > 0;

  container.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📅</span>
        <h2 class="font-display text-3xl tracking-wide text-white">FIXTURE</h2>
      </div>
      <div class="flex flex-wrap gap-2">
        <button onclick="window._showMatchHistory()" class="text-xs text-gray-500 hover:text-lime-400 bg-white/5 border border-white/10 px-2 py-1 rounded-lg transition-all">🕹 Historial</button>
        ${hasSchedule ? `<button onclick="window._openPlayoffs()" class="bg-purple-500/10 text-purple-400 border border-purple-400/20 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-purple-500/20 transition-all">🏆 Playoffs</button>` : ''}
        ${hasSchedule ? `<button id="btn-clear-fixture" class="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-lg text-xs font-semibold hover:bg-red-500/20 transition-all">🗑 Borrar</button>` : ''}
        <button id="btn-gen-fixture" class="bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-1 px-4 rounded-lg text-xs uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">${hasSchedule ? '🔄 Regenerar' : '📅 Generar'}</button>
      </div>
    </div>

    <!-- Summary -->
    ${hasSchedule ? `
      <div class="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-3 sm:p-4 text-center">
          <p class="font-display text-xl sm:text-2xl text-white">${cache.schedule.length}</p>
          <p class="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">Fechas</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-3 sm:p-4 text-center">
          <p class="font-display text-xl sm:text-2xl text-white">${cache.schedule.reduce((t, r) => t + r.fixtures.length, 0)}</p>
          <p class="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">Partidos</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-3 sm:p-4 text-center">
          <p class="font-display text-xl sm:text-2xl text-lime-400">${cache.matches.length}</p>
          <p class="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider">Jugados</p>
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
    const activeTeams = cache.teams.filter(t => !t.is_bye && !t.replaced);
    if (activeTeams.length < 2) { toast('⚠️ Necesitás al menos 2 equipos activos', true); return; }

    // Show format selection modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-pitch-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm">
        <h3 class="font-display text-xl text-white mb-4">📅 Formato del Fixture</h3>
        <div class="space-y-3 mb-5">
          <button id="fmt-ida" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl p-4 text-left hover:border-lime-400/30 transition-all">
            <p class="text-white font-semibold text-sm">Solo Ida</p>
            <p class="text-xs text-gray-500">Cada equipo juega contra cada uno una vez</p>
            <p class="text-[10px] text-gray-600 mt-1">${activeTeams.length} equipos → ${Math.floor((activeTeams.length - (activeTeams.length % 2 === 0 ? 0 : 1)) * ((activeTeams.length - (activeTeams.length % 2 === 0 ? 0 : 1)) - 1) / 2)} partidos</p>
          </button>
          <button id="fmt-idayvuelta" class="w-full bg-pitch-900/60 border border-lime-400/20 rounded-xl p-4 text-left hover:border-lime-400/30 transition-all">
            <p class="text-white font-semibold text-sm">Ida y Vuelta</p>
            <p class="text-xs text-gray-500">Cada equipo juega contra cada uno dos veces (local y visitante)</p>
            <p class="text-[10px] text-gray-600 mt-1">${activeTeams.length} equipos → ${(activeTeams.length - (activeTeams.length % 2 === 0 ? 0 : 1)) * ((activeTeams.length - (activeTeams.length % 2 === 0 ? 0 : 1)) - 1)} partidos</p>
          </button>
        </div>
        <button id="fmt-cancel" class="w-full text-sm text-gray-500 hover:text-white py-2">Cancelar</button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#fmt-cancel').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const doGen = async (format) => {
      modal.remove();
      const schedule = generateCalendar(activeTeams.map(t => t.id), format);
      cache.schedule = schedule;
      const curSettings = { ...(state.activeLeague.settings || {}) };
      if (!curSettings.schedules) curSettings.schedules = {};
      curSettings.schedules[getSeasonId()] = schedule;
      curSettings.fixtureFormat = format; // remember format
      const { error } = await supa.from('leagues').update({ settings: curSettings }).eq('id', state.activeLeague.id);
      if (error) { toast('⚠️ Error: ' + error.message, true); return; }
      state.activeLeague.settings = curSettings;
      initFixtureSection();
      const totalGames = schedule.reduce((t, r) => t + r.fixtures.length, 0);
      toast(`📅 ${totalGames} partidos en ${schedule.length} fechas!`);
    };

    modal.querySelector('#fmt-ida').onclick = () => {
      if (hasSchedule && !confirm('¿Regenerar fixture? Se borrará el actual.')) { modal.remove(); return; }
      doGen('ida');
    };
    modal.querySelector('#fmt-idayvuelta').onclick = () => {
      if (hasSchedule && !confirm('¿Regenerar fixture? Se borrará el actual.')) { modal.remove(); return; }
      doGen('idayvuelta');
    };
  };

  // Render playoffs if configured
  // Playoffs rendering handled by app.js after dashboard init

  if ($('btn-clear-fixture')) {
    $('btn-clear-fixture').onclick = async () => {
      if (!confirm('¿Borrar el fixture?')) return;

      const playedMatches = cache.matches.length;
      let deleteResults = false;
      if (playedMatches > 0) {
        deleteResults = confirm(`Hay ${playedMatches} partidos jugados.\n\n¿Querés borrar TAMBIÉN los resultados y revertir las estadísticas?\n\n• Aceptar = borra fixture Y resultados\n• Cancelar = borra solo el fixture, deja los resultados`);
      }

      // Clear schedule
      cache.schedule = [];
      const curSettings2 = { ...(state.activeLeague.settings || {}) };
      if (curSettings2.schedules) delete curSettings2.schedules[getSeasonId()];
      delete curSettings2.schedule;
      const { error } = await supa.from('leagues').update({ settings: curSettings2 }).eq('id', state.activeLeague.id);
      if (error) { toast('⚠️ Error: ' + error.message, true); return; }
      state.activeLeague.settings = curSettings2;

      // Delete results if requested
      if (deleteResults) {
        for (const m of cache.matches) {
          await reversePlayerStats(m);
        }
        const seasonId = getSeasonId();
        let delQuery = supa.from('matches').delete().eq('league_id', state.activeLeague.id);
        if (seasonId) delQuery = delQuery.eq('season_id', seasonId);
        await delQuery;
        cache.matches = [];
        await loadPlayers();
      }

      initFixtureSection();
      toast(deleteResults ? '🗑 Fixture y resultados borrados' : '🗑 Fixture borrado');
    };
  }
}

function renderFixtureRounds() {
  return cache.schedule.map((round, ri) => {
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
                <span class="text-sm text-white truncate flex-1 text-right cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewTeamProfile('${f.home}')">${homeName}</span>
                <span class="font-display text-lg text-lime-400 px-2">${hg} – ${ag}</span>
                <span class="text-sm text-white truncate flex-1 cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewTeamProfile('${f.away}')">${awayName}</span>
              </div>
              <button onclick="window._viewMatchDetail('${res.id}')" class="text-xs text-blue-400 hover:text-blue-300 ml-1 shrink-0">📊</button>
              <button onclick="window._showH2H('${f.home}','${f.away}')" class="text-xs text-purple-400 hover:text-purple-300 ml-1 shrink-0">⚔️</button>
            </div>`;
          } else {
            return `<div class="bg-pitch-800/40 border border-white/5 rounded-lg p-3 flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <span class="text-sm text-white truncate flex-1 text-right cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewTeamProfile('${f.home}')">${homeName}</span>
                <span class="font-display text-lg text-gray-600 px-2">vs</span>
                <span class="text-sm text-white truncate flex-1 cursor-pointer hover:text-lime-400 transition-colors" onclick="window._viewTeamProfile('${f.away}')">${awayName}</span>
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

  const homePlayers = cache.players.length
    ? cache.players.filter(p => p.team_id === homeId)
    : [];
  const awayPlayers = cache.players.length
    ? cache.players.filter(p => p.team_id === awayId)
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
        season_id: getSeasonId(),
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
        const player = cache.players.find(p => p.id === pid);
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

      cache.matches.push(data);
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
  const match = cache.matches.find(m => m.id === matchId);
  if (!match) return;

  const ps = match.player_stats || {};
  const homeName = tn(match.home_id);
  const awayName = tn(match.away_id);

  const renderPlayers = (teamId) => {
    const entries = Object.entries(ps).filter(([pid, st]) => {
      const p = cache.players.find(pl => pl.id === pid);
      return p && p.team_id === teamId;
    });

    if (!entries.length) return '<p class="text-gray-600 text-xs py-2">Sin stats individuales</p>';

    return entries.sort((a,b) => (b[1].rating||0) - (a[1].rating||0)).map(([pid, st]) => {
      const p = cache.players.find(pl => pl.id === pid);
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
  const isAdmin = state.activeLeague && state.activeLeague.admin_id === state.user?.id;
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
    ${isAdmin ? `
      <div class="flex gap-2 mt-4 pt-3 border-t border-white/5">
        <button onclick="window._editMatch('${match.id}')" class="flex-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 py-2 rounded-xl text-sm font-semibold hover:bg-blue-500/20 transition-all">✏️ Editar</button>
        <button onclick="window._deleteMatch('${match.id}')" class="bg-red-500/10 text-red-400 border border-red-500/20 py-2 px-4 rounded-xl text-sm font-semibold hover:bg-red-500/20 transition-all">🗑</button>
      </div>
    ` : ''}
  `;
  $('result-form').classList.remove('hidden');
};

// ─── Reverse player stats from a match ──────────────────────
async function reversePlayerStats(match) {
  const ps = match.player_stats || {};
  for (const [pid, st] of Object.entries(ps)) {
    const player = cache.players.find(p => p.id === pid);
    if (!player) continue;

    const newGoals = Math.max(0, (player.goals || 0) - (st.goals || 0));
    const newAssists = Math.max(0, (player.assists || 0) - (st.assists || 0));
    const newMP = Math.max(0, (player.matches_played || 0) - 1);

    // Remove the rating entry (remove first matching value)
    const newRatings = [...(player.ratings || [])];
    if (st.rating > 0) {
      const idx = newRatings.findIndex(r => Number(r) === Number(st.rating));
      if (idx !== -1) newRatings.splice(idx, 1);
    }

    const { error } = await supa.from('players').update({
      goals: newGoals, assists: newAssists, matches_played: newMP, ratings: newRatings,
    }).eq('id', pid);

    if (!error) {
      player.goals = newGoals;
      player.assists = newAssists;
      player.matches_played = newMP;
      player.ratings = newRatings;
    }
  }
}

// ─── Delete match ────────────────────────────────────────────
window._deleteMatch = async (matchId) => {
  if (isArchivedSeason()) { toast('📁 Temporada archivada — solo lectura', true); return; }
  const match = cache.matches.find(m => m.id === matchId);
  if (!match) return;
  if (!confirm(`¿Borrar ${tn(match.home_id)} ${match.home_goals}–${match.away_goals} ${tn(match.away_id)}? Se revierten todas las estadísticas. No se puede deshacer.`)) return;

  try {
    // Reverse player stats first
    await reversePlayerStats(match);

    // Delete the match
    const { error } = await supa.from('matches').delete().eq('id', matchId);
    if (error) throw error;

    // Remove from cache
    cache.matches = cache.matches.filter(m => m.id !== matchId);

    $('result-form').classList.add('hidden');
    $('fixture-rounds').innerHTML = renderFixtureRounds();
    toast('🗑 Partido eliminado');
  } catch(e) {
    toast('⚠️ ' + e.message, true);
  }
};

// ─── Edit match ──────────────────────────────────────────────
window._editMatch = (matchId) => {
  if (isArchivedSeason()) { toast('📁 Temporada archivada — solo lectura', true); return; }
  const match = cache.matches.find(m => m.id === matchId);
  if (!match) return;

  const homeId = match.home_id, awayId = match.away_id;
  const ps = match.player_stats || {};

  const homePlayers = cache.players.filter(p => p.team_id === homeId);
  const awayPlayers = cache.players.filter(p => p.team_id === awayId);

  const body = $('result-form-body');
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
      <input type="number" id="rf-hg" min="0" value="${match.home_goals}" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
      <span class="text-gray-500 text-lg text-center">–</span>
      <input type="number" id="rf-ag" min="0" value="${match.away_goals}" style="width:100%;box-sizing:border-box;" class="bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2.5 text-white text-center font-display text-2xl outline-none focus:border-lime-400/40">
    </div>

    ${(homePlayers.length || awayPlayers.length) ? `
      <button id="btn-toggle-pstats" class="w-full bg-pitch-900/40 border border-white/5 rounded-xl p-2 text-xs text-gray-500 hover:text-white transition-all mb-3 text-center">📋 Stats de jugadores ▲</button>
      <div id="rf-player-stats" class="mb-3 max-h-60 overflow-y-auto">
        ${homePlayers.length ? `<p class="text-[10px] text-lime-400 uppercase tracking-wider mb-1 font-semibold">${tn(homeId)}</p>` : ''}
        ${homePlayers.map((p, i) => {
          const st = ps[p.id] || {};
          return `<div class="flex items-center gap-1 py-1 border-b border-white/5 text-xs">
            <span class="text-gray-500 w-7 shrink-0">${p.pos || '?'}</span>
            <span class="text-white flex-1 truncate">${p.name}</span>
            <span class="text-gray-600">⚽</span><input type="number" id="rf-hpg-${i}" data-pid="${p.id}" data-team="home" min="0" value="${st.goals || 0}" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
            <span class="text-gray-600">🎯</span><input type="number" id="rf-hpa-${i}" min="0" value="${st.assists || 0}" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
            <span class="text-gray-600">⭐</span><input type="number" id="rf-hpr-${i}" min="0" max="10" step="0.1" value="${st.rating || 0}" class="w-11 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
          </div>`;
        }).join('')}
        ${awayPlayers.length ? `<p class="text-[10px] text-lime-400 uppercase tracking-wider mb-1 mt-2 font-semibold">${tn(awayId)}</p>` : ''}
        ${awayPlayers.map((p, i) => {
          const st = ps[p.id] || {};
          return `<div class="flex items-center gap-1 py-1 border-b border-white/5 text-xs">
            <span class="text-gray-500 w-7 shrink-0">${p.pos || '?'}</span>
            <span class="text-white flex-1 truncate">${p.name}</span>
            <span class="text-gray-600">⚽</span><input type="number" id="rf-apg-${i}" data-pid="${p.id}" data-team="away" min="0" value="${st.goals || 0}" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
            <span class="text-gray-600">🎯</span><input type="number" id="rf-apa-${i}" min="0" value="${st.assists || 0}" class="w-9 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
            <span class="text-gray-600">⭐</span><input type="number" id="rf-apr-${i}" min="0" max="10" step="0.1" value="${st.rating || 0}" class="w-11 bg-pitch-900/60 border border-white/10 rounded px-1 py-0.5 text-white text-center text-xs outline-none">
          </div>`;
        }).join('')}
      </div>
    ` : ''}

    <div class="flex gap-2">
      <button id="btn-save-edit" class="flex-1 bg-gradient-to-r from-lime-400 to-emerald-500 text-pitch-900 font-bold py-3 rounded-xl text-sm uppercase tracking-wider hover:from-lime-300 hover:to-emerald-400 transition-all shadow-lg shadow-lime-400/10 active:scale-[.98]">
        💾 Guardar Cambios
      </button>
    </div>
  `;

  // Toggle player stats
  const toggleBtn = $('btn-toggle-pstats');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      const el = $('rf-player-stats');
      if (el) { el.classList.toggle('hidden'); toggleBtn.textContent = el.classList.contains('hidden') ? '📋 Stats de jugadores ▼' : '📋 Stats de jugadores ▲'; }
    };
  }

  // Save handler
  $('btn-save-edit').onclick = async () => {
    const hg = parseInt($('rf-hg').value) || 0;
    const ag = parseInt($('rf-ag').value) || 0;

    // Collect new player stats
    const newPlayerStats = {};
    homePlayers.forEach((p, i) => {
      const goals = parseInt($(`rf-hpg-${i}`)?.value) || 0;
      const assists = parseInt($(`rf-hpa-${i}`)?.value) || 0;
      const rating = parseFloat($(`rf-hpr-${i}`)?.value) || 0;
      if (goals || assists || rating) {
        newPlayerStats[p.id] = { goals, assists, rating, position: p.pos || '', played: true };
      }
    });
    awayPlayers.forEach((p, i) => {
      const goals = parseInt($(`rf-apg-${i}`)?.value) || 0;
      const assists = parseInt($(`rf-apa-${i}`)?.value) || 0;
      const rating = parseFloat($(`rf-apr-${i}`)?.value) || 0;
      if (goals || assists || rating) {
        newPlayerStats[p.id] = { goals, assists, rating, position: p.pos || '', played: true };
      }
    });

    $('btn-save-edit').disabled = true;
    $('btn-save-edit').textContent = 'Guardando...';

    try {
      // 1. Reverse old stats
      await reversePlayerStats(match);

      // 2. Update match record
      const { error } = await supa.from('matches').update({
        home_goals: hg,
        away_goals: ag,
        player_stats: Object.keys(newPlayerStats).length ? newPlayerStats : null,
      }).eq('id', matchId);
      if (error) throw error;

      // 3. Apply new stats
      for (const [pid, st] of Object.entries(newPlayerStats)) {
        const player = cache.players.find(p => p.id === pid);
        if (!player) continue;
        const newRatings = [...(player.ratings || [])];
        if (st.rating > 0) newRatings.push(st.rating);
        await supa.from('players').update({
          goals: (player.goals || 0) + st.goals,
          assists: (player.assists || 0) + st.assists,
          matches_played: (player.matches_played || 0) + 1,
          ratings: newRatings,
        }).eq('id', pid);
        player.goals = (player.goals || 0) + st.goals;
        player.assists = (player.assists || 0) + st.assists;
        player.matches_played = (player.matches_played || 0) + 1;
        player.ratings = newRatings;
      }

      // 4. Update local cache
      const cacheMatch = cache.matches.find(m => m.id === matchId);
      if (cacheMatch) {
        cacheMatch.home_goals = hg;
        cacheMatch.away_goals = ag;
        cacheMatch.player_stats = newPlayerStats;
      }

      $('result-form').classList.add('hidden');
      $('fixture-rounds').innerHTML = renderFixtureRounds();
      toast(`✅ Partido actualizado`);
    } catch(e) {
      toast('⚠️ ' + e.message, true);
    }

    $('btn-save-edit').disabled = false;
    $('btn-save-edit').textContent = '💾 Guardar Cambios';
  };
};

// ═══════════════════════════════════════════════════════════════
// STANDINGS MODULE
// ═══════════════════════════════════════════════════════════════
function calculateStandings() {
  const standings = {};
  cache.teams.filter(t => !t.is_bye && !t.replaced).forEach(t => {
    standings[t.id] = { id: t.id, name: t.name, shield_url: t.shield_url, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0, form: [] };
  });

  cache.matches.forEach(m => {
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

  // Get tiebreaker config from league settings
  const tiebreakers = state.activeLeague?.settings?.tiebreakers || [
    { type: 'gd' }, { type: 'gf' }
  ];

  // H2H helper: compare two teams based on their direct matches
  function h2hCompare(a, b, mode) {
    const directMatches = cache.matches.filter(m =>
      (m.home_id === a.id && m.away_id === b.id) || (m.home_id === b.id && m.away_id === a.id)
    );
    if (!directMatches.length) return 0;

    if (mode === 'wins') {
      // Count W/L only
      let aWins = 0, bWins = 0;
      directMatches.forEach(m => {
        if (m.home_goals > m.away_goals) { if (m.home_id === a.id) aWins++; else bWins++; }
        else if (m.home_goals < m.away_goals) { if (m.away_id === a.id) aWins++; else bWins++; }
      });
      return bWins - aWins; // negative = a wins more (a goes higher)
    } else {
      // Aggregate: sum goals across all direct matches
      let aGoals = 0, bGoals = 0;
      directMatches.forEach(m => {
        if (m.home_id === a.id) { aGoals += m.home_goals; bGoals += m.away_goals; }
        else { bGoals += m.home_goals; aGoals += m.away_goals; }
      });
      const diff = (aGoals - bGoals) - (bGoals - aGoals);
      if (diff !== 0) return -diff; // negative = a is better
      return bGoals - aGoals; // more away goals = tiebreak (like UEFA)
    }
  }

  return Object.values(standings).sort((a, b) => {
    // Points always first
    if (b.Pts !== a.Pts) return b.Pts - a.Pts;

    // Apply configured tiebreakers in order
    for (const tb of tiebreakers) {
      let diff = 0;
      switch (tb.type) {
        case 'gd': diff = b.GD - a.GD; break;
        case 'gf': diff = b.GF - a.GF; break;
        case 'ga': diff = a.GA - b.GA; break; // fewer GA is better
        case 'wins': diff = b.W - a.W; break;
        case 'h2h': diff = h2hCompare(a, b, tb.mode || 'aggregate'); break;
      }
      if (diff !== 0) return diff;
    }
    return 0;
  });
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

  if (!cache.teams.length) await loadTeams();
  if (!cache.matches.length) await loadMatches();

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
          <p class="font-display text-2xl text-lime-400">${cache.matches.length}</p>
          <p class="text-xs text-gray-500 uppercase">Partidos</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${cache.matches.reduce((t,m) => t + m.home_goals + m.away_goals, 0)}</p>
          <p class="text-xs text-gray-500 uppercase">Goles</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${standings.length ? standings[0].name : '—'}</p>
          <p class="text-xs text-gray-500 uppercase">Líder</p>
        </div>
        <div class="bg-pitch-800/60 border border-white/5 rounded-xl p-4 text-center">
          <p class="font-display text-2xl text-white">${cache.matches.length ? (cache.matches.reduce((t,m) => t + m.home_goals + m.away_goals, 0) / cache.matches.length).toFixed(1) : '0'}</p>
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

window._showH2H = async (teamAId, teamBId) => {
  if (!teamAId || !teamBId || teamAId === teamBId) return;
  if (!cache.matches.length) await loadMatches();

  const nameA = tn(teamAId), nameB = tn(teamBId);
  let wA = 0, wB = 0, draws = 0, gfA = 0, gfB = 0;
  const h2hMatches = [];

  cache.matches.forEach(m => {
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

async function initHistorySection() {
  const container = document.querySelector('[data-section="standings"]');
  if (!container) return;

  // History is shown as a sub-tab within standings
  // Already handled by standings section — matches are clickable via fixture
}

// Standalone match history accessible from fixture
window._showMatchHistory = async () => {
  if (!cache.matches.length) await loadMatches();
  if (!cache.teams.length) await loadTeams();

  const body = $('result-form-body');
  body.innerHTML = `
    <h3 class="font-display text-lg text-white mb-4">🕹 Historial Completo</h3>
    <div class="mb-3">
      <select id="mh-filter" onchange="window._filterMatchHistory()" class="w-full bg-pitch-900/60 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none">
        <option value="all">Todos los equipos</option>
        ${cache.teams.filter(t => !t.is_bye && !t.replaced).map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
      </select>
    </div>
    <div id="mh-list" class="max-h-[60vh] overflow-y-auto space-y-1">
      ${renderMatchHistoryItems('all')}
    </div>
  `;
  $('result-form').classList.remove('hidden');
};

function renderMatchHistoryItems(filterTeamId) {
  let matches = [...cache.matches].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
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


export { initFixtureSection, initStandingsSection, calculateStandings, generateCalendar, initHistorySection };
