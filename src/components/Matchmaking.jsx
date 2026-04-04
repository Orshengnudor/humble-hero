import { useState, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { subscribeToMatch, getMatchPlayers, startMatch, supabase } from '../lib/supabase';
import { formatWallet, getTierByKey, cancelMatchOnChain } from '../lib/blockchain';
import { Loader, AlertCircle } from 'lucide-react';

export default function Matchmaking({ match, onGameStart, onLeave }) {
  const { address }            = useAccount();
  const { data: walletClient } = useWalletClient();

  const [players,     setPlayers]     = useState([]);
  const [countdown,   setCountdown]   = useState(null);
  const [matchData,   setMatchData]   = useState(match);
  const [cancelling,  setCancelling]  = useState(false);
  const [cancelError, setCancelError] = useState('');

  const tierKey  = matchData.tier || 'bronze';
  const tierInfo = getTierByKey(tierKey);
  const remaining = matchData.max_players - players.length;
  const pool      = parseFloat(matchData.prize_pool || 0);
  const isHost    = address === matchData.host_wallet;

  // Host can cancel only if no other player has joined yet
  const canCancel = isHost && players.length <= 1 && matchData.status === 'waiting';

  const loadPlayers = async () => {
    const data = await getMatchPlayers(match.id);
    setPlayers(data);
  };

  useEffect(() => {
    loadPlayers();
    const channel = subscribeToMatch(match.id, (payload) => {
      loadPlayers();
      if (payload.new?.status === 'starting' || payload.new?.status === 'in_progress') {
        setMatchData(prev => ({ ...prev, ...payload.new }));
      }
    });
    return () => { channel.unsubscribe(); };
  }, [match.id]);

  useEffect(() => {
    if (players.length >= matchData.max_players && !countdown) {
      setCountdown(5);
    }
  }, [players.length, matchData.max_players]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      if (isHost) startMatch(match.id);
      onGameStart(matchData, players);
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleForceStart = async () => {
    if (players.length >= 2) {
      await startMatch(match.id);
      onGameStart(matchData, players);
    }
  };

  const handleCancel = async () => {
    if (!walletClient || !canCancel) return;
    setCancelError('');
    setCancelling(true);

    try {
      const result = await cancelMatchOnChain(walletClient, match.id);

      if (!result.success) {
        setCancelError(result.error || 'Cancellation failed. Try again.');
        setCancelling(false);
        return;
      }

      // Mark cancelled in Supabase
      await supabase
        .from('matches')
        .update({ status: 'cancelled', prize_claimed: true })
        .eq('id', match.id);

      onLeave();
    } catch (err) {
      setCancelError(err.message);
      setCancelling(false);
    }
  };

  return (
    <div className="matchmaking">
      <div className="matchmaking-card">
        <div className="matchmaking-header">
          <div className="mm-tier-badge" style={{ color: 'var(--primary-glow)' }}>
            {tierInfo.icon} {tierInfo.eth} ETH Pool
          </div>
          <h2>Waiting for Players</h2>
          <div className="match-id">Match #{match.id.slice(0, 8)}</div>
        </div>

        <div className="player-count-ring">
          <div className="ring-inner">
            <span className="ring-number">{players.length}</span>
            <span className="ring-label">/ {matchData.max_players}</span>
          </div>
        </div>

        <div className="mm-slots-info">
          <span className="slots-joined">{players.length} joined</span>
          <span className="slots-remaining">{remaining} remaining</span>
        </div>

        <div className="prize-display">
          <span className="prize-label">Prize Pool</span>
          <span className="prize-amount">🏆 {pool.toFixed(4)} ETH</span>
        </div>

        <div className="players-list">
          {players.map((p, i) => (
            <div key={p.id} className="player-item">
              <span className="player-num">#{i + 1}</span>
              <span className="player-wallet">
                {formatWallet(p.wallet_address)}
                {p.wallet_address === matchData.host_wallet && <span className="host-badge">HOST</span>}
                {p.wallet_address === address && <span className="you-badge">YOU</span>}
              </span>
              <span className="player-ready">✓</span>
            </div>
          ))}
          {Array.from({ length: remaining }).map((_, i) => (
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

        {cancelError && (
          <div className="lobby-error" style={{ margin: '0.75rem 0' }}>
            <AlertCircle size={14} /> {cancelError}
          </div>
        )}

        <div className="matchmaking-actions">
          {isHost && players.length >= 2 && countdown === null && (
            <button className="start-early-btn" onClick={handleForceStart}>
              Start Now ({players.length} players)
            </button>
          )}

          {canCancel ? (
            <button
              className="cancel-refund-btn"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : '↩ Cancel & Get Refund'}
            </button>
          ) : (
            <button className="leave-btn" onClick={onLeave}>
              Leave Match
            </button>
          )}
        </div>

        {canCancel && (
          <p className="cancel-hint">
            No one has joined yet. Cancel to get your {tierInfo.eth} ETH back on-chain.
          </p>
        )}
      </div>
    </div>
  );
}