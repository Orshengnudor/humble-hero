import { Trophy, Medal, Star, ArrowLeft, Zap, Target } from 'lucide-react';
import { formatWallet } from '../lib/solana';

export default function GameResults({ results, onBackToLobby }) {
  const { allPlayers, winner, isWinner, prizePool, score, hits, misses, perfectHits, maxCombo } = results;

  return (
    <div className="game-results">
      <div className="results-card">
        <div className={`winner-banner ${isWinner ? 'you-won' : ''}`}>
          {isWinner ? (
            <>
              <Trophy size={48} className="trophy-icon" />
              <h1>YOU WIN!</h1>
              <p className="prize-won">🏆 {prizePool?.toFixed(4)} SOL</p>
              <p className="claim-hint">Go to Dashboard to claim your prize!</p>
            </>
          ) : (
            <>
              <Medal size={48} />
              <h1>Match Complete</h1>
              <p>Winner: {formatWallet(winner)}</p>
            </>
          )}
        </div>

        <div className="your-stats">
          <h3>Your Performance</h3>
          <div className="stats-grid">
            <div className="stat-card"><Zap size={20} /><span className="stat-val">{score}</span><span className="stat-lbl">Score</span></div>
            <div className="stat-card"><Target size={20} /><span className="stat-val">{hits}</span><span className="stat-lbl">Hits</span></div>
            <div className="stat-card"><Star size={20} /><span className="stat-val">{perfectHits}</span><span className="stat-lbl">Perfect</span></div>
            <div className="stat-card"><span className="stat-val">x{maxCombo}</span><span className="stat-lbl">Best Combo</span></div>
          </div>
        </div>

        <div className="results-leaderboard">
          <h3>Final Rankings</h3>
          {allPlayers.map((p, i) => (
            <div key={p.id} className={`rank-row ${i === 0 ? 'winner' : ''} ${p.wallet_address === winner ? 'is-winner' : ''}`}>
              <span className="rank-pos">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
              <span className="rank-wallet">{formatWallet(p.wallet_address)}</span>
              <span className="rank-score">{p.score} pts</span>
              <span className="rank-reaction">{p.avg_reaction_time || '—'}ms</span>
            </div>
          ))}
        </div>

        <button className="back-btn" onClick={onBackToLobby}>
          <ArrowLeft size={16} /> Back to Lobby
        </button>
      </div>
    </div>
  );
}
