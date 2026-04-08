import { useState, useEffect, useRef } from 'react';
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

  const startTriggered = useRef(false);

  const tierKey   = matchData.tier || 'bronze';
  const tierInfo  = getTierByKey(tierKey);
  const pool      = parseFloat(matchData.prize_pool || 0);
  const isHost    = address === matchData.host_wallet;

  // ─── Cancel is only available to host when they are the ONLY player ────────
  // players array includes the host, so length === 1 means no one else joined
  const canCancel = isHost && players.length === 1 && matchData.status === 'waiting';
  const remaining = matchData.max_players - players.length;

  const loadPlayers = async () => {
    const data = await getMatchPlayers(match.id);
    setPlayers(data);
    return data;
  };

  useEffect(() => {
    loadPlayers();

    const channel = subscribeToMatch(match.id, async (payload) => {
      const freshPlayers = await loadPlayers();

      if (payload.new) {
        setMatchData(prev => ({ ...prev, ...payload.new }));

        // Game starts when status becomes 'in_progress'
        if (
          payload.new.status === 'in_progress' &&
          !startTriggered.current
        ) {
          startTriggered.current = true;
          onGameStart({ ...matchData, ...payload.new }, freshPlayers);
        }
      }
    });

    return () => { channel.unsubscribe(); };
  }, [match.id]);

  // ─── When pool is full, host triggers synchronized start ──────────────────
  useEffect(() => {
    if (
      players.length >= matchData.max_players &&
      isHost &&
      matchData.status === 'waiting' &&
      !startTriggered.current
    ) {
      triggerStart();
    }
  }, [players.length]);

  const triggerStart = async () => {
    if (startTriggered.current) return;
    startTriggered.current = true;

    // Mark as in_progress — all players receive this via realtime and start simultaneously
    await startMatch(match.id);
  };

  // ─── Countdown display only (no game logic here) ──────────────────────────
  useEffect(() => {
    if (players.length >= matchData.max_players && countdown === null) {
      setCountdown(3);
    }
  }, [players.length]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // ─── Cancel match — refund host on-chain ─────────────────────────────────
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

        {/* Player count ring */}
        <div className="player-count-ring">
          <div className="ring-inner">
            <span className="ring-number">{players.length}</span>
            <span className="ring-label">/ {matchData.max_players}</span>
          </div>
        </div>

        <div className="mm-slots-info">
          <span className="slots-joined">{players.length} joined</span>
          <span className="slots-remaining">
            {remaining > 0 ? `${remaining} more needed` : 'Pool full!'}
          </span>
        </div>

        {/* Prize pool */}
        <div className="prize-display">
          <span className="prize-label">Prize Pool</span>
          <span className="prize-amount">🏆 {pool.toFixed(4)} ETH</span>
        </div>

        {/* Player list */}
        <div className="players-list">
          {players.map((p, i) => (
            <div key={p.id} className="player-item">
              <span className="player-num">#{i + 1}</span>
              <span className="player-wallet">
                {formatWallet(p.wallet_address)}
                {p.wallet_address === matchData.host_wallet && (
                  <span className="host-badge">HOST</span>
                )}
                {p.wallet_address === address && (
                  <span className="you-badge">YOU</span>
                )}
              </span>
              <span className="player-ready">✓</span>
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: remaining }).map((_, i) => (
            <div key={`empty-${i}`} className="player-item empty">
              <span className="player-num">#{players.length + i + 1}</span>
              <span className="player-wallet">Waiting for player...</span>
              <Loader size={14} className="spinning" />
            </div>
          ))}
        </div>

        {/* Countdown when full */}
        {countdown !== null && countdown > 0 && (
          <div className="countdown">
            <div className="countdown-number">{countdown}</div>
            <div className="countdown-label">Game starting for everyone!</div>
          </div>
        )}

        {countdown === 0 && (
          <div className="countdown">
            <div className="countdown-number">⚡</div>
            <div className="countdown-label">Starting now!</div>
          </div>
        )}

        {cancelError && (
          <div className="lobby-error" style={{ margin: '0.75rem 0' }}>
            <AlertCircle size={14} /> {cancelError}
          </div>
        )}

        {/* Actions */}
        <div className="matchmaking-actions">
          {canCancel ? (
            <>
              <button
                className="cancel-refund-btn"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : '↩ Cancel & Get Refund'}
              </button>
              <p className="cancel-hint">
                No one has joined yet. Cancel to get your {tierInfo.eth} ETH back on-chain.
              </p>
            </>
          ) : (
            !isHost && matchData.status === 'waiting' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Waiting for {remaining} more player{remaining !== 1 ? 's' : ''} to join...
              </p>
            )
          )}
        </div>

      </div>
    </div>
  );
}