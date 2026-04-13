import { useState } from 'react';
import { Trophy, Medal, Star, ArrowLeft, Zap, Target } from 'lucide-react';
import { formatWallet } from '../lib/blockchain';
import WinShareCard from './WinShareCard';

export default function GameResults({ results, match, onBackToLobby }) {
  const { allPlayers, winner, isWinner, prizePool, score, hits, perfectHits, maxCombo } = results;
  const [showCard, setShowCard] = useState(false);

  const pool   = parseFloat(prizePool || 0);
  const payout = (pool * 0.95).toFixed(4);

  return (
    <div className="game-results">
      <div className="results-card">
        <div className={`winner-banner ${isWinner ? 'you-won' : ''}`}>
          {isWinner ? (
            <>
              <Trophy size={48} className="trophy-icon" />
              <h1>YOU WIN!</h1>
              <p className="prize-won">🏆 {payout} ETH</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                Go to Dashboard to claim your prize
              </p>

              {/* Share Win button — only shown to winner */}
              <button
                className="share-win-btn"
                onClick={() => setShowCard(true)}
              >
                🎉 Share Your Win
              </button>
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
            <div className="stat-card">
              <Zap size={18} />
              <span className="stat-val">{score}</span>
              <span className="stat-lbl">Score</span>
            </div>
            <div className="stat-card">
              <Target size={18} />
              <span className="stat-val">{hits}</span>
              <span className="stat-lbl">Hits</span>
            </div>
            <div className="stat-card">
              <Star size={18} />
              <span className="stat-val">{perfectHits}</span>
              <span className="stat-lbl">Perfect</span>
            </div>
            <div className="stat-card">
              <span className="stat-val">x{maxCombo}</span>
              <span className="stat-lbl">Best Combo</span>
            </div>
          </div>
        </div>

        <div className="results-leaderboard">
          <h3>Final Rankings</h3>
          {(allPlayers || []).map((p, i) => (
            <div
              key={p.id || i}
              className={`rank-row ${p.wallet_address === winner ? 'is-winner' : ''}`}
            >
              <span className="rank-pos">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </span>
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

      {/* Win share card modal */}
      {showCard && isWinner && (
        <WinShareCard
          results={{ ...results, prizePool: pool }}
          match={match}
          onClose={() => setShowCard(false)}
        />
      )}
    </div>
  );
}