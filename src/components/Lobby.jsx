import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getOpenMatches, createMatch, joinMatch, subscribeToLobby } from '../lib/supabase';
import {
  formatWallet,
  ENTRY_TIERS,
  PLAYER_OPTIONS,
  getSolBalance,
  validateSolBalance,
  createMatchOnChain,
  joinMatchOnChain,
} from '../lib/blockchain';
import { Users, Zap, Plus, ArrowRight, Trophy, Shield, Wallet, AlertCircle } from 'lucide-react';

const TIER_ICONS = {
  micro: '🪙', basic: '⚡', mid: '💎', high: '🔥', whale: '🐋',
};

export default function Lobby({ onJoinMatch }) {
  const { publicKey, connected, wallet } = useWallet();
  const [matches, setMatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(null);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [selectedTier, setSelectedTier] = useState('basic');
  const [solBalance, setSolBalance] = useState(null);
  const [error, setError] = useState('');
  const [txStatus, setTxStatus] = useState('');

  const tier = ENTRY_TIERS[selectedTier];

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
    if (publicKey) getSolBalance(publicKey).then(setSolBalance);
  }, [publicKey]);

  const handleCreate = async () => {
    if (!publicKey || !wallet) return;
    setError('');
    setTxStatus('');
    setCreating(true);

    try {
      // 1. Validate balance
      const validation = await validateSolBalance(publicKey, tier.sol);
      if (!validation.hasEnough) {
        setError(`Insufficient SOL. Need ${validation.required.toFixed(4)} SOL, have ${validation.balance.toFixed(4)} SOL.`);
        setCreating(false);
        return;
      }

      // 2. Create off-chain match record first (get UUID match_id)
      setTxStatus('Creating match record...');
      const match = await createMatch(publicKey.toBase58(), tier.sol, maxPlayers, selectedTier);

      // 3. Create on-chain escrow and lock entry fee
      setTxStatus('Approve wallet transaction...');
      const result = await createMatchOnChain(
        wallet.adapter,
        match.id,       // UUID from Supabase
        maxPlayers,
        tier.sol,
      );

      if (!result.success) {
        setError(result.error || 'On-chain transaction failed. Match cancelled.');
        setCreating(false);
        setTxStatus('');
        return;
      }

      setTxStatus(`Transaction confirmed! ✅`);
      setTimeout(() => setTxStatus(''), 3000);

      // 4. Update Supabase with on-chain tx reference
      await import('../lib/supabase').then(({ supabase }) =>
        supabase.from('matches').update({
          escrow_pda: result.escrowPDA,
          create_tx: result.txId,
        }).eq('id', match.id)
      );

      setSolBalance(prev => prev - tier.sol - 0.002);
      onJoinMatch(match);
    } catch (err) {
      console.error('Failed to create match:', err);
      setError(err.message);
    }
    setCreating(false);
    setTxStatus('');
  };

  const handleJoin = async (match) => {
    if (!publicKey || !wallet) return;
    setError('');
    setJoining(match.id);

    try {
      const validation = await validateSolBalance(publicKey, match.entry_fee);
      if (!validation.hasEnough) {
        setError(`Need ${validation.required.toFixed(4)} SOL to join. You have ${validation.balance.toFixed(4)} SOL.`);
        setJoining(null);
        return;
      }

      setTxStatus('Approve wallet transaction...');

      // 1. On-chain join (locks SOL in escrow)
      const result = await joinMatchOnChain(wallet.adapter, match.id);
      if (!result.success) {
        setError(result.error || 'Transaction failed.');
        setJoining(null);
        setTxStatus('');
        return;
      }

      // 2. Off-chain record
      await joinMatch(match.id, publicKey.toBase58());

      setTxStatus('Joined! ✅');
      setTimeout(() => setTxStatus(''), 2000);
      setSolBalance(prev => prev - match.entry_fee - 0.002);
      onJoinMatch(match);
    } catch (err) {
      console.error('Failed to join match:', err);
      setError(err.message);
    }
    setJoining(null);
    setTxStatus('');
  };

  if (!connected) {
    return (
      <div className="lobby-connect">
        <div className="hero-section">
          <div className="hero-icon">⚡</div>
          <h1>Humble Hero</h1>
          <p className="hero-subtitle">Real-time multiplayer reaction game on Solana</p>
          <p className="hero-desc">
            Compete against players worldwide. Entry fees are locked in a smart contract escrow —
            winner claims the full prize pool automatically.
          </p>
          <div className="features-grid">
            <div className="feature-card"><Zap size={22} /><span>Lightning Fast</span></div>
            <div className="feature-card"><Users size={22} /><span>2–10 Players</span></div>
            <div className="feature-card"><Trophy size={22} /><span>Win SOL</span></div>
            <div className="feature-card"><Shield size={22} /><span>Smart Contract</span></div>
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
        <p>Entry fees are locked in a Solana smart contract — winner takes all.</p>
        {solBalance !== null && (
          <div className="sol-balance-badge">
            <Wallet size={13} /> {solBalance.toFixed(4)} SOL
          </div>
        )}
      </div>

      {error && (
        <div className="lobby-error">
          <AlertCircle size={15} /> {error}
        </div>
      )}
      {txStatus && <div className="tx-status">{txStatus}</div>}

      {/* Create Match */}
      <div className="create-match-card">
        <h3><Plus size={17} /> Create Pool</h3>

        {/* Tier Selection */}
        <div className="option-group">
          <label>Entry Fee (SOL)</label>
          <div className="tier-select">
            {Object.entries(ENTRY_TIERS).map(([key, t]) => (
              <button
                key={key}
                className={`tier-btn ${selectedTier === key ? 'active' : ''}`}
                onClick={() => setSelectedTier(key)}
              >
                <span className="tier-icon">{TIER_ICONS[key]}</span>
                <span className="tier-sol">{t.sol} SOL</span>
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
            <div className="fee-display">{tier.sol} SOL</div>
          </div>
          <div className="option-group">
            <label>Prize Pool</label>
            <div className="prize-preview">🏆 {(tier.sol * maxPlayers).toFixed(3)} SOL</div>
          </div>
        </div>

        <div className="escrow-notice">
          🔒 Funds locked in smart contract until game ends
        </div>

        <button className="create-btn" onClick={handleCreate} disabled={creating}>
          {creating ? (txStatus || 'Creating...') : `Create Pool — ${tier.sol} SOL`}
        </button>
      </div>

      {/* Open Matches */}
      <div className="matches-section">
        <h3>Open Pools ({matches.length})</h3>
        {matches.length === 0 ? (
          <div className="no-matches">
            <p>No open pools. Create one to start playing!</p>
          </div>
        ) : (
          <div className="matches-list">
            {matches.map(match => {
              const remaining = match.max_players - (match.current_players || 1);
              const tierKey = match.tier || 'basic';
              const tierInfo = ENTRY_TIERS[tierKey] || ENTRY_TIERS.basic;
              return (
                <div key={match.id} className="match-card">
                  <div className="match-info">
                    <div className="match-host">
                      Host: {formatWallet(match.host_wallet)}
                      {match.escrow_pda && <span className="onchain-badge">🔒 On-chain</span>}
                    </div>
                    <div className="match-details">
                      <span><Users size={13} /> {match.current_players}/{match.max_players}</span>
                      <span className="match-remaining">{remaining} spot{remaining !== 1 ? 's' : ''} left</span>
                      <span>🏆 {(match.prize_pool || 0).toFixed(3)} SOL</span>
                      <span>💰 {match.entry_fee} SOL</span>
                    </div>
                    <div className="match-progress-bar">
                      <div
                        className="match-progress-fill"
                        style={{ width: `${((match.current_players || 1) / match.max_players) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button
                    className="join-btn"
                    onClick={() => handleJoin(match)}
                    disabled={joining === match.id}
                  >
                    {joining === match.id ? 'Joining...' : <><span>Join</span> <ArrowRight size={13} /></>}
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