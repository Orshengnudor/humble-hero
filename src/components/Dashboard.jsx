import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getClaimableWins, markPrizeClaimed } from '../lib/supabase';
import { formatWallet, POOL_TIERS, PLATFORM_FEE_PERCENT } from '../lib/solana';
import { Trophy, Gift, Clock, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const { publicKey } = useWallet();
  const [claimable, setClaimable] = useState([]);
  const [claiming, setClaiming] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (publicKey) loadClaimable();
  }, [publicKey]);

  const loadClaimable = async () => {
    setLoading(true);
    try {
      const data = await getClaimableWins(publicKey.toBase58());
      setClaimable(data);
    } catch (err) {
      console.error('Failed to load claimable:', err);
    }
    setLoading(false);
  };

  const handleClaim = async (match) => {
    setClaiming(match.id);
    try {
      const platformFee = match.prize_pool * (PLATFORM_FEE_PERCENT / 100);
      const payout = match.prize_pool - platformFee;

      // In production: bags.fm fee sharing mechanism handles this
      // For now, mark as claimed and log the payout
      console.log(`💰 Claiming ${payout.toFixed(4)} SOL (${PLATFORM_FEE_PERCENT}% platform fee via bags.fm)`);

      await markPrizeClaimed(match.id, `claim-${Date.now()}`);
      await loadClaimable();
    } catch (err) {
      console.error('Claim failed:', err);
    }
    setClaiming(null);
  };

  if (!publicKey) {
    return (
      <div className="dashboard">
        <div className="no-data"><p>Connect your wallet to view your dashboard.</p></div>
      </div>
    );
  }

  const totalClaimable = claimable.reduce((sum, m) => {
    const fee = m.prize_pool * (PLATFORM_FEE_PERCENT / 100);
    return sum + (m.prize_pool - fee);
  }, 0);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <Trophy size={24} />
        <h2>Your Dashboard</h2>
      </div>

      <div className="dashboard-summary">
        <div className="summary-card">
          <Gift size={20} />
          <span className="summary-val">{claimable.length}</span>
          <span className="summary-lbl">Unclaimed Wins</span>
        </div>
        <div className="summary-card">
          <Trophy size={20} />
          <span className="summary-val">{totalClaimable.toFixed(4)}</span>
          <span className="summary-lbl">SOL to Claim</span>
        </div>
      </div>

      {loading ? (
        <div className="no-data"><p>Loading...</p></div>
      ) : claimable.length === 0 ? (
        <div className="no-data"><p>No prizes to claim. Win a match to earn SOL!</p></div>
      ) : (
        <div className="claim-list">
          {claimable.map(match => {
            const tierInfo = POOL_TIERS[match.tier] || POOL_TIERS.basic;
            const platformFee = match.prize_pool * (PLATFORM_FEE_PERCENT / 100);
            const payout = match.prize_pool - platformFee;
            return (
              <div key={match.id} className="claim-card">
                <div className="claim-info">
                  <div className="claim-tier">{tierInfo.icon} {tierInfo.name} Pool</div>
                  <div className="claim-details">
                    <span>Pool: {match.prize_pool?.toFixed(4)} SOL</span>
                    <span>Fee: {platformFee.toFixed(4)} SOL ({PLATFORM_FEE_PERCENT}%)</span>
                  </div>
                  <div className="claim-payout">Payout: {payout.toFixed(4)} SOL</div>
                  <div className="claim-date">
                    <Clock size={12} /> {new Date(match.finished_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="claim-btn"
                  onClick={() => handleClaim(match)}
                  disabled={claiming === match.id}
                >
                  {claiming === match.id ? 'Claiming...' : 'Claim'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
