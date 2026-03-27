import { useState, useEffect } from 'react';
import { getLeaderboard } from '../lib/supabase';
import { formatWallet } from '../lib/solana';
import { Trophy, Crown, TrendingUp } from 'lucide-react';

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getLeaderboard();
      setEntries(data);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="leaderboard loading">
        <p>Loading rankings...</p>
      </div>
    );
  }

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <Crown size={24} />
        <h2>Global Rankings</h2>
      </div>

      {entries.length === 0 ? (
        <div className="no-data">
          <p>No matches played yet. Be the first!</p>
        </div>
      ) : (
        <div className="leaderboard-table">
          <div className="lb-header-row">
            <span>Rank</span>
            <span>Player</span>
            <span>Wins</span>
            <span>Games</span>
            <span>Score</span>
          </div>
          {entries.map((entry, i) => (
            <div key={entry.id || i} className={`lb-row ${i < 3 ? 'top-3' : ''}`}>
              <span className="lb-rank">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </span>
              <span className="lb-wallet">{formatWallet(entry.wallet_address)}</span>
              <span className="lb-wins">{entry.total_wins}</span>
              <span className="lb-games">{entry.total_games}</span>
              <span className="lb-score">{entry.total_score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
