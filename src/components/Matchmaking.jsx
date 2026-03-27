import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { supabase, subscribeToMatch, getMatchPlayers, startMatch } from '../lib/supabase';
import { formatWallet } from '../lib/solana';
import { Users, Clock, Loader } from 'lucide-react';

export default function Matchmaking({ match, onGameStart, onLeave }) {
  const { publicKey } = useWallet();
  const [players, setPlayers] = useState([]);
  const [countdown, setCountdown] = useState(null);
  const [matchData, setMatchData] = useState(match);

  const loadPlayers = async () => {
    const data = await getMatchPlayers(match.id);
    setPlayers(data);
  };

  useEffect(() => {
    loadPlayers();
    
    const channel = subscribeToMatch(match.id, (payload) => {
      loadPlayers();
      // Check if match status changed
      if (payload.new?.status === 'starting' || payload.new?.status === 'in_progress') {
        setMatchData(prev => ({ ...prev, ...payload.new }));
      }
    });

    return () => { channel.unsubscribe(); };
  }, [match.id]);

  // Auto-start countdown when enough players
  useEffect(() => {
    if (players.length >= matchData.max_players && !countdown) {
      setCountdown(5);
    }
  }, [players.length, matchData.max_players]);

  // Countdown timer
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      // Start the game
      const isHost = publicKey?.toBase58() === matchData.host_wallet;
      if (isHost) {
        startMatch(match.id);
      }
      onGameStart(matchData, players);
      return;
    }

    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Manual start for host (2+ players)
  const handleForceStart = async () => {
    if (players.length >= 2) {
      await startMatch(match.id);
      onGameStart(matchData, players);
    }
  };

  const isHost = publicKey?.toBase58() === matchData.host_wallet;

  return (
    <div className="matchmaking">
      <div className="matchmaking-card">
        <div className="matchmaking-header">
          <h2>Waiting for Players</h2>
          <div className="match-id">Match #{match.id.slice(0, 8)}</div>
        </div>

        <div className="player-count-ring">
          <div className="ring-inner">
            <span className="ring-number">{players.length}</span>
            <span className="ring-label">/ {matchData.max_players}</span>
          </div>
        </div>

        <div className="prize-display">
          <span className="prize-label">Prize Pool</span>
          <span className="prize-amount">🏆 {matchData.prize_pool || matchData.entry_fee * players.length} $HERO</span>
        </div>

        <div className="players-list">
          {players.map((p, i) => (
            <div key={p.id} className="player-item">
              <span className="player-num">#{i + 1}</span>
              <span className="player-wallet">
                {formatWallet(p.wallet_address)}
                {p.wallet_address === matchData.host_wallet && (
                  <span className="host-badge">HOST</span>
                )}
                {p.wallet_address === publicKey?.toBase58() && (
                  <span className="you-badge">YOU</span>
                )}
              </span>
              <span className="player-ready">✓</span>
            </div>
          ))}
          
          {/* Empty slots */}
          {Array.from({ length: matchData.max_players - players.length }).map((_, i) => (
            <div key={`empty-${i}`} className="player-item empty">
              <span className="player-num">#{players.length + i + 1}</span>
              <span className="player-wallet">Waiting...</span>
              <Loader size={14} className="spinning" />
            </div>
          ))}
        </div>

        {countdown !== null && (
          <div className="countdown">
            <div className="countdown-number">{countdown}</div>
            <div className="countdown-label">Starting in...</div>
          </div>
        )}

        <div className="matchmaking-actions">
          {isHost && players.length >= 2 && countdown === null && (
            <button className="start-early-btn" onClick={handleForceStart}>
              Start Now ({players.length} players)
            </button>
          )}
          <button className="leave-btn" onClick={onLeave}>
            Leave Match
          </button>
        </div>
      </div>
    </div>
  );
}
