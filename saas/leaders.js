// ═══════════════════════════════════════════════════════════════
// leaders.js — Leaders table, player profiles, player comparison
// ═══════════════════════════════════════════════════════════════
import { supa, state } from './auth.js';
import { $, showLoading, toast, cache, loadTeams, loadPlayers, tn, buildRatingChart } from './shared.js';
import { posToES, posToZone } from './scanner.js';

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

  if (!cache.teams.length) await loadTeams();
  if (!cache.players.length) await loadPlayers();

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
  const sorted = [...cache.players].sort((a, b) => {
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

window._viewPlayerProfile = async (playerId) => {
  const player = cache.players.find(p => p.id === playerId);
  if (!player) { await loadPlayers(); }
  const p = cache.players.find(pl => pl.id === playerId);
  if (!p) { toast('Jugador no encontrado', true); return; }

  if (!cache.matches.length) await loadMatches();

  // Aggregate position stats from matches
  const posStats = {};
  let matchHistory = [];
  cache.matches.forEach(m => {
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

window._comparePlayersUI = async () => {
  if (!cache.players.length) await loadPlayers();

  const opts = cache.players.map(p => `<option value="${p.id}">${p.name} (${tn(p.team_id)})</option>`).join('');
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
  const a = cache.players.find(p => p.id === aId), b = cache.players.find(p => p.id === bId);
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


export { initLeadersSection };
