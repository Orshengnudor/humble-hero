import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://nwxkeswqiorspldaqycl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

// ─── Realtime ─────────────────────────────────────────────────────────────────

export const subscribeToMatch = (matchId, onUpdate) => {
  // Unique channel name prevents stale subscriptions
  return supabase
    .channel(`match-${matchId}-${Date.now()}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'match_players',
      filter: `match_id=eq.${matchId}`,
    }, onUpdate)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'matches',
      filter: `id=eq.${matchId}`,
    }, onUpdate)
    .subscribe();
};

export const subscribeToLobby = (onUpdate) => {
  return supabase
    .channel(`lobby-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onUpdate)
    .subscribe();
};

// ─── Match Operations ─────────────────────────────────────────────────────────

export const createMatch = async (walletAddress, entryEth, maxPlayers, tier, matchIdOverride) => {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      id:              matchIdOverride,
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

  await supabase.from('match_players').insert({
    match_id: data.id, wallet_address: walletAddress, score: 0, status: 'joined',
  });
  return data;
};

export const joinMatch = async (matchId, walletAddress) => {
  const { data: existing } = await supabase
    .from('match_players').select('id')
    .eq('match_id', matchId).eq('wallet_address', walletAddress).maybeSingle();
  if (existing) return existing;

  const { data: match } = await supabase
    .from('matches').select('entry_fee, prize_pool, current_players, max_players')
    .eq('id', matchId).single();
  if (!match) throw new Error('Match not found');
  if (match.current_players >= match.max_players) throw new Error('Match is full');

  const { data, error } = await supabase
    .from('match_players')
    .insert({ match_id: matchId, wallet_address: walletAddress, score: 0, status: 'joined' })
    .select().single();
  if (error) throw error;

  const newCount = match.current_players + 1;
  const newPrize = (parseFloat(match.prize_pool) + parseFloat(match.entry_fee)).toFixed(6);
  const updates  = { prize_pool: newPrize, current_players: newCount };
  if (newCount >= match.max_players) updates.status = 'starting';
  await supabase.from('matches').update(updates).eq('id', matchId);
  return data;
};

export const getOpenMatches = async () => {
  const { data, error } = await supabase
    .from('matches').select('*, match_players(*)')
    .eq('status', 'waiting').order('created_at', { ascending: false });
  if (error) { console.error('getOpenMatches error:', error); return []; }
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  return (data || []).filter(m => Date.now() - new Date(m.created_at).getTime() < TWO_HOURS);
};

export const getMyActiveMatch = async (walletAddress) => {
  const { data } = await supabase
    .from('match_players').select('match_id').eq('wallet_address', walletAddress);
  if (!data?.length) return null;
  const ids = data.map(r => r.match_id);
  const { data: matches } = await supabase
    .from('matches').select('*').in('id', ids)
    .in('status', ['waiting', 'starting', 'in_progress'])
    .order('created_at', { ascending: false }).limit(1);
  return matches?.[0] || null;
};

export const cancelMatch = async (matchId) => {
  await supabase.from('matches')
    .update({ status: 'cancelled', prize_claimed: true }).eq('id', matchId);
};

// Writes game_start_time 4 seconds ahead — all players calculate delay from this
export const startMatch = async (matchId) => {
  const gameStartTime = new Date(Date.now() + 4000).toISOString();
  const { error } = await supabase.from('matches').update({
    status:          'in_progress',
    started_at:      new Date().toISOString(),
    game_start_time: gameStartTime,
  }).eq('id', matchId);
  if (error) throw error;
  console.log('[supabase] startMatch wrote game_start_time:', gameStartTime);
  return gameStartTime;
};

export const getMatchPlayers = async (matchId) => {
  const { data, error } = await supabase
    .from('match_players').select('*').eq('match_id', matchId)
    .order('score', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const updatePlayerScore = async (matchId, walletAddress, score, reactionTime) => {
  await supabase.from('match_players')
    .update({ score, avg_reaction_time: reactionTime, status: 'playing' })
    .eq('match_id', matchId).eq('wallet_address', walletAddress);
};

export const finishMatch = async (matchId, winnerWallet) => {
  const { error } = await supabase.from('matches').update({
    status: 'finished', winner_wallet: winnerWallet, finished_at: new Date().toISOString(),
  }).eq('id', matchId);
  if (error) throw error;
};

export const getClaimableWins = async (walletAddress) => {
  const { data, error } = await supabase.from('matches').select('*')
    .eq('winner_wallet', walletAddress).eq('status', 'finished').eq('prize_claimed', false)
    .order('finished_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const markPrizeClaimed = async (matchId, txId) => {
  await supabase.from('matches')
    .update({ prize_claimed: true, claim_tx: txId }).eq('id', matchId);
};

export const awardPoints = async (walletAddress, points, won) => {
  const pts = won ? points * 2 : points;
  const { data: ex } = await supabase.from('leaderboard').select('*')
    .eq('wallet_address', walletAddress).maybeSingle();
  if (ex) {
    await supabase.from('leaderboard').update({
      total_games:   ex.total_games + 1,
      total_wins:    won ? ex.total_wins + 1 : ex.total_wins,
      total_score:   ex.total_score + (won ? 1 : 0),
      total_points:  (ex.total_points || 0) + pts,
      total_eth_won: ex.total_eth_won || '0',
    }).eq('wallet_address', walletAddress);
  } else {
    await supabase.from('leaderboard').insert({
      wallet_address: walletAddress, total_games: 1,
      total_wins: won ? 1 : 0, total_score: won ? 1 : 0,
      total_points: pts, total_eth_won: '0',
    });
  }
};

export const updateLeaderboard = async (walletAddress, won, score, tierPoints = 1000) => {
  await awardPoints(walletAddress, tierPoints, won);
};

export const recordEthWin = async (walletAddress, ethAmount) => {
  const { data: ex } = await supabase.from('leaderboard')
    .select('total_eth_won').eq('wallet_address', walletAddress).maybeSingle();
  if (ex) {
    await supabase.from('leaderboard').update({
      total_eth_won: (parseFloat(ex.total_eth_won || 0) + parseFloat(ethAmount)).toFixed(6),
    }).eq('wallet_address', walletAddress);
  } else {
    await supabase.from('leaderboard').insert({
      wallet_address: walletAddress, total_games: 1, total_wins: 0,
      total_score: 0, total_points: 0, total_eth_won: parseFloat(ethAmount).toFixed(6),
    });
  }
};

export const getLeaderboard = async () => {
  const { data, error } = await supabase.from('leaderboard').select('*')
    .order('total_points', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
};