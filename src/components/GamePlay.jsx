import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { updatePlayerScore, subscribeToMatch, getMatchPlayers, finishMatch } from '../lib/supabase';
import { formatWallet } from '../lib/solana';
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
  const { publicKey } = useWallet();
  const [gameState, setGameState] = useState(createGameState());
  const [opponents, setOpponents] = useState(initialPlayers);
  const [lastHitEffect, setLastHitEffect] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const gameRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const cleanupTimerRef = useRef(null);
  const tickRef = useRef(null);
  const gsRef = useRef(gameState);
  gsRef.current = gameState;

  const AREA_WIDTH = 320;
  const AREA_HEIGHT = 384;

  // Subscribe to opponent updates
  useEffect(() => {
    const channel = subscribeToMatch(match.id, async () => {
      const data = await getMatchPlayers(match.id);
      setOpponents(data);
    });
    return () => { channel.unsubscribe(); };
  }, [match.id]);

  // Start game
  useEffect(() => {
    const timer = setTimeout(() => {
      setGameStarted(true);
      setGameState(prev => ({ ...prev, isActive: true, timeLeft: ROUND_DURATION_SEC }));
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Game timer
  useEffect(() => {
    if (!gameStarted) return;

    tickRef.current = setInterval(() => {
      setGameState(prev => {
        if (prev.timeLeft <= 1) {
          // Game over
          clearInterval(tickRef.current);
          clearTimeout(spawnTimerRef.current);
          clearInterval(cleanupTimerRef.current);
          handleGameOver({ ...prev, timeLeft: 0, isActive: false });
          return { ...prev, timeLeft: 0, isActive: false };
        }
        return { ...prev, timeLeft: prev.timeLeft - 1 };
      });
    }, 1000);

    return () => clearInterval(tickRef.current);
  }, [gameStarted]);

  // Spawn targets
  useEffect(() => {
    if (!gameStarted || !gameState.isActive) return;

    const scheduleSpawn = () => {
      spawnTimerRef.current = setTimeout(() => {
        setGameState(prev => {
          const target = spawnTarget(prev, AREA_WIDTH, AREA_HEIGHT);
          if (target) {
            return { ...prev, targets: [...prev.targets, target] };
          }
          return prev;
        });
        if (gsRef.current.isActive) scheduleSpawn();
      }, getRandomSpawnInterval());
    };

    scheduleSpawn();
    return () => clearTimeout(spawnTimerRef.current);
  }, [gameStarted, gameState.isActive]);

  // Cleanup expired targets
  useEffect(() => {
    if (!gameStarted) return;

    cleanupTimerRef.current = setInterval(() => {
      setGameState(prev => removeExpiredTargets({ ...prev }));
    }, 200);

    return () => clearInterval(cleanupTimerRef.current);
  }, [gameStarted]);

  // Sync score to Supabase periodically
  useEffect(() => {
    if (!gameStarted || !publicKey) return;

    const syncInterval = setInterval(() => {
      const gs = gsRef.current;
      updatePlayerScore(
        match.id,
        publicKey.toBase58(),
        gs.score,
        getAvgReactionTime(gs)
      );
    }, 2000);

    return () => clearInterval(syncInterval);
  }, [gameStarted, publicKey, match.id]);

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

  const handleGameOver = async (finalState) => {
    if (!publicKey) return;
    
    // Final score sync
    await updatePlayerScore(
      match.id,
      publicKey.toBase58(),
      finalState.score,
      getAvgReactionTime(finalState)
    );

    // Wait a moment for all players to finish
    setTimeout(async () => {
      const allPlayers = await getMatchPlayers(match.id);
      const sorted = allPlayers.sort((a, b) => b.score - a.score);
      const winner = sorted[0];

      // Host determines winner
      if (publicKey.toBase58() === match.host_wallet) {
        await finishMatch(match.id, winner.wallet_address);
      }

      onGameEnd({
        ...finalState,
        allPlayers: sorted,
        winner: winner.wallet_address,
        isWinner: winner.wallet_address === publicKey.toBase58(),
        prizePool: match.prize_pool || match.entry_fee * allPlayers.length,
      });
    }, 2000);
  };

  const myOpponentData = opponents.find(p => p.wallet_address !== publicKey?.toBase58());

  return (
    <div className="gameplay">
      {/* HUD */}
      <div className="game-hud">
        <div className="hud-item score">
          <Zap size={16} />
          <span>{gameState.score}</span>
        </div>
        <div className="hud-item timer">
          <Clock size={16} />
          <span className={gameState.timeLeft <= 5 ? 'urgent' : ''}>
            {gameState.timeLeft}s
          </span>
        </div>
        <div className="hud-item combo">
          <Target size={16} />
          <span>x{gameState.combo}</span>
        </div>
      </div>

      {/* Opponents sidebar */}
      <div className="opponents-bar">
        {opponents
          .filter(p => p.wallet_address !== publicKey?.toBase58())
          .map(p => (
            <div key={p.id} className="opponent-score">
              <span className="opp-name">{formatWallet(p.wallet_address)}</span>
              <span className="opp-score">{p.score || 0}</span>
            </div>
          ))
        }
      </div>

      {/* Game Area */}
      <div className="game-play-area" ref={gameRef}>
        {!gameStarted && (
          <div className="game-countdown-overlay">
            <div className="big-text">GET READY!</div>
          </div>
        )}

        {gameState.targets.map(target => {
          const progress = (Date.now() - target.spawnedAt) / target.lifetime;
          const opacity = Math.max(0.3, 1 - progress * 0.7);
          const scale = 1 - progress * 0.3;

          return (
            <button
              key={target.id}
              className={`game-target target-${target.type}`}
              style={{
                left: target.x,
                top: target.y,
                width: target.size,
                height: target.size,
                opacity,
                transform: `scale(${scale})`,
                backgroundColor: target.color,
              }}
              onClick={() => handleTargetClick(target.id)}
            />
          );
        })}

        {/* Hit effects */}
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

      {/* Bottom stats */}
      <div className="game-bottom-stats">
        <span>Accuracy: {calculateAccuracy(gameState)}%</span>
        <span>Avg: {getAvgReactionTime(gameState)}ms</span>
        <span>Best Combo: x{gameState.maxCombo}</span>
      </div>
    </div>
  );
}
