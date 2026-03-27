// Humble Hero - Reaction Game Engine
// Fast-paced reaction game where players tap targets as quickly as possible

const ROUND_DURATION = 30; // seconds per round
const SPAWN_INTERVAL_MIN = 400; // ms
const SPAWN_INTERVAL_MAX = 1200; // ms
const TARGET_LIFETIME = 2000; // ms before target disappears
const MAX_TARGETS_ON_SCREEN = 5;
const PERFECT_THRESHOLD = 300; // ms for "perfect" reaction
const GOOD_THRESHOLD = 600; // ms for "good" reaction
const COMBO_DECAY_TIME = 2000; // ms before combo resets

// Score multipliers
const SCORE_PERFECT = 100;
const SCORE_GOOD = 50;
const SCORE_OK = 25;
const SCORE_MISS = -10;

// Target types with different point values
const TARGET_TYPES = [
  { type: 'normal', color: '#8b5cf6', points: 1, chance: 0.5, size: 50 },
  { type: 'fast', color: '#f59e0b', points: 2, chance: 0.25, size: 40 },
  { type: 'bonus', color: '#10b981', points: 3, chance: 0.15, size: 35 },
  { type: 'trap', color: '#ef4444', points: -2, chance: 0.1, size: 55 },
];

export const createGameState = () => ({
  targets: [],
  score: 0,
  combo: 0,
  maxCombo: 0,
  hits: 0,
  misses: 0,
  perfectHits: 0,
  totalReactionTime: 0,
  timeLeft: ROUND_DURATION,
  isActive: false,
  round: 1,
  nextTargetId: 0,
});

export const getTargetType = () => {
  const roll = Math.random();
  let cumulative = 0;
  for (const t of TARGET_TYPES) {
    cumulative += t.chance;
    if (roll <= cumulative) return t;
  }
  return TARGET_TYPES[0];
};

export const spawnTarget = (gameState, areaWidth, areaHeight) => {
  if (gameState.targets.length >= MAX_TARGETS_ON_SCREEN) return null;
  
  const targetType = getTargetType();
  const padding = 10;
  const x = padding + Math.random() * (areaWidth - targetType.size - padding * 2);
  const y = padding + Math.random() * (areaHeight - targetType.size - padding * 2);
  
  const target = {
    id: gameState.nextTargetId++,
    x,
    y,
    ...targetType,
    spawnedAt: Date.now(),
    lifetime: TARGET_LIFETIME + Math.random() * 500,
  };
  
  return target;
};

export const hitTarget = (gameState, targetId) => {
  const target = gameState.targets.find(t => t.id === targetId);
  if (!target) return { ...gameState };
  
  const reactionTime = Date.now() - target.spawnedAt;
  
  let scoreGain;
  let hitQuality;
  
  if (target.type === 'trap') {
    scoreGain = SCORE_MISS * 2;
    hitQuality = 'trap';
    gameState.combo = 0;
  } else if (reactionTime <= PERFECT_THRESHOLD) {
    scoreGain = SCORE_PERFECT * target.points;
    hitQuality = 'perfect';
    gameState.combo++;
    gameState.perfectHits++;
  } else if (reactionTime <= GOOD_THRESHOLD) {
    scoreGain = SCORE_GOOD * target.points;
    hitQuality = 'good';
    gameState.combo++;
  } else {
    scoreGain = SCORE_OK * target.points;
    hitQuality = 'ok';
    gameState.combo++;
  }
  
  // Apply combo multiplier
  const comboMultiplier = 1 + Math.floor(gameState.combo / 5) * 0.5;
  scoreGain = Math.round(scoreGain * comboMultiplier);
  
  gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
  gameState.score = Math.max(0, gameState.score + scoreGain);
  gameState.hits++;
  gameState.totalReactionTime += reactionTime;
  gameState.targets = gameState.targets.filter(t => t.id !== targetId);
  
  return {
    ...gameState,
    lastHit: {
      quality: hitQuality,
      score: scoreGain,
      reactionTime,
      combo: gameState.combo,
      x: target.x + target.size / 2,
      y: target.y,
    },
  };
};

export const removeExpiredTargets = (gameState) => {
  const now = Date.now();
  const expired = gameState.targets.filter(t => now - t.spawnedAt > t.lifetime);
  
  if (expired.length > 0) {
    gameState.misses += expired.filter(t => t.type !== 'trap').length;
    gameState.combo = 0;
    gameState.targets = gameState.targets.filter(t => now - t.spawnedAt <= t.lifetime);
  }
  
  return gameState;
};

export const getRandomSpawnInterval = () => {
  return SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
};

export const calculateAccuracy = (gameState) => {
  const total = gameState.hits + gameState.misses;
  if (total === 0) return 0;
  return Math.round((gameState.hits / total) * 100);
};

export const getAvgReactionTime = (gameState) => {
  if (gameState.hits === 0) return 0;
  return Math.round(gameState.totalReactionTime / gameState.hits);
};

export const ROUND_DURATION_SEC = ROUND_DURATION;
