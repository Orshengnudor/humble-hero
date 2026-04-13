import { useRef, useState } from 'react';
import { formatWallet } from '../lib/blockchain';

export default function WinShareCard({ results, match, onClose }) {
  const cardRef              = useRef(null);
  const [status, setStatus]  = useState(''); // 'downloading' | 'done' | 'copied' | ''

  const payout      = (parseFloat(results.prizePool || 0) * 0.95).toFixed(4);
  const players     = results.allPlayers || [];
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

  // Detect mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // ─── Download ──────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setStatus('downloading');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0b0b1a',
        scale:            2,
        useCORS:          true,
        allowTaint:       true,
        logging:          false,
        removeContainer:  true,
      });

      if (isMobile) {
        // On mobile: open image in new tab so user can long-press to save
        const dataUrl = canvas.toDataURL('image/png');
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(`
            <html><head><title>Your Win Card</title>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{margin:0;background:#0b0b1a;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px}
            img{max-width:100%;border-radius:12px}
            p{color:#aaa;font-family:sans-serif;font-size:13px;text-align:center;padding:0 16px}</style>
            </head><body>
            <img src="${dataUrl}" />
            <p>Long-press the image above to save it to your photos</p>
            </body></html>
          `);
          win.document.close();
        } else {
          // Popup blocked — fall back to share
          await handleShare(canvas);
        }
      } else {
        // Desktop: direct download
        const link    = document.createElement('a');
        link.download = `humble-hero-win-${Date.now()}.png`;
        link.href     = canvas.toDataURL('image/png');
        link.click();
      }

      setStatus('done');
      setTimeout(() => setStatus(''), 2500);
    } catch (err) {
      console.error('Download failed:', err);
      setStatus('');
      // Fall back to text share
      handleShare(null);
    }
  };

  // ─── Share (Web Share API or clipboard fallback) ────────────────────────────
  const handleShare = async (canvas = null) => {
    const text = `⚡ Just won ${payout} ETH on Humble Hero!\n🏆 Beat ${totalPlayers - 1} player${totalPlayers > 2 ? 's' : ''} in the ${tier.label} pool\n🎯 Score: ${winnerScore.toLocaleString()} pts\n\nPlay on Base → humblehero.xyz`;

    // Try sharing image if canvas provided and Web Share API supports files
    if (canvas && navigator.canShare) {
      try {
        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const file = new File([blob], 'humble-hero-win.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'I won on Humble Hero!', text });
          return;
        }
      } catch (_) {}
    }

    // Try text share
    if (navigator.share) {
      try {
        await navigator.share({ title: 'I won on Humble Hero!', text, url: 'https://humblehero.xyz' });
        return;
      } catch (_) {}
    }

    // Final fallback: clipboard
    try {
      await navigator.clipboard.writeText(text + '\nhttps://humblehero.xyz');
      setStatus('copied');
      setTimeout(() => setStatus(''), 2500);
    } catch (_) {
      // Last resort: show text
      prompt('Copy and share this:', text + '\nhttps://humblehero.xyz');
    }
  };

  // ─── Tweet ──────────────────────────────────────────────────────────────────
  const handleTweet = () => {
    const text = encodeURIComponent(
      `⚡ Just won ${payout} ETH on Humble Hero!\n🏆 Beat ${totalPlayers - 1} player${totalPlayers > 2 ? 's' : ''} in the ${tier.label} pool\n🎯 Score: ${winnerScore.toLocaleString()}\n\nPlay → humblehero.xyz @1humblehero`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank');
  };

  const downloadLabel = () => {
    if (status === 'downloading') return '⏳ Preparing...';
    if (status === 'done') return isMobile ? '✅ Opened!' : '✅ Saved!';
    return isMobile ? '⬇ Save Image' : '⬇ Download';
  };

  return (
    <div className="wsc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wsc-modal">

        {/* ── Shareable card ────────────────────────────────────────────── */}
        <div className="wsc-card" ref={cardRef}>
          <div className="wsc-bg-grid" />
          <div className="wsc-glow wsc-glow-1" />
          <div className="wsc-glow wsc-glow-2" />

          <div className="wsc-brand">
            <span className="wsc-bolt">⚡</span>
            <span className="wsc-brand-name">HUMBLE HERO</span>
          </div>

          <div className="wsc-trophy-ring">
            <span className="wsc-trophy-icon">🏆</span>
          </div>

          <div className="wsc-headline">WINNER</div>
          <div className="wsc-subhead">on Base Network</div>

          <div className="wsc-prize-box">
            <div className="wsc-prize-label">PRIZE WON</div>
            <div className="wsc-prize-amount">{payout} ETH</div>
          </div>

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
              <span className="wsc-stat-lbl">POOL</span>
            </div>
            <div className="wsc-stat-divider" />
            <div className="wsc-stat">
              <span className="wsc-stat-val">{results.perfectHits ?? 0}</span>
              <span className="wsc-stat-lbl">PERFECTS</span>
            </div>
          </div>

          <div className="wsc-wallet-row">
            <span className="wsc-wallet-icon">◈</span>
            <span className="wsc-wallet-addr">{formatWallet(results.winner)}</span>
          </div>

          <div className="wsc-footer">
            <span className="wsc-footer-url">humblehero.xyz</span>
            <span className="wsc-footer-tag">Play · Earn · Win ETH</span>
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="wsc-actions">
          <button
            className="wsc-btn wsc-btn-download"
            onClick={handleDownload}
            disabled={status === 'downloading'}
          >
            {downloadLabel()}
          </button>
          <button className="wsc-btn wsc-btn-tweet" onClick={handleTweet}>
            𝕏 Tweet
          </button>
          <button className="wsc-btn wsc-btn-share" onClick={() => handleShare(null)}>
            {status === 'copied' ? '✅ Copied!' : '↑ Share'}
          </button>
        </div>

        {isMobile && (
          <p className="wsc-mobile-hint">
            Tap "Save Image" → long-press the image to save to your photos
          </p>
        )}

        <button className="wsc-close" onClick={onClose}>✕ Close</button>
      </div>
    </div>
  );
}