import { useState, useEffect } from 'react';
import { getLeaderboard } from '../lib/supabase';
import { Crown, RefreshCw, Trophy, Gamepad2, Star } from 'lucide-react';

const formatWalletFull = (address) => {
  if (!address) return '—';
  const s = String(address);
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}....${s.slice(-4)}`;
};

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeaderboard();
      setEntries(data);
    } catch (err) {
      setError('Could not load leaderboard. Please try again.');
    }
    setLoading(false);
  };

  if (loading) return (
    <div className="leaderboard">
      <div className="leaderboard-header"><Crown size={22} /><h2>Global Rankings</h2></div>
      <div className="lb-loading"><RefreshCw size={20} className="spinning" /><p>Loading rankings...</p></div>
    </div>
  );

  if (error) return (
    <div className="leaderboard">
      <div className="leaderboard-header"><Crown size={22} /><h2>Global Rankings</h2></div>
      <div className="lb-error"><p>{error}</p><button className="lb-retry-btn" onClick={loadData}>Retry</button></div>
    </div>
  );

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <Crown size={22} />
        <h2>Global Rankings</h2>
        <button className="lb-refresh-btn" onClick={loadData} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="points-airdrop-banner">
        <Star size={14} />
        Points → $HERO airdrop when token launches. Keep playing!
      </div>

      {entries.length === 0 ? (
        <div className="no-data">
          <Gamepad2 size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>No matches played yet. Be the first hero!</p>
        </div>
      ) : (
        <div className="leaderboard-table">
          <div className="lb-header-row">
            <span>#</span>
            <span>Player</span>
            <span><Gamepad2 size={11} /> Games</span>
            <span><Trophy size={11} /> Wins</span>
            <span>ETH Won</span>
            <span><Star size={11} /> Points</span>
          </div>

          {entries.map((entry, i) => (
            <div
              key={entry.wallet_address || i}
              className={`lb-row ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}`}
            >
              <span className="lb-rank">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </span>
              <span className="lb-wallet" title={entry.wallet_address}>
                {formatWalletFull(entry.wallet_address)}
              </span>
              <span className="lb-games">{entry.total_games ?? 0}</span>
              <span className="lb-wins">{entry.total_wins ?? 0}</span>
              <span className="lb-eth">
                {parseFloat(entry.total_eth_won || 0).toFixed(4)} ETH
              </span>
              <span className="lb-points">
                ⭐ {Number(entry.total_points || 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}