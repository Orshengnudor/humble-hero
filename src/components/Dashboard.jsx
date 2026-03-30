import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getClaimableWins, markPrizeClaimed } from '../lib/supabase';
import { formatWallet, claimPrizeOnChain, PLATFORM_FEE_PERCENT, getSolBalance } from '../lib/blockchain';
import { Trophy, Gift, Clock, CheckCircle, ExternalLink, Wallet, AlertCircle, Shield } from 'lucide-react';

export default function Dashboard() {
  const { publicKey, wallet } = useWallet();
  const [claimable, setClaimable] = useState([]);
  const [claiming, setClaiming] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [txStatus, setTxStatus] = useState({});
  const [solBalance, setSolBalance] = useState(null);

  useEffect(() => {
    if (publicKey) {
      loadClaimable();
      getSolBalance(publicKey).then(setSolBalance);
    }
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
    if (!wallet?.adapter || !publicKey) return;
    setError('');
    setClaiming(match.id);
    setTxStatus(prev => ({ ...prev, [match.id]: 'Approve transaction in wallet...' }));

    try {
      // Call the on-chain claim instruction
      // The smart contract sends (prize - 5%) to winner, 5% to admin automatically
      const result = await claimPrizeOnChain(wallet.adapter, match.id);

      if (!result.success) {
        setError(result.error || 'Transaction failed. Please try again.');
        setClaiming(null);
        setTxStatus(prev => ({ ...prev, [match.id]: '' }));
        return;
      }

      setTxStatus(prev => ({ ...prev, [match.id]: `Claimed! TX: ${result.txId.slice(0, 8)}...` }));

      // Mark claimed in Supabase
      await markPrizeClaimed(match.id, result.txId);

      // Refresh balance and list
      getSolBalance(publicKey).then(setSolBalance);
      await loadClaimable();

    } catch (err) {
      setError(err.message);
    }
    setClaiming(null);
  };

  if (!publicKey) {
    return (
      <div className="dashboard">
        <div className="no-data">
          <Wallet size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>Connect your wallet to view your dashboard.</p>
        </div>
      </div>
    );
  }

  const totalClaimableSol = claimable.reduce((sum, m) => {
    const fee = m.prize_pool * (PLATFORM_FEE_PERCENT / 100);
    return sum + (m.prize_pool - fee);
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
          <span className="waddr-value" title={publicKey.toBase58()}>
            {formatWallet(publicKey.toBase58())}
          </span>
        </div>
        {solBalance !== null && (
          <div className="sol-balance-large">
            <span>{solBalance.toFixed(4)}</span>
            <span className="sol-label">SOL</span>
          </div>
        )}
      </div>

      {error && (
        <div className="lobby-error" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="dashboard-summary">
        <div className="summary-card">
          <Gift size={18} />
          <span className="summary-val">{claimable.length}</span>
          <span className="summary-lbl">Prizes to Claim</span>
        </div>
        <div className="summary-card highlight">
          <Trophy size={18} />
          <span className="summary-val">{totalClaimableSol.toFixed(4)}</span>
          <span className="summary-lbl">SOL Available</span>
        </div>
      </div>

      {/* Claimable Wins */}
      {loading ? (
        <div className="no-data"><p>Loading prizes...</p></div>
      ) : claimable.length === 0 ? (
        <div className="no-data">
          <Trophy size={32} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <p>No prizes to claim yet.</p>
          <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Win a match to earn SOL!</p>
        </div>
      ) : (
        <div className="claim-list">
          <h3 className="claim-section-title">Unclaimed Prizes</h3>
          {claimable.map(match => {
            const platformFee = match.prize_pool * (PLATFORM_FEE_PERCENT / 100);
            const payout = match.prize_pool - platformFee;
            const statusMsg = txStatus[match.id];

            return (
              <div key={match.id} className="claim-card">
                <div className="claim-info">
                  <div className="claim-match-id">
                    Match #{match.id.slice(0, 8)}
                    {match.escrow_pda && (
                      <a
                        href={`https://explorer.solana.com/address/${match.escrow_pda}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="explorer-link"
                        title="View escrow on Solana Explorer"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  <div className="claim-details">
                    <span>Prize pool: <strong>{match.prize_pool?.toFixed(4)} SOL</strong></span>
                    <span>Platform fee: <strong>{platformFee.toFixed(4)} SOL (5%)</strong></span>
                  </div>
                  <div className="claim-payout">
                    You receive: <strong>{payout.toFixed(4)} SOL</strong>
                  </div>
                  <div className="claim-date">
                    <Clock size={11} /> {new Date(match.finished_at).toLocaleString()}
                  </div>
                  {statusMsg && (
                    <div className="claim-tx-status">{statusMsg}</div>
                  )}
                </div>
                <button
                  className="claim-btn"
                  onClick={() => handleClaim(match)}
                  disabled={claiming === match.id}
                >
                  {claiming === match.id ? (
                    'Claiming...'
                  ) : (
                    <><CheckCircle size={14} /> Claim {payout.toFixed(3)} SOL</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="escrow-explainer">
        <Shield size={13} />
        Prize funds are held in a Solana smart contract escrow. Claiming sends the SOL directly to your wallet on-chain.
      </div>
    </div>
  );
}