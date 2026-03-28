import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nwxkeswqiorspldaqycl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53eGtlc3dxaW9yc3BsZGFxeWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzQxMDQsImV4cCI6MjA5MDIxMDEwNH0.d3jSYo1_kTv302iimrBW8U_qrAHjCGC07ps0xxyOE-I';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Realtime
export const subscribeToMatch = (matchId, onUpdate) => {
  return supabase
    .channel(`match:${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'match_players', filter: `match_id=eq.${matchId}` }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, onUpdate)
    .subscribe();
};

export const subscribeToLobby = (onUpdate) => {
  return supabase
    .channel('lobby')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: 'status=eq.waiting' }, onUpdate)
    .subscribe();
};

// Match operations
export const createMatch = async (walletAddress, entrySol, maxPlayers, tier) => {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      host_wallet: walletAddress,
      entry_fee: entrySol,
      max_players: maxPlayers,
      prize_pool: entrySol,
      current_players: 1,
      tier: tier,
      status: 'waiting',
    })
    .select()
    .single();

  if (error) throw error;
  await joinMatch(data.id, walletAddress);
  return data;
};

export const joinMatch = async (matchId, walletAddress) => {
  // Check if already joined
  const { data: existing } = await supabase
    .from('match_players')
    .select('id')
    .eq('match_id', matchId)
    .eq('wallet_address', walletAddress)
    .single();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('match_players')
    .insert({ match_id: matchId, wallet_address: walletAddress, score: 0, status: 'joined' })
    .select()
    .single();

  if (error) throw error;

  // Update match player count & prize pool
  const { data: match } = await supabase
    .from('matches')
    .select('entry_fee, prize_pool, current_players, max_players')
    .eq('id', matchId)
    .single();

  if (match) {
    const newCount = match.current_players + 1;
    const updates = {
      prize_pool: match.prize_pool + match.entry_fee,
      current_players: newCount,
    };
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
    .update({ status: 'finished', winner_wallet: winnerWallet, finished_at: new Date().toISOString() })
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

export const getLeaderboard = async () => {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('total_wins', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};

export const updateLeaderboard = async (walletAddress, won, score) => {
  const { data: existing } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (existing) {
    await supabase
      .from('leaderboard')
      .update({
        total_games: existing.total_games + 1,
        total_wins: won ? existing.total_wins + 1 : existing.total_wins,
        total_score: existing.total_score + score,
        total_earnings: won ? existing.total_earnings + score : existing.total_earnings,
      })
      .eq('wallet_address', walletAddress);
  } else {
    await supabase
      .from('leaderboard')
      .insert({
        wallet_address: walletAddress,
        total_games: 1,
        total_wins: won ? 1 : 0,
        total_score: score,
        total_earnings: 0,
      });
  }
};

// Get claimable wins for a wallet
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

// Mark prize as claimed
export const markPrizeClaimed = async (matchId, txId) => {
  const { error } = await supabase
    .from('matches')
    .update({ prize_claimed: true, claim_tx: txId })
    .eq('id', matchId);

  if (error) throw error;
};
