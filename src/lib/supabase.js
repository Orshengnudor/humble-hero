import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://nwxkeswqiorspldaqycl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ─── Realtime ─────────────────────────────────────────────────────────────────

export const subscribeToMatch = (matchId, onUpdate) => {
  return supabase
    .channel(`match:${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${matchId}` }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, onUpdate)
    .subscribe();
};

export const subscribeToLobby = (onUpdate) => {
  return supabase
    .channel(`lobby:${Date.now()}`) // unique channel name prevents stale subscription
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'matches',
    }, onUpdate)
    .subscribe((status) => {
      console.log('Lobby subscription status:', status);
    });
};

// ─── Match Operations ─────────────────────────────────────────────────────────

export const createMatch = async (walletAddress, entryEth, maxPlayers, tier) => {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      host_wallet:     walletAddress,
      entry_fee:       entryEth,
      max_players:     maxPlayers,
      prize_pool:      entryEth,
      current_players: 1,
      tier:            tier,
      status:          'waiting',
    })
    .select()
    .single();

  if (error) throw error;
  await joinMatch(data.id, walletAddress);
  return data;
};

export const joinMatch = async (matchId, walletAddress) => {
  const { data: existing } = await supabase
    .from('match_players')
    .select('id')
    .eq('match_id', matchId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('match_players')
    .insert({ match_id: matchId, wallet_address: walletAddress, score: 0, status: 'joined' })
    .select()
    .single();

  if (error) throw error;

  const { data: match } = await supabase
    .from('matches')
    .select('entry_fee, prize_pool, current_players, max_players')
    .eq('id', matchId)
    .single();

  if (match) {
    const newCount = (match.current_players || 1) + 1;
    const newPrize = (parseFloat(match.prize_pool) + parseFloat(match.entry_fee)).toFixed(6);
    const updates  = { prize_pool: newPrize, current_players: newCount };
    if (newCount >= match.max_players) updates.status = 'starting';
    await supabase.from('matches').update(updates).eq('id', matchId);
  }

  return data;
};

// ─── KEY FIX: getOpenMatches now excludes abandoned/cancelled matches ──────────
export const getOpenMatches = async () => {
  // Auto-cancel matches that are stuck waiting for more than 2 hours
  // This runs silently in the background
  autoCleanupStuckMatches();

  const { data, error } = await supabase
    .from('matches')
    .select('*, match_players(*)')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('getOpenMatches error:', error);
    return [];
  }

  // Filter out matches that have been waiting too long with no activity
  // (These are likely cancelled without tx approval)
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now       = Date.now();

  return (data || []).filter(match => {
    const age = now - new Date(match.created_at).getTime();
    // Keep if: less than 2 hours old OR has more than 1 player (someone actually joined)
    return age < TWO_HOURS || (match.current_players || 1) > 1;
  });
};

// Auto-cleanup: marks old stuck matches as cancelled in the background
const autoCleanupStuckMatches = async () => {
  try {
    await supabase
      .from('matches')
      .update({ status: 'cancelled' })
      .eq('status', 'waiting')
      .eq('current_players', 1)
      .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
  } catch (_) {
    // Silent fail — this is a background cleanup
  }
};

export const getMatchPlayers = async (matchId) => {
  const { data, error } = await supabase
    .from('match_players')
    .select('*')
    .eq('match_id', matchId)
    .order('score', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const updatePlayerScore = async (matchId, walletAddress, score, reactionTime) => {
  const { error } = await supabase
    .from('match_players')
    .update({ score, avg_reaction_time: reactionTime, status: 'playing' })
    .eq('match_id', matchId)
    .eq('wallet_address', walletAddress);

  if (error) throw error;
};

export const finishMatch = async (matchId, winnerWallet) => {
  const { error } = await supabase
    .from('matches')
    .update({
      status:        'finished',
      winner_wallet: winnerWallet,
      finished_at:   new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) throw error;
};

export const startMatch = async (matchId) => {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', matchId);

  if (error) throw error;
};

export const getClaimableWins = async (walletAddress) => {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('winner_wallet', walletAddress)
    .eq('status', 'finished')
    .eq('prize_claimed', false)
    .order('finished_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const markPrizeClaimed = async (matchId, txId) => {
  const { error } = await supabase
    .from('matches')
    .update({ prize_claimed: true, claim_tx: txId })
    .eq('id', matchId);

  if (error) throw error;
};

// ─── Points & Leaderboard ─────────────────────────────────────────────────────

export const awardPoints = async (walletAddress, points, won) => {
  const pointsToAward = won ? points * 2 : points;

  const { data: existing } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('leaderboard')
      .update({
        total_games:   existing.total_games + 1,
        total_wins:    won ? existing.total_wins + 1 : existing.total_wins,
        total_score:   existing.total_score + (won ? 1 : 0),
        total_points:  (existing.total_points || 0) + pointsToAward,
        total_eth_won: existing.total_eth_won || '0',
      })
      .eq('wallet_address', walletAddress);
  } else {
    await supabase
      .from('leaderboard')
      .insert({
        wallet_address: walletAddress,
        total_games:    1,
        total_wins:     won ? 1 : 0,
        total_score:    won ? 1 : 0,
        total_points:   pointsToAward,
        total_eth_won:  '0',
      });
  }
};

export const updateLeaderboard = async (walletAddress, won, score, tierPoints = 1000) => {
  await awardPoints(walletAddress, tierPoints, won);
};

export const recordEthWin = async (walletAddress, ethAmount) => {
  const { data: existing } = await supabase
    .from('leaderboard')
    .select('total_eth_won')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing) {
    const newTotal = (parseFloat(existing.total_eth_won || 0) + parseFloat(ethAmount)).toFixed(6);
    await supabase
      .from('leaderboard')
      .update({ total_eth_won: newTotal })
      .eq('wallet_address', walletAddress);
  } else {
    await supabase
      .from('leaderboard')
      .insert({
        wallet_address: walletAddress,
        total_games:    1,
        total_wins:     0,
        total_score:    0,
        total_points:   0,
        total_eth_won:  parseFloat(ethAmount).toFixed(6),
      });
  }
};

export const getLeaderboard = async () => {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('total_points', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};