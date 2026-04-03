import { useState, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { getClaimableWins, markPrizeClaimed, recordEthWin } from '../lib/supabase';
import {
  formatWallet,
  claimPrizeOnChain,
  PLATFORM_FEE_PERCENT,
  getEthBalance,
  getTierByKey,
} from '../lib/blockchain';
import {
  Trophy, Gift, Clock, CheckCircle,
  ExternalLink, Wallet, AlertCircle, Shield, Star,
} from 'lucide-react';

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { data: walletClient }   = useWalletClient();

  const [claimable,   setClaimable]   = useState([]);
  const [claiming,    setClaiming]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [txStatus,    setTxStatus]    = useState({});
  const [ethBalance,  setEthBalance]  = useState(0);

  useEffect(() => {
    if (address) {
      loadClaimable();
      getEthBalance(address).then(setEthBalance);
    }
  }, [address]);

  const loadClaimable = async () => {
    setLoading(true);
    try {
      const data = await getClaimableWins(address);
      setClaimable(data);
    } catch (err) {
      console.error('Failed to load claimable:', err);
    }
    setLoading(false);
  };

  const handleClaim = async (match) => {
    if (!walletClient || !address) return;
    setError('');
    setClaiming(match.id);
    setTxStatus(prev => ({ ...prev, [match.id]: 'Approve transaction in wallet...' }));

    try {
      const result = await claimPrizeOnChain(walletClient, match.id);

      if (!result.success) {
        setError(result.error || 'Claim failed. Please try again.');
        setClaiming(null);
        setTxStatus(prev => ({ ...prev, [match.id]: '' }));
        return;
      }

      setTxStatus(prev => ({
        ...prev,
        [match.id]: `Claimed! TX: ${result.txId?.slice(0, 10)}...`,
      }));

      // Calculate what winner received (95% of prize pool)
      const prizePool = parseFloat(match.prize_pool || 0);
      const winnerEth = (prizePool * 0.95).toFixed(6);

      await markPrizeClaimed(match.id, result.txId || '');
      await recordEthWin(address, winnerEth);

      getEthBalance(address).then(setEthBalance);
      await loadClaimable();
    } catch (err) {
      setError(err.message);
    }

    setClaiming(null);
  };

  if (!isConnected) {
    return (
      <div className="dashboard">
        <div className="no-data">
          <Wallet size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>Connect your wallet to view your dashboard.</p>
        </div>
      </div>
    );
  }

  const totalClaimableEth = claimable.reduce((sum, m) => {
    const pool = parseFloat(m.prize_pool || 0);
    return sum + pool * 0.95;
  }, 0);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <Trophy size={22} />
        <h2>Your Dashboard</h2>
      </div>

      {/* Wallet Summary */}
      <div className="wallet-summary-card">
        <div className="wallet-address">
          <span className="waddr-label">Wallet</span>
          <span className="waddr-value" title={address}>
            {formatWallet(address)}
          </span>
        </div>
        <div className="eth-balance-large">
          <span>{ethBalance.toFixed(4)}</span>
          <span className="eth-label">ETH</span>
        </div>
      </div>

      {error && (
        <div className="lobby-error" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Summary */}
      <div className="dashboard-summary">
        <div className="summary-card">
          <Gift size={18} />
          <span className="summary-val">{claimable.length}</span>
          <span className="summary-lbl">Prizes to Claim</span>
        </div>
        <div className="summary-card highlight">
          <Trophy size={18} />
          <span className="summary-val">{totalClaimableEth.toFixed(4)}</span>
          <span className="summary-lbl">ETH to Claim</span>
        </div>
      </div>

      {/* Points Notice */}
      <div className="points-airdrop-notice">
        <Star size={16} />
        <div>
          <strong>Points = Future $HERO Airdrop</strong>
          <p>Every game you play earns points. Winners get 2× points. Points will convert to $HERO tokens when we launch.</p>
        </div>
      </div>

      {/* Claimable Prizes */}
      {loading ? (
        <div className="no-data"><p>Loading prizes...</p></div>
      ) : claimable.length === 0 ? (
        <div className="no-data">
          <Trophy size={32} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <p>No prizes to claim yet.</p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Win a match to earn ETH!</p>
        </div>
      ) : (
        <div className="claim-list">
          <h3 className="claim-section-title">Unclaimed Prizes</h3>
          {claimable.map(match => {
            const pool    = parseFloat(match.prize_pool || 0);
            const fee     = pool * 0.05;
            const payout  = pool * 0.95;
            const tier    = getTierByKey(match.tier || 'bronze');
            const statusMsg = txStatus[match.id];

            return (
              <div key={match.id} className="claim-card">
                <div className="claim-info">
                  <div className="claim-match-id">
                    {tier.icon} {tier.label} Pool — Match #{match.id.slice(0, 8)}
                    {match.declare_tx && (
                      <a
                        href={`https://basescan.org/tx/${match.declare_tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="explorer-link"
                        title="View on Basescan"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  <div className="claim-details">
                    <span>Prize pool: <strong>{pool.toFixed(4)} ETH</strong></span>
                    <span>Platform fee (5%): <strong>{fee.toFixed(4)} ETH</strong></span>
                  </div>
                  <div className="claim-payout">
                    You receive: <strong>{payout.toFixed(4)} ETH</strong>
                  </div>
                  {match.finished_at && (
                    <div className="claim-date">
                      <Clock size={11} /> {new Date(match.finished_at).toLocaleString()}
                    </div>
                  )}
                  {statusMsg && <div className="claim-tx-status">{statusMsg}</div>}
                </div>
                <button
                  className="claim-btn"
                  onClick={() => handleClaim(match)}
                  disabled={claiming === match.id}
                >
                  {claiming === match.id
                    ? 'Claiming...'
                    : <><CheckCircle size={14} /> Claim {payout.toFixed(4)} ETH</>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="escrow-explainer">
        <Shield size={13} />
        ETH is held in a Base smart contract. Claiming sends it directly to your wallet on-chain.
      </div>
    </div>
  );
}