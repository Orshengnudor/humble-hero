import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL     || 'https://nwxkeswqiorspldaqycl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Realtime ─────────────────────────────────────────────────────────────────

export const subscribeToMatch = (matchId, onUpdate) => {
  return supabase
    .channel(`match:${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${matchId}` }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches',       filter: `id=eq.${matchId}`       }, onUpdate)
    .subscribe();
};

export const subscribeToLobby = (onUpdate) => {
  return supabase
    .channel('lobby')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'status=eq.waiting' }, onUpdate)
    .subscribe();
};

// ─── Match Operations ─────────────────────────────────────────────────────────

export const createMatch = async (walletAddress, entryEth, maxPlayers, tier) => {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      host_wallet:    walletAddress,
      entry_fee:      entryEth,      // stored as ETH string e.g. "0.0002"
      max_players:    maxPlayers,
      prize_pool:     entryEth,
      current_players: 1,
      tier:           tier,
      status:         'waiting',
    })
    .select()
    .single();

  if (error) throw error;

  // Auto-join host
  await joinMatch(data.id, walletAddress);
  return data;
};

export const joinMatch = async (matchId, walletAddress) => {
  // Prevent duplicate joins
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

  // Update prize pool and player count
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

export const getOpenMatches = async () => {
  const { data, error } = await supabase
    .from('matches')
    .select('*, match_players(*)')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
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
  const pointsToAward = won ? points * 2 : points; // winners get 2x

  const { data: existing } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('leaderboard')
      .update({
        total_games:  existing.total_games + 1,
        total_wins:   won ? existing.total_wins + 1 : existing.total_wins,
        total_score:  existing.total_score + (won ? 1 : 0),
        total_points: (existing.total_points || 0) + pointsToAward,
        total_eth_won: won
          ? (parseFloat(existing.total_eth_won || 0) + 0).toFixed(6) // updated on claim
          : existing.total_eth_won,
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