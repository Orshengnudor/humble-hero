import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { getOpenMatches, createMatch, joinMatch, subscribeToLobby, supabase } from '../lib/supabase';
import {
  formatWallet, getEthBalance, validateEntryBalance,
  createMatchOnChain, joinMatchOnChain, ENTRY_TIERS, getTierByKey, PLAYER_OPTIONS,
} from '../lib/blockchain';
import { Users, Zap, Plus, ArrowRight, Shield, Wallet, AlertCircle, Star, RefreshCw, XCircle } from 'lucide-react';

export default function Lobby({ onJoinMatch }) {
  const { address, isConnected } = useAccount();
  const { data: walletClient }   = useWalletClient();

  const [matches,      setMatches]      = useState([]);
  const [creating,     setCreating]     = useState(false);
  const [joining,      setJoining]      = useState(null);
  const [cancelling,   setCancelling]   = useState(null);
  const [maxPlayers,   setMaxPlayers]   = useState(2);
  const [selectedTier, setSelectedTier] = useState('bronze');
  const [ethBalance,   setEthBalance]   = useState(0);
  const [error,        setError]        = useState('');
  const [txStatus,     setTxStatus]     = useState('');
  const [refreshing,   setRefreshing]   = useState(false);

  const pollRef = useRef(null);
  const currentTier = getTierByKey(selectedTier);

  const loadMatches = useCallback(async () => {
    try {
      const data = await getOpenMatches();
      setMatches(data || []);
    } catch (err) {
      console.error('Failed to load matches:', err);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
    setTimeout(() => setRefreshing(false), 600);
  };

  // Load on mount and when wallet connects
  useEffect(() => {
    loadMatches();
  }, [isConnected, address, loadMatches]);

  // Realtime + polling
  useEffect(() => {
    const channel = subscribeToLobby(() => loadMatches());
    pollRef.current = setInterval(loadMatches, 5000);
    return () => {
      channel.unsubscribe();
      clearInterval(pollRef.current);
    };
  }, [loadMatches]);

  useEffect(() => {
    if (address) getEthBalance(address).then(setEthBalance);
  }, [address]);

  const handleCreate = async () => {
    if (!address || !walletClient) return;
    setError('');
    setTxStatus('');
    setCreating(true);
    try {
      const validation = await validateEntryBalance(address, selectedTier);
      if (!validation.hasEnough) {
        setError(`Insufficient ETH. Need ${validation.required} ETH, you have ${validation.balance.toFixed(4)} ETH.`);
        setCreating(false);
        return;
      }

      const matchId = crypto.randomUUID();
      setTxStatus('Approve ETH deposit in wallet...');
      const result = await createMatchOnChain(walletClient, matchId, maxPlayers, selectedTier);
      if (!result.success) {
        setError(result.error || 'Transaction failed.');
        setCreating(false);
        setTxStatus('');
        return;
      }

      setTxStatus('Creating match record...');
      const match = await createMatch(address, currentTier.eth, maxPlayers, selectedTier, matchId);
      setTxStatus('Match created! ✅');
      setTimeout(() => setTxStatus(''), 2500);
      getEthBalance(address).then(setEthBalance);
      await loadMatches();
      onJoinMatch(match);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to create match');
    }
    setCreating(false);
    setTxStatus('');
  };

  const handleJoin = async (match) => {
    if (!address || !walletClient) return;
    setError('');
    setJoining(match.id);
    try {
      const tierKey    = match.tier || 'bronze';
      const validation = await validateEntryBalance(address, tierKey);
      if (!validation.hasEnough) {
        setError(`Need ${validation.required} ETH to join. You have ${validation.balance.toFixed(4)} ETH.`);
        setJoining(null);
        return;
      }

      setTxStatus('Approve ETH deposit in wallet...');
      const result = await joinMatchOnChain(walletClient, match.id, tierKey);
      if (!result.success) {
        setError(result.error || 'Transaction failed.');
        setJoining(null);
        setTxStatus('');
        return;
      }

      await joinMatch(match.id, address);
      setTxStatus('Joined! ✅');
      setTimeout(() => setTxStatus(''), 2000);
      getEthBalance(address).then(setEthBalance);
      await loadMatches();

      // Fetch the updated match to pass along
      const { data: updatedMatch } = await supabase
        .from('matches').select('*').eq('id', match.id).single();
      onJoinMatch(updatedMatch || match);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to join match');
    }
    setJoining(null);
    setTxStatus('');
  };

  const handleCancel = async (matchId) => {
    if (!address) return;
    setCancelling(matchId);
    try {
      await supabase.from('matches')
        .update({ status: 'cancelled' })
        .eq('id', matchId)
        .eq('host_wallet', address); // only host can cancel via lobby
      await loadMatches();
    } catch (err) {
      setError('Failed to cancel match');
    }
    setCancelling(null);
  };

  if (!isConnected) {
    return (
      <div className="lobby-connect">
        <div className="hero-section">
          <div className="hero-icon">⚡</div>
          <h1>Humble Hero</h1>
          <p className="hero-subtitle">Real-time multiplayer reaction game on Base</p>
          <p className="hero-desc">
            Compete for ETH prizes. Earn points every game.
            Points convert to $HERO tokens in the future.
          </p>
          <div className="features-grid">
            <div className="feature-card"><Zap size={22} /><span>Win ETH</span></div>
            <div className="feature-card"><Users size={22} /><span>2–10 Players</span></div>
            <div className="feature-card"><Star size={22} /><span>Earn Points</span></div>
            <div className="feature-card"><Shield size={22} /><span>Smart Contract</span></div>
          </div>
          <div className="points-notice">
            🎯 Points earned now → $HERO airdrop in the future
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
            <ConnectKitButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>Game Lobby</h2>
        <p>Win ETH • Earn points • Future $HERO airdrop</p>
        <div className="sol-balance-badge">
          <Wallet size={13} /> {ethBalance.toFixed(4)} ETH
        </div>
      </div>

      {error    && <div className="lobby-error"><AlertCircle size={15} /> {error}</div>}
      {txStatus && <div className="tx-status">{txStatus}</div>}

      {/* Create Match */}
      <div className="create-match-card">
        <h3><Plus size={17} /> Create Match</h3>

        <div className="option-group">
          <label>Pool Tier — Entry Fee & Points</label>
          <div className="tier-select">
            {Object.entries(ENTRY_TIERS).map(([key, tier]) => (
              <button
                key={key}
                className={`tier-btn ${selectedTier === key ? 'active' : ''}`}
                onClick={() => setSelectedTier(key)}
              >
                <span className="tier-icon">{tier.icon}</span>
                <span className="tier-sol">{tier.eth} ETH</span>
                <span className="tier-points">+{(tier.points / 1000).toFixed(0)}K pts</span>
              </button>
            ))}
          </div>
        </div>

        <div className="create-options">
          <div className="option-group">
            <label>Players</label>
            <div className="player-select">
              {PLAYER_OPTIONS.map(n => (
                <button
                  key={n}
                  className={`player-opt ${maxPlayers === n ? 'active' : ''}`}
                  onClick={() => setMaxPlayers(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="option-group">
            <label>Your Entry</label>
            <div className="fee-display">{currentTier.eth} ETH</div>
          </div>
          <div className="option-group">
            <label>Prize Pool</label>
            <div className="prize-preview">
              🏆 {(parseFloat(currentTier.eth) * maxPlayers).toFixed(4)} ETH
            </div>
          </div>
          <div className="option-group">
            <label>Points per Game</label>
            <div className="points-preview">
              ⭐ {currentTier.points.toLocaleString()} pts (×2 if you win)
            </div>
          </div>
        </div>

        <div className="escrow-notice">
          🔒 ETH locked in Base smart contract • 5% platform fee on prize
        </div>

        <button className="create-btn" onClick={handleCreate} disabled={creating}>
          {creating ? (txStatus || 'Creating...') : `Create Match — ${currentTier.eth} ETH`}
        </button>
      </div>

      {/* Open Matches */}
      <div className="matches-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3>Open Matches ({matches.length})</h3>
          <button
            onClick={handleRefresh}
            title="Refresh"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
          >
            <RefreshCw size={15} style={{ animation: refreshing ? 'spin 0.6s linear' : 'none' }} />
            Refresh
          </button>
        </div>

        {matches.length === 0 ? (
          <div className="no-matches">
            <p>No open matches. Create one to start playing!</p>
          </div>
        ) : (
          <div className="matches-list">
            {matches.map(match => {
              const tier       = getTierByKey(match.tier || 'bronze');
              const joined     = match.match_players?.length || match.current_players || 1;
              const remaining  = match.max_players - joined;
              const pool       = parseFloat(match.prize_pool || 0);
              const isHost     = match.host_wallet === address;
              const alreadyIn  = match.match_players?.some(p => p.wallet_address === address);

              return (
                <div key={match.id} className="match-card">
                  <div className="match-info">
                    <div className="match-host">
                      <span className="tier-badge-sm">{tier.icon} {tier.eth} ETH</span>
                      {' '}Host: {formatWallet(match.host_wallet)}
                      {isHost && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          Your Match
                        </span>
                      )}
                    </div>
                    <div className="match-details">
                      <span><Users size={13} /> {joined}/{match.max_players}</span>
                      <span className="match-remaining">{remaining} spot{remaining !== 1 ? 's' : ''} left</span>
                      <span>🏆 {pool.toFixed(4)} ETH</span>
                      <span>⭐ {tier.points.toLocaleString()} pts</span>
                    </div>
                    <div className="match-progress-bar">
                      <div
                        className="match-progress-fill"
                        style={{ width: `${(joined / match.max_players) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {isHost && joined <= 1 && (
                      <button
                        style={{ background: 'rgba(255,0,0,0.15)', color: '#ff6666', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,0,0,0.2)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => handleCancel(match.id)}
                        disabled={cancelling === match.id}
                      >
                        <XCircle size={13} /> {cancelling === match.id ? '...' : 'Cancel'}
                      </button>
                    )}
                    <button
                      className="join-btn"
                      onClick={() => handleJoin(match)}
                      disabled={joining === match.id || isHost || alreadyIn}
                    >
                      {joining === match.id
                        ? 'Joining...'
                        : alreadyIn
                          ? 'Joined ✓'
                          : isHost
                            ? 'Your match'
                            : <><span>Join</span> <ArrowRight size={13} /></>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}