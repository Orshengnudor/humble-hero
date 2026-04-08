import { useState, useEffect, useRef, useCallback } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import {
  updatePlayerScore,
  subscribeToMatch,
  getMatchPlayers,
  finishMatch,
} from '../lib/supabase';
import { formatWallet } from '../lib/blockchain';
import {
  createGameState,
  spawnTarget,
  hitTarget,
  removeExpiredTargets,
  getRandomSpawnInterval,
  calculateAccuracy,
  getAvgReactionTime,
  ROUND_DURATION_SEC,
} from '../lib/gameEngine';
import { Zap, Target, Clock } from 'lucide-react';

export default function GamePlay({ match, players: initialPlayers, onGameEnd }) {
  const { address } = useAccount();

  const [gameState,     setGameState]     = useState(() => createGameState());
  const [opponents,     setOpponents]     = useState(initialPlayers || []);
  const [lastHitEffect, setLastHitEffect] = useState(null);
  const [gameStarted,   setGameStarted]   = useState(false);

  const spawnTimerRef  = useRef(null);
  const cleanupRef     = useRef(null);
  const tickRef        = useRef(null);
  const gsRef          = useRef(gameState);
  const gameOverCalled = useRef(false);
  gsRef.current        = gameState;

  const AREA_WIDTH  = 320;
  const AREA_HEIGHT = 384;
  const isHost      = address === match.host_wallet;

  // ─── Subscribe to opponent score updates ──────────────────────────────────
  useEffect(() => {
    const channel = subscribeToMatch(match.id, async () => {
      const data = await getMatchPlayers(match.id);
      setOpponents(data);
    });
    return () => { channel.unsubscribe(); };
  }, [match.id]);

  // ─── All players start at the same time ───────────────────────────────────
  // The match was set to 'in_progress' by the host in Matchmaking.
  // We use a fixed 3-second delay from mount so all players who receive
  // the realtime update at roughly the same time start together.
  useEffect(() => {
    const timer = setTimeout(() => {
      setGameStarted(true);
      setGameState(prev => ({
        ...prev,
        isActive: true,
        timeLeft: ROUND_DURATION_SEC,
      }));
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // ─── 1-second game timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted) return;

    tickRef.current = setInterval(() => {
      setGameState(prev => {
        if (prev.timeLeft <= 1) {
          clearInterval(tickRef.current);
          const finalState = { ...prev, timeLeft: 0, isActive: false };
          if (!gameOverCalled.current) {
            gameOverCalled.current = true;
            setTimeout(() => handleGameOver(finalState), 500);
          }
          return finalState;
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(tickRef.current);
  }, [gameStarted]);

  // ─── Target spawner ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted) return;

    const scheduleSpawn = () => {
      spawnTimerRef.current = setTimeout(() => {
        setGameState(prev => {
          if (!prev.isActive) return prev;
          const target = spawnTarget(prev, AREA_WIDTH, AREA_HEIGHT);
          return target ? { ...prev, targets: [...prev.targets, target] } : prev;
        });
        if (gsRef.current.isActive) scheduleSpawn();
      }, getRandomSpawnInterval(gsRef.current.timeLeft));
    };

    scheduleSpawn();
    return () => clearTimeout(spawnTimerRef.current);
  }, [gameStarted]);

  // ─── Expire old targets ───────────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted) return;
    cleanupRef.current = setInterval(() => {
      setGameState(prev => removeExpiredTargets({ ...prev }));
    }, 150);
    return () => clearInterval(cleanupRef.current);
  }, [gameStarted]);

  // ─── Sync score to Supabase every 1.5s ───────────────────────────────────
  useEffect(() => {
    if (!gameStarted || !address) return;
    const sync = setInterval(() => {
      const gs = gsRef.current;
      updatePlayerScore(match.id, address, gs.score, getAvgReactionTime(gs));
    }, 1500);
    return () => clearInterval(sync);
  }, [gameStarted, address, match.id]);

  // ─── Hit target ───────────────────────────────────────────────────────────
  const handleTargetClick = useCallback((targetId) => {
    setGameState(prev => {
      const newState = hitTarget({ ...prev, targets: [...prev.targets] }, targetId);
      if (newState.lastHit) {
        setLastHitEffect(newState.lastHit);
        setTimeout(() => setLastHitEffect(null), 600);
      }
      return newState;
    });
  }, []);

  // ─── Game over ────────────────────────────────────────────────────────────
  const handleGameOver = async (finalState) => {
    if (!address) return;

    // Final score push
    await updatePlayerScore(
      match.id,
      address,
      finalState.score,
      getAvgReactionTime(finalState)
    );

    // Wait 2 seconds for all players to push their final scores
    await new Promise(r => setTimeout(r, 2000));

    const allPlayers = await getMatchPlayers(match.id);
    const sorted     = [...allPlayers].sort((a, b) => b.score - a.score);
    const topScore   = sorted[0]?.score ?? 0;
    const tied       = sorted.filter(p => p.score === topScore);
    const winner     = sorted[0];

    // Only the host writes the winner to Supabase.
    // The declareWinners script picks it up and calls declareWinner on-chain.
    if (isHost) {
      if (tied.length === 1) {
        await finishMatch(match.id, winner.wallet_address);
      } else {
        // Full tie — pick by fastest avg reaction time
        const fastest = tied.sort(
          (a, b) => (a.avg_reaction_time || 9999) - (b.avg_reaction_time || 9999)
        )[0];
        await finishMatch(match.id, fastest.wallet_address);
      }
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
      {/* HUD */}
      <div className="game-hud">
        <div className="hud-item score"><Zap size={16} /><span>{gameState.score}</span></div>
        <div className="hud-item timer">
          <Clock size={16} />
          <span className={gameState.timeLeft <= 10 ? 'urgent' : ''}>{gameState.timeLeft}s</span>
        </div>
        <div className="hud-item combo"><Target size={16} /><span>x{gameState.combo}</span></div>
      </div>

      {/* Opponent scores */}
      <div className="opponents-bar">
        {opponents
          .filter(p => p.wallet_address !== address)
          .map(p => (
            <div key={p.id} className="opponent-score">
              <span className="opp-name">{formatWallet(p.wallet_address)}</span>
              <span className="opp-score">{p.score || 0}</span>
            </div>
          ))}
      </div>

      {/* Game area */}
      <div className="game-play-area">
        {!gameStarted && (
          <div className="game-countdown-overlay">
            <div className="big-text">GET READY!</div>
            <p style={{ fontSize: '0.82rem', opacity: 0.7, marginTop: '0.5rem' }}>
              Starting in 3 seconds...
            </p>
          </div>
        )}

        {gameState.targets.map(target => {
          const progress = (Date.now() - target.spawnedAt) / target.lifetime;
          const opacity  = Math.max(0.25, 1 - progress * 0.75);
          const scale    = 1 - progress * 0.3;
          return (
            <button
              key={target.id}
              className={`game-target target-${target.type}`}
              style={{
                left:            `${target.x}px`,
                top:             `${target.y}px`,
                width:           target.size,
                height:          target.size,
                opacity,
                transform:       `scale(${scale})`,
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
            <span className="hit-score">
              {lastHitEffect.score > 0 ? '+' : ''}{lastHitEffect.score}
            </span>
            <span className="hit-label">{lastHitEffect.quality.toUpperCase()}</span>
          </div>
        )}

        {!gameState.isActive && gameStarted && (
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