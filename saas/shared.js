// ═══════════════════════════════════════════════════════════════
// shared.js — Shared utilities, caches, and data loaders
// ═══════════════════════════════════════════════════════════════
import { supa, state } from './auth.js';

// ─── DOM helpers ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('[data-screen]').forEach(el => el.classList.add('hidden'));
  const t = $(`screen-${id}`); if (t) t.classList.remove('hidden');
}

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

// ─── Plan limits ─────────────────────────────────────────────
function getPlanLimits(planType) {
  const plans = {
    amateur:    { maxTeams: 12, maxPlayers: 15, hasAds: true,  hasScan: false },
    pro:        { maxTeams: 18, maxPlayers: 20, hasAds: false, hasScan: true  },
    elite:      { maxTeams: 999, maxPlayers: 999, hasAds: false, hasScan: true },
    superadmin: { maxTeams: 999, maxPlayers: 999, hasAds: false, hasScan: true },
  };
  return plans[planType] || plans.amateur;
}

// ─── Shared caches (mutable, shared across modules) ──────────
const cache = {
  teams: [],
  players: [],
  matches: [],
  schedule: [],
  seasons: [],
  activeTeamId: null,
};

// ─── Season helpers ──────────────────────────────────────────
function getSeasonId() {
  return state.activeLeague?.active_season_id || null;
}

async function loadSeasons() {
  const { data, error } = await supa.from('seasons').select('*')
    .eq('league_id', state.activeLeague.id)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  cache.seasons = data || [];
  return cache.seasons;
}

// ─── Data loaders ────────────────────────────────────────────
async function loadTeams() {
  const seasonId = getSeasonId();
  let query = supa.from('teams').select('*')
    .eq('league_id', state.activeLeague.id)
    .eq('replaced', false)
    .order('created_at');
  if (seasonId) query = query.or('season_id.eq.' + seasonId + ',season_id.is.null');
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  cache.teams = data || [];
  return cache.teams;
}

async function loadPlayers(teamId) {
  const seasonId = getSeasonId();
  let query = supa.from('players').select('*').eq('league_id', state.activeLeague.id);
  if (seasonId) query = query.or('season_id.eq.' + seasonId + ',season_id.is.null');
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query.order('goals', { ascending: false });
  if (error) { console.error(error); return []; }
  cache.players = data || [];
  return cache.players;
}

async function loadMatches() {
  const seasonId = getSeasonId();
  let query = supa.from('matches').select('*')
    .eq('league_id', state.activeLeague.id)
    .order('round');
  if (seasonId) query = query.or('season_id.eq.' + seasonId + ',season_id.is.null');
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  cache.matches = data || [];
  return cache.matches;
}

// Team name by ID
function tn(teamId) {
  return cache.teams.find(t => t.id === teamId)?.name || '?';
}

// ─── Rating chart SVG builder ────────────────────────────────
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

export {
  $, showScreen, showLoading, toast, getPlanLimits,
  cache, getSeasonId, loadSeasons, loadTeams, loadPlayers, loadMatches, tn,
  buildRatingChart,
};
