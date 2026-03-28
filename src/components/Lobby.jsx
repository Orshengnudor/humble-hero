import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getOpenMatches, createMatch, joinMatch, subscribeToLobby } from '../lib/supabase';
import { formatWallet, POOL_TIERS, PLAYER_OPTIONS, getSolBalance, validateEntryBalance, payEntryFee } from '../lib/solana';
import { Users, Zap, Plus, ArrowRight, Trophy, Shield, Wallet } from 'lucide-react';

export default function Lobby({ onJoinMatch }) {
  const { publicKey, connected, wallet } = useWallet();
  const [matches, setMatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(null);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [selectedTier, setSelectedTier] = useState('basic');
  const [solBalance, setSolBalance] = useState(null);
  const [error, setError] = useState('');

  const tier = POOL_TIERS[selectedTier];

  const loadMatches = async () => {
    try {
      const data = await getOpenMatches();
      setMatches(data);
    } catch (err) {
      console.error('Failed to load matches:', err);
    }
  };

  useEffect(() => {
    loadMatches();
    const channel = subscribeToLobby(() => loadMatches());
    return () => { channel.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (publicKey) {
      getSolBalance(publicKey).then(setSolBalance);
    }
  }, [publicKey]);

  const handleCreate = async () => {
    if (!publicKey) return;
    setError('');
    setCreating(true);
    try {
      // Validate balance
      const validation = await validateEntryBalance(publicKey, tier.entrySol);
      if (!validation.hasEnough) {
        setError(`Not enough SOL. Need ${tier.entrySol} SOL + fees. Balance: ${validation.balance.toFixed(4)} SOL`);
        setCreating(false);
        return;
      }

      // Pay entry fee
      const payment = await payEntryFee(wallet.adapter, tier.entrySol);
      if (!payment.success) {
        setError(payment.error || 'Payment failed');
        setCreating(false);
        return;
      }

      const match = await createMatch(publicKey.toBase58(), tier.entrySol, maxPlayers, selectedTier);
      onJoinMatch(match);
    } catch (err) {
      console.error('Failed to create match:', err);
      setError(err.message);
    }
    setCreating(false);
  };

  const handleJoin = async (match) => {
    if (!publicKey) return;
    setError('');
    setJoining(match.id);
    try {
      const validation = await validateEntryBalance(publicKey, match.entry_fee);
      if (!validation.hasEnough) {
        setError(`Not enough SOL. Need ${match.entry_fee} SOL + fees.`);
        setJoining(null);
        return;
      }

      const payment = await payEntryFee(wallet.adapter, match.entry_fee);
      if (!payment.success) {
        setError(payment.error || 'Payment failed');
        setJoining(null);
        return;
      }

      await joinMatch(match.id, publicKey.toBase58());
      onJoinMatch(match);
    } catch (err) {
      console.error('Failed to join match:', err);
      setError(err.message);
    }
    setJoining(null);
  };

  if (!connected) {
    return (
      <div className="lobby-connect">
        <div className="hero-section">
          <div className="hero-icon">⚡</div>
          <h1>Humble Hero</h1>
          <p className="hero-subtitle">Real-time multiplayer reaction game on Solana</p>
          <p className="hero-desc">Compete against players worldwide. Pool SOL, tap fast, win the prize pool.</p>
          <div className="features-grid">
            <div className="feature-card"><Zap size={24} /><span>Lightning Fast</span></div>
            <div className="feature-card"><Users size={24} /><span>Multiplayer</span></div>
            <div className="feature-card"><Trophy size={24} /><span>Win SOL</span></div>
            <div className="feature-card"><Shield size={24} /><span>On Solana</span></div>
          </div>
          <WalletMultiButton className="wallet-btn-hero" />
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>Game Lobby</h2>
        <p>Choose your pool tier, select players, and compete!</p>
        {solBalance !== null && (
          <div className="sol-balance-badge">
            <Wallet size={14} /> {solBalance.toFixed(4)} SOL
          </div>
        )}
      </div>

      {error && <div className="lobby-error">{error}</div>}

      {/* Create Match */}
      <div className="create-match-card">
        <h3><Plus size={18} /> Create Pool</h3>

        {/* Tier Selection */}
        <div className="option-group">
          <label>Pool Tier</label>
          <div className="tier-select">
            {Object.entries(POOL_TIERS).map(([key, t]) => (
              <button
                key={key}
                className={`tier-btn ${selectedTier === key ? 'active' : ''}`}
                onClick={() => setSelectedTier(key)}
                style={{ '--tier-color': t.color }}
              >
                <span className="tier-icon">{t.icon}</span>
                <span className="tier-name">{t.name}</span>
                <span className="tier-price">{t.usdValue}</span>
                <span className="tier-sol">{t.entrySol} SOL</span>
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
            <label>Entry Fee</label>
            <div className="fee-display">{tier.entrySol} SOL ({tier.usdValue})</div>
          </div>
          <div className="option-group">
            <label>Prize Pool</label>
            <div className="prize-preview">🏆 {(tier.entrySol * maxPlayers).toFixed(4)} SOL</div>
          </div>
        </div>
        <button className="create-btn" onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating...' : `Create ${tier.name} Pool`}
        </button>
      </div>

      {/* Open Matches by Tier */}
      <div className="matches-section">
        <h3>Open Pools ({matches.length})</h3>
        {matches.length === 0 ? (
          <div className="no-matches">
            <p>No open pools. Create one to start playing!</p>
          </div>
        ) : (
          <div className="matches-list">
            {matches.map(match => {
              const matchTier = POOL_TIERS[match.tier] || POOL_TIERS.basic;
              const remaining = match.max_players - match.current_players;
              return (
                <div key={match.id} className="match-card" style={{ '--tier-color': matchTier.color }}>
                  <div className="match-info">
                    <div className="match-tier-badge">
                      {matchTier.icon} {matchTier.name}
                    </div>
                    <div className="match-host">
                      Host: {formatWallet(match.host_wallet)}
                    </div>
                    <div className="match-details">
                      <span><Users size={14} /> {match.current_players}/{match.max_players}</span>
                      <span className="match-remaining">{remaining} spot{remaining !== 1 ? 's' : ''} left</span>
                      <span>🏆 {match.prize_pool?.toFixed(4)} SOL</span>
                      <span>💰 {match.entry_fee} SOL</span>
                    </div>
                    <div className="match-progress-bar">
                      <div
                        className="match-progress-fill"
                        style={{ width: `${(match.current_players / match.max_players) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button
                    className="join-btn"
                    onClick={() => handleJoin(match)}
                    disabled={joining === match.id}
                  >
                    {joining === match.id ? 'Joining...' : <>Join <ArrowRight size={14} /></>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
