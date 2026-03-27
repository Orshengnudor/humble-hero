import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { getOpenMatches, createMatch, joinMatch, subscribeToLobby } from '../lib/supabase';
import { formatWallet, ENTRY_FEE_HERO } from '../lib/solana';
import { Users, Zap, Plus, ArrowRight, Trophy, Shield } from 'lucide-react';

export default function Lobby({ onJoinMatch }) {
  const { publicKey, connected } = useWallet();
  const [matches, setMatches] = useState([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(null);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [entryFee, setEntryFee] = useState(ENTRY_FEE_HERO);

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

  const handleCreate = async () => {
    if (!publicKey) return;
    setCreating(true);
    try {
      const match = await createMatch(publicKey.toBase58(), entryFee, maxPlayers);
      onJoinMatch(match);
    } catch (err) {
      console.error('Failed to create match:', err);
    }
    setCreating(false);
  };

  const handleJoin = async (match) => {
    if (!publicKey) return;
    setJoining(match.id);
    try {
      await joinMatch(match.id, publicKey.toBase58());
      onJoinMatch(match);
    } catch (err) {
      console.error('Failed to join match:', err);
    }
    setJoining(null);
  };

  if (!connected) {
    return (
      <div className="lobby-connect">
        <div className="hero-section">
          <div className="hero-icon">⚡</div>
          <h1>Humble Hero</h1>
          <p className="hero-subtitle">Real-time multiplayer reaction game</p>
          <p className="hero-desc">Compete against players worldwide. The fastest reactions win the prize pool.</p>
          
          <div className="features-grid">
            <div className="feature-card">
              <Zap size={24} />
              <span>Lightning Fast</span>
            </div>
            <div className="feature-card">
              <Users size={24} />
              <span>Multiplayer</span>
            </div>
            <div className="feature-card">
              <Trophy size={24} />
              <span>Win $HERO</span>
            </div>
            <div className="feature-card">
              <Shield size={24} />
              <span>On Solana</span>
            </div>
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
        <p>Create or join a match to compete</p>
      </div>

      {/* Create Match */}
      <div className="create-match-card">
        <h3><Plus size={18} /> Create Match</h3>
        <div className="create-options">
          <div className="option-group">
            <label>Players</label>
            <div className="player-select">
              {[2, 3, 4, 5, 6, 8, 10].map(n => (
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
            <div className="fee-display">{entryFee} $HERO</div>
          </div>
          <div className="option-group">
            <label>Prize Pool</label>
            <div className="prize-preview">🏆 {entryFee * maxPlayers} $HERO</div>
          </div>
        </div>
        <button 
          className="create-btn" 
          onClick={handleCreate} 
          disabled={creating}
        >
          {creating ? 'Creating...' : 'Create Match'}
        </button>
      </div>

      {/* Open Matches */}
      <div className="matches-section">
        <h3>Open Matches ({matches.length})</h3>
        {matches.length === 0 ? (
          <div className="no-matches">
            <p>No open matches. Create one to start playing!</p>
          </div>
        ) : (
          <div className="matches-list">
            {matches.map(match => (
              <div key={match.id} className="match-card">
                <div className="match-info">
                  <div className="match-host">
                    Host: {formatWallet(match.host_wallet)}
                  </div>
                  <div className="match-details">
                    <span><Users size={14} /> {match.current_players}/{match.max_players}</span>
                    <span>🏆 {match.prize_pool} $HERO</span>
                    <span>💰 {match.entry_fee} $HERO entry</span>
                  </div>
                </div>
                <button
                  className="join-btn"
                  onClick={() => handleJoin(match)}
                  disabled={joining === match.id}
                >
                  {joining === match.id ? 'Joining...' : (
                    <>Join <ArrowRight size={14} /></>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
