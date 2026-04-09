import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { updatePlayerScore, subscribeToMatch, getMatchPlayers, finishMatch } from '../lib/supabase';
import { formatWallet } from '../lib/blockchain';
import {
  createGameState, spawnTarget, hitTarget, removeExpiredTargets,
  getRandomSpawnInterval, calculateAccuracy, getAvgReactionTime, ROUND_DURATION_SEC,
} from '../lib/gameEngine';
import { Zap, Target, Clock } from 'lucide-react';

export default function GamePlay({ match, players: initialPlayers, onGameEnd }) {
  const { address } = useAccount();

  const [gameState,     setGameState]     = useState(() => createGameState());
  const [opponents,     setOpponents]     = useState(initialPlayers || []);
  const [lastHitEffect, setLastHitEffect] = useState(null);
  const [phase,         setPhase]         = useState('waiting'); // waiting | countdown | playing | finished
  const [countdownNum,  setCountdownNum]  = useState(null);

  const spawnRef   = useRef(null);
  const cleanupRef = useRef(null);
  const tickRef    = useRef(null);
  const gsRef      = useRef(gameState);
  const doneRef    = useRef(false);
  gsRef.current    = gameState;

  const AREA_WIDTH  = 320;
  const AREA_HEIGHT = 384;
  const isHost      = address === match.host_wallet;

  // ─── Sync opponents ────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = subscribeToMatch(match.id, async () => {
      const data = await getMatchPlayers(match.id);
      setOpponents(data);
    });
    return () => { ch.unsubscribe(); };
  }, [match.id]);

  // ─── Synchronized start using game_start_time from match ──────────────────
  // This is the KEY fix: all players use the SAME UTC timestamp from the DB.
  // No local countdown that drifts — pure math: startAt - now = delay.
  useEffect(() => {
    const gameStartTime = match.game_start_time;

    if (!gameStartTime) {
      // Fallback: if column doesn't exist yet, use a fixed 3s delay
      console.warn('No game_start_time on match — using 3s fallback');
      const t = setTimeout(() => beginGame(), 3000);
      return () => clearTimeout(t);
    }

    const startAt = new Date(gameStartTime).getTime();
    const now     = Date.now();
    const delay   = Math.max(0, startAt - now);

    console.log(`[GamePlay] game_start_time=${gameStartTime}, delay=${delay}ms`);

    // Show countdown display ticking toward zero
    setPhase('countdown');
    setCountdownNum(Math.ceil(delay / 1000));

    const countdownInterval = setInterval(() => {
      const secs = Math.ceil((startAt - Date.now()) / 1000);
      setCountdownNum(Math.max(0, secs));
    }, 250);

    const startTimer = setTimeout(() => {
      clearInterval(countdownInterval);
      beginGame();
    }, delay);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(startTimer);
    };
  }, []);

  const beginGame = () => {
    setPhase('playing');
    setCountdownNum(null);
    setGameState(prev => ({ ...prev, isActive: true, timeLeft: ROUND_DURATION_SEC }));
  };

  // ─── Game timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;

    tickRef.current = setInterval(() => {
      setGameState(prev => {
        if (prev.timeLeft <= 1) {
          clearInterval(tickRef.current);
          clearTimeout(spawnRef.current);
          clearInterval(cleanupRef.current);
          const final = { ...prev, timeLeft: 0, isActive: false };
          if (!doneRef.current) {
            doneRef.current = true;
            setPhase('finished');
            setTimeout(() => handleGameOver(final), 800);
          }
          return final;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(tickRef.current);
  }, [phase]);

  // ─── Target spawner ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const schedule = () => {
      spawnRef.current = setTimeout(() => {
        setGameState(prev => {
          if (!prev.isActive) return prev;
          const t = spawnTarget(prev, AREA_WIDTH, AREA_HEIGHT);
          return t ? { ...prev, targets: [...prev.targets, t] } : prev;
        });
        if (gsRef.current.isActive) schedule();
      }, getRandomSpawnInterval(gsRef.current.timeLeft));
    };
    schedule();
    return () => clearTimeout(spawnRef.current);
  }, [phase]);

  // ─── Expire targets ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    cleanupRef.current = setInterval(() => {
      setGameState(prev => removeExpiredTargets({ ...prev }));
    }, 150);
    return () => clearInterval(cleanupRef.current);
  }, [phase]);

  // ─── Score sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || !address) return;
    const sync = setInterval(() => {
      const gs = gsRef.current;
      updatePlayerScore(match.id, address, gs.score, getAvgReactionTime(gs));
    }, 1500);
    return () => clearInterval(sync);
  }, [phase, address, match.id]);

  // ─── Click handler ─────────────────────────────────────────────────────────
  const handleTargetClick = useCallback((targetId) => {
    setGameState(prev => {
      const next = hitTarget({ ...prev, targets: [...prev.targets] }, targetId);
      if (next.lastHit) {
        setLastHitEffect(next.lastHit);
        setTimeout(() => setLastHitEffect(null), 600);
      }
      return next;
    });
  }, []);

  // ─── Game over ─────────────────────────────────────────────────────────────
  const handleGameOver = async (finalState) => {
    if (!address) return;

    await updatePlayerScore(match.id, address, finalState.score, getAvgReactionTime(finalState));

    // Wait 2s for all players to push final scores
    await new Promise(r => setTimeout(r, 2000));

    const all    = await getMatchPlayers(match.id);
    const sorted = [...all].sort((a, b) => b.score - a.score);
    const top    = sorted[0]?.score ?? 0;
    const tied   = sorted.filter(p => p.score === top);
    const winner = tied.length === 1
      ? sorted[0]
      : tied.sort((a, b) => (a.avg_reaction_time || 9999) - (b.avg_reaction_time || 9999))[0];

    // Only host writes winner to Supabase — declareWinners.js picks it up
    if (isHost) {
      await finishMatch(match.id, winner.wallet_address);
    }

    onGameEnd({
      ...finalState,
      allPlayers:  sorted,
      winner:      winner.wallet_address,
      isWinner:    winner.wallet_address === address,
      prizePool:   match.prize_pool || 0,
      perfectHits: finalState.perfectHits,
      maxCombo:    finalState.maxCombo,
    });
  };

  return (
    <div className="gameplay">
      <div className="game-hud">
        <div className="hud-item score"><Zap size={16} /><span>{gameState.score}</span></div>
        <div className="hud-item timer">
          <Clock size={16} />
          <span className={gameState.timeLeft <= 10 ? 'urgent' : ''}>{gameState.timeLeft}s</span>
        </div>
        <div className="hud-item combo"><Target size={16} /><span>x{gameState.combo}</span></div>
      </div>

      <div className="opponents-bar">
        {opponents.filter(p => p.wallet_address !== address).map(p => (
          <div key={p.id} className="opponent-score">
            <span className="opp-name">{formatWallet(p.wallet_address)}</span>
            <span className="opp-score">{p.score || 0}</span>
          </div>
        ))}
      </div>

      <div className="game-play-area">
        {(phase === 'waiting' || phase === 'countdown') && (
          <div className="game-countdown-overlay">
            <div className="big-text" style={{ fontSize: '4rem' }}>
              {countdownNum > 0 ? countdownNum : 'GO!'}
            </div>
            <p style={{ fontSize: '0.82rem', opacity: 0.7, marginTop: '0.5rem' }}>
              All players start at the same time
            </p>
          </div>
        )}

        {phase === 'playing' && gameState.targets.map(target => {
          const progress = Math.min(1, (Date.now() - target.spawnedAt) / target.lifetime);
          return (
            <button
              key={target.id}
              className={`game-target target-${target.type}`}
              style={{
                left:            `${target.x}px`,
                top:             `${target.y}px`,
                width:           target.size,
                height:          target.size,
                opacity:         Math.max(0.25, 1 - progress * 0.75),
                transform:       `scale(${1 - progress * 0.3})`,
                backgroundColor: target.color,
              }}
              onClick={() => handleTargetClick(target.id)}
            />
          );
        })}

        {lastHitEffect && (
          <div
            className={`hit-effect effect-${lastHitEffect.quality}`}
            style={{ left: lastHitEffect.x, top: lastHitEffect.y }}
          >
            <span className="hit-score">{lastHitEffect.score > 0 ? '+' : ''}{lastHitEffect.score}</span>
            <span className="hit-label">{lastHitEffect.quality.toUpperCase()}</span>
          </div>
        )}

        {phase === 'finished' && (
          <div className="game-over-overlay">
            <div className="big-text">TIME'S UP!</div>
            <div className="final-score">{gameState.score} pts</div>
            <div className="sub-text">Calculating results...</div>
          </div>
        )}
      </div>

      <div className="game-bottom-stats">
        <span>Accuracy: {calculateAccuracy(gameState)}%</span>
        <span>Avg: {getAvgReactionTime(gameState)}ms</span>
        <span>Best Combo: x{gameState.maxCombo}</span>
      </div>
    </div>
  );
}