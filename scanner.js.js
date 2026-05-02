// ═══════════════════════════════════════════════════════════════
// scanner.js — AI Scanner Module (position-aware, multi-league)
// ═══════════════════════════════════════════════════════════════
import { supa, state } from './auth.js';

// ─── AI Prompt — position extraction is MANDATORY ────────────
function buildPrompt(players) {
  const registeredNames = players.map(p => p.name).join(', ') || 'none';

  return `You are analyzing screenshots from an EA FC Pro Clubs match. Extract data from these images:

1. SCORE screen: team names and final score.
2. JUGADORES screen: list of real gamertags per team (ignore CPU bots).
3. STATS screen(s): player performance table with POS, Nombre, CR (rating), G (goals), AST (assists).

RULES:
- Copy all gamertag names exactly (preserve case, numbers, underscores, special chars).
- Match stats players to gamertags by fuzzy name matching. Unmatched = CPU bot, IGNORE.
- MANDATORY: Read the EXACT abbreviation from the POS column for each player. Common values:
  Spanish: POR, DFC, LI, LD, CAI, CAD, MCD, MC, MCO, MI, MD, EI, ED, DC, MP, SDI, SDD
  English: GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, CF, ST
  If position is not readable, return "N/A" — NEVER omit the field, NEVER default to "MID".

REGISTERED PLAYERS: [${registeredNames}]

Return ONLY this JSON (no markdown, no backticks):
{
  "score": {"home": "TeamName", "away": "TeamName", "homeGoals": 0, "awayGoals": 0},
  "homeIds": ["gamertag1", "gamertag2"],
  "awayIds": ["gamertag1", "gamertag2"],
  "stats": [
    {"name": "gamertag", "team": "home", "goals": 0, "assists": 0, "rating": 0.0, "position": "DFC"}
  ]
}`;
}

// ─── Call AI (Anthropic Claude) ──────────────────────────────
async function callAI(images, players, apiKey) {
  const content = [];

  // Add images
  for (const img of images) {
    if (!img) continue;
    const base64 = img.replace(/^data:image\/\w+;base64,/, '');
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
    });
  }

  content.push({ type: 'text', text: buildPrompt(players) });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  return JSON.parse(text);
}

// ─── Process scan result → match players with registered ones ─
function processResult(scanResult, players) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const matched = [];
  for (const sp of (scanResult.stats || [])) {
    // Find matching registered player
    const spNorm = norm(sp.name);
    const player = players.find(p => {
      const pNorm = norm(p.name);
      return pNorm === spNorm || pNorm.includes(spNorm) || spNorm.includes(pNorm);
    });

    matched.push({
      name: sp.name,
      team: sp.team,
      goals: sp.goals || 0,
      assists: sp.assists || 0,
      rating: sp.rating || 0,
      position: (sp.position || 'N/A').toUpperCase(),
      registered: !!player,
      playerId: player?.id || null,
      playerName: player?.name || sp.name,
    });
  }

  return {
    score: scanResult.score,
    homeIds: scanResult.homeIds || [],
    awayIds: scanResult.awayIds || [],
    players: matched.filter(p => p.registered),
    unregistered: matched.filter(p => !p.registered).map(p => p.name),
  };
}

// ─── Save submission to Supabase (with images for audit) ─────
async function saveSubmission(scanResult, images, teamCode, teamName) {
  const { data, error } = await supa
    .from('submissions')
    .insert({
      league_id: state.league.id,
      team_code: teamCode,
      team_name: teamName,
      scan_result: scanResult,
      images: images.map((img, i) => ({ index: i, size: img?.length || 0 })), // metadata only, not raw base64
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Save match stats with upsert ────────────────────────────
async function saveMatchStats(homeId, awayId, homeGoals, awayGoals, playerStats, round, date) {
  const leagueId = state.league.id;

  // Build player_stats JSONB with positions
  const ps = {};
  for (const [pid, st] of Object.entries(playerStats)) {
    ps[pid] = {
      goals: st.goals || 0,
      assists: st.assists || 0,
      rating: st.rating || 0,
      position: (st.position || 'N/A').toUpperCase(),
      played: true,
      cs: st.cs || false,
    };
  }

  // Upsert: if match between same teams in same round exists, update it
  const { data: existing } = await supa
    .from('matches')
    .select('id')
    .eq('league_id', leagueId)
    .eq('home_id', homeId)
    .eq('away_id', awayId)
    .eq('round', round)
    .maybeSingle();

  if (existing) {
    // Update existing match
    const { error } = await supa
      .from('matches')
      .update({
        home_goals: homeGoals,
        away_goals: awayGoals,
        player_stats: ps,
        date: date,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return existing.id;
  } else {
    // Insert new match
    const { data, error } = await supa
      .from('matches')
      .insert({
        league_id: leagueId,
        home_id: homeId,
        away_id: awayId,
        home_goals: homeGoals,
        away_goals: awayGoals,
        round: round,
        date: date,
        player_stats: ps,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }
}

// ─── Update player aggregate stats after match ───────────────
async function updatePlayerStats(playerStats) {
  for (const [playerId, st] of Object.entries(playerStats)) {
    if (!st.played) continue;

    // Fetch current player
    const { data: player, error: fetchErr } = await supa
      .from('players')
      .select('goals, assists, cs, matches_played, ratings')
      .eq('id', playerId)
      .single();

    if (fetchErr || !player) continue;

    const newRatings = [...(player.ratings || [])];
    if (st.rating > 0) newRatings.push(st.rating);

    const { error: updateErr } = await supa
      .from('players')
      .update({
        goals: (player.goals || 0) + (st.goals || 0),
        assists: (player.assists || 0) + (st.assists || 0),
        cs: (player.cs || 0) + (st.cs ? 1 : 0),
        matches_played: (player.matches_played || 0) + 1,
        ratings: newRatings,
      })
      .eq('id', playerId);

    if (updateErr) console.error(`Failed to update player ${playerId}:`, updateErr);
  }
}

// ─── Approve a submission ────────────────────────────────────
async function approveSubmission(submissionId) {
  const { error } = await supa
    .from('submissions')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: state.user.id,
    })
    .eq('id', submissionId);
  if (error) throw error;
}

async function rejectSubmission(submissionId) {
  const { error } = await supa
    .from('submissions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: state.user.id,
    })
    .eq('id', submissionId);
  if (error) throw error;
}

// ─── Position Helpers ────────────────────────────────────────
function posToES(pos) {
  if (!pos || pos === 'N/A') return '?';
  const p = pos.toUpperCase().trim();
  const map = {
    'GK':'POR','POR':'POR','PO':'POR',
    'CB':'DFC','DFC':'DFC','LB':'LI','LI':'LI','RB':'LD','LD':'LD',
    'LWB':'CAI','CAI':'CAI','RWB':'CAD','CAD':'CAD',
    'CDM':'MCD','MCD':'MCD','CM':'MC','MC':'MC',
    'CAM':'MCO','MCO':'MCO','LM':'MI','MI':'MI','RM':'MD','MD':'MD',
    'LW':'EI','EI':'EI','RW':'ED','ED':'ED',
    'ST':'DC','DC':'DC','CF':'SD','SDI':'SDI','SDD':'SDD','MP':'MP',
  };
  return map[p] || p;
}

function posToZone(pos) {
  const p = (pos || '').toUpperCase();
  if (['GK','POR','PO'].includes(p)) return 'GK';
  if (['DEF','DF','DFC','LI','LD','CAI','CAD','CB','LB','RB','LWB','RWB'].includes(p)) return 'DEF';
  if (['MCD','MC','MCO','MI','MD','CDM','CM','CAM','LM','RM','MID'].includes(p)) return 'MID';
  if (['EI','ED','SDI','SDD','DC','MP','LW','RW','CF','ST','FWD'].includes(p)) return 'FWD';
  return 'MID';
}

export {
  callAI, processResult, saveSubmission, saveMatchStats,
  updatePlayerStats, approveSubmission, rejectSubmission,
  posToES, posToZone, buildPrompt
};
