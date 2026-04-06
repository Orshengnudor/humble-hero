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
  let retryCount = 0;
  const maxRetries = 5;
  
  const createSubscription = () => {
    const channel = supabase
      .channel('lobby', {
        config: {
          broadcast: { ack: true },
          presence: { key: 'lobby' },
        },
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matches',
      }, (payload) => {
        console.log('Lobby realtime update:', payload);
        onUpdate(payload);
      })
      .subscribe((status) => {
        console.log('Lobby subscription status:', status);
        
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          console.log('Subscription failed, retrying...');
          setTimeout(() => {
            if (retryCount < maxRetries) {
              retryCount++;
              createSubscription();
            }
          }, 2000);
        } else if (status === 'SUBSCRIBED') {
          retryCount = 0;
        }
      });
    
    return channel;
  };
  
  return createSubscription();
};

// ─── Match Operations ─────────────────────────────────────────────────────────

// FIXED: createMatch no longer auto-joins the host
export const createMatch = async (walletAddress, entryEth, maxPlayers, tier, matchIdOverride) => {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      id:              matchIdOverride,
      host_wallet:     walletAddress,
      entry_fee:       entryEth,
      max_players:     maxPlayers,
      prize_pool:      entryEth,
      current_players: 1,  // Start with 1 (the host)
      tier:            tier,
      status:          'waiting',
      created_at:      new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  
  // Add host as a player without incrementing current_players again
  await addHostAsPlayer(data.id, walletAddress);
  
  return data;
};

// NEW: Add host as player without incrementing count
const addHostAsPlayer = async (matchId, walletAddress) => {
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
  return data;
};

// FIXED: joinMatch correctly increments current_players
export const joinMatch = async (matchId, walletAddress) => {
  // Check if already joined
  const { data: existing } = await supabase
    .from('match_players')
    .select('id')
    .eq('match_id', matchId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (existing) return existing;

  // First, get current match state
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('entry_fee, prize_pool, current_players, max_players')
    .eq('id', matchId)
    .single();

  if (matchError) throw matchError;

  // Check if match is full
  if (match.current_players >= match.max_players) {
    throw new Error('Match is already full');
  }

  // Add the player
  const { data, error } = await supabase
    .from('match_players')
    .insert({ match_id: matchId, wallet_address: walletAddress, score: 0, status: 'joined' })
    .select()
    .single();

  if (error) throw error;

  // Update match with new player count and prize pool
  const newCount = match.current_players + 1;
  const newPrize = (parseFloat(match.prize_pool) + parseFloat(match.entry_fee)).toFixed(6);
  const updates = { 
    prize_pool: newPrize, 
    current_players: newCount 
  };
  
  if (newCount >= match.max_players) {
    updates.status = 'starting';
  }
  
  await supabase.from('matches').update(updates).eq('id', matchId);

  return data;
};

export const getOpenMatches = async () => {
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*, match_players(*)')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('getOpenMatches error:', error);
      return [];
    }

    // Filter out matches older than 2 hours (stale)
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const now = Date.now();
    
    const activeMatches = (data || []).filter(match => {
      const age = now - new Date(match.created_at).getTime();
      return age < TWO_HOURS;
    });
    
    console.log('Open matches found:', activeMatches.length);
    return activeMatches;
  } catch (err) {
    console.error('getOpenMatches exception:', err);
    return [];
  }
};

export const cancelMatch = async (matchId) => {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('id', matchId);
    
  if (error) throw error;
  return true;
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