import { useRef, useState } from 'react';
import { formatWallet } from '../lib/blockchain';

// ─── Win Share Card ───────────────────────────────────────────────────────────
// Renders a visually striking win card and offers Download + Share options.
// Pass this the results object from GameResults.
//
// Props:
//   results.winner        — winner wallet address
//   results.prizePool     — total ETH in pool (number or string)
//   results.allPlayers    — array of player objects with wallet_address & score
//   results.perfectHits   — number
//   results.maxCombo      — number
//   match.tier            — tier key e.g. 'bronze'
//   onClose()             — called when user dismisses
//
export default function WinShareCard({ results, match, onClose }) {
  const cardRef   = useRef(null);
  const [copying, setCopying]     = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const payout    = (parseFloat(results.prizePool || 0) * 0.95).toFixed(4);
  const players   = results.allPlayers || [];
  const winnerRank = players.findIndex(p => p.wallet_address === results.winner);
  const totalPlayers = players.length;
  const winnerScore  = players[0]?.score ?? results.score ?? 0;

  const TIER_LABELS = {
    bronze:   { label: 'Bronze',   icon: '🥉' },
    silver:   { label: 'Silver',   icon: '🥈' },
    gold:     { label: 'Gold',     icon: '🥇' },
    platinum: { label: 'Platinum', icon: '💎' },
    diamond:  { label: 'Diamond',  icon: '💠' },
    elite:    { label: 'Elite',    icon: '👑' },
  };
  const tier = TIER_LABELS[match?.tier || 'bronze'] || TIER_LABELS.bronze;

  // ─── Download card as PNG using html2canvas ───────────────────────────────
  const handleDownload = async () => {
    try {
      const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale:           2,
        useCORS:         true,
        logging:         false,
      });
      const link    = document.createElement('a');
      link.download = `humble-hero-win-${Date.now()}.png`;
      link.href     = canvas.toDataURL('image/png');
      link.click();
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } catch (err) {
      console.error('Download failed:', err);
      // Fallback: open share dialog
      handleShare();
    }
  };

  // ─── Web Share API ────────────────────────────────────────────────────────
  const handleShare = async () => {
    const text = `⚡ Just won ${payout} ETH on Humble Hero!\n🏆 Beat ${totalPlayers - 1} player${totalPlayers > 2 ? 's' : ''} in the ${tier.label} pool\n🎯 Score: ${winnerScore.toLocaleString()} pts\n\nPlay on Base → humblehero.xyz`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'I won on Humble Hero!', text, url: 'https://humblehero.xyz' });
      } catch (_) {}
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(text + '\nhttps://humblehero.xyz');
        setCopying(true);
        setTimeout(() => setCopying(false), 2000);
      } catch (_) {}
    }
  };

  // ─── Tweet ────────────────────────────────────────────────────────────────
  const handleTweet = () => {
    const text = encodeURIComponent(
      `⚡ Just won ${payout} ETH on Humble Hero!\n🏆 Beat ${totalPlayers - 1} player${totalPlayers > 2 ? 's' : ''} in the ${tier.label} pool\n🎯 Score: ${winnerScore.toLocaleString()}\n\nPlay → humblehero.xyz @1humblehero`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank');
  };

  return (
    <div className="wsc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wsc-modal">

        {/* ── The shareable card ──────────────────────────────────────────── */}
        <div className="wsc-card" ref={cardRef}>

          {/* Background grid + glow */}
          <div className="wsc-bg-grid" />
          <div className="wsc-glow wsc-glow-1" />
          <div className="wsc-glow wsc-glow-2" />

          {/* Header */}
          <div className="wsc-brand">
            <span className="wsc-bolt">⚡</span>
            <span className="wsc-brand-name">HUMBLE HERO</span>
          </div>

          {/* Trophy */}
          <div className="wsc-trophy-ring">
            <span className="wsc-trophy-icon">🏆</span>
          </div>

          {/* Win headline */}
          <div className="wsc-headline">WINNER</div>
          <div className="wsc-subhead">on Base Network</div>

          {/* Prize */}
          <div className="wsc-prize-box">
            <div className="wsc-prize-label">PRIZE WON</div>
            <div className="wsc-prize-amount">{payout} ETH</div>
          </div>

          {/* Stats row */}
          <div className="wsc-stats">
            <div className="wsc-stat">
              <span className="wsc-stat-val">{winnerScore.toLocaleString()}</span>
              <span className="wsc-stat-lbl">SCORE</span>
            </div>
            <div className="wsc-stat-divider" />
            <div className="wsc-stat">
              <span className="wsc-stat-val">{totalPlayers}</span>
              <span className="wsc-stat-lbl">PLAYERS</span>
            </div>
            <div className="wsc-stat-divider" />
            <div className="wsc-stat">
              <span className="wsc-stat-val">{tier.icon} {tier.label}</span>
              <span className="wsc-stat-lbl">POOL TIER</span>
            </div>
            <div className="wsc-stat-divider" />
            <div className="wsc-stat">
              <span className="wsc-stat-val">{results.perfectHits ?? 0}</span>
              <span className="wsc-stat-lbl">PERFECTS</span>
            </div>
          </div>

          {/* Wallet */}
          <div className="wsc-wallet-row">
            <span className="wsc-wallet-icon">◈</span>
            <span className="wsc-wallet-addr">{formatWallet(results.winner)}</span>
          </div>

          {/* Footer */}
          <div className="wsc-footer">
            <span className="wsc-footer-url">humblehero.xyz</span>
            <span className="wsc-footer-tag">Play · Earn · Win ETH</span>
          </div>
        </div>

        {/* ── Action buttons below the card ───────────────────────────────── */}
        <div className="wsc-actions">
          <button className="wsc-btn wsc-btn-download" onClick={handleDownload}>
            {downloaded ? '✅ Saved!' : '⬇ Download'}
          </button>
          <button className="wsc-btn wsc-btn-tweet" onClick={handleTweet}>
            𝕏 Tweet
          </button>
          <button className="wsc-btn wsc-btn-share" onClick={handleShare}>
            {copying ? '✅ Copied!' : '↑ Share'}
          </button>
        </div>

        <button className="wsc-close" onClick={onClose}>✕ Close</button>
      </div>
    </div>
  );
}