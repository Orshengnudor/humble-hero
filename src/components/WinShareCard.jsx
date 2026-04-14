import { useRef, useState, useEffect } from 'react';
import { formatWallet } from '../lib/blockchain';

export default function WinShareCard({ results, match, onClose }) {
  const cardRef             = useRef(null);
  const [imgSrc, setImgSrc] = useState(null);   // rendered PNG data URL
  const [phase, setPhase]   = useState('card');  // 'card' | 'rendering' | 'image'
  const [copied, setCopied] = useState(false);

  const payout       = (parseFloat(results.prizePool || 0) * 0.95).toFixed(4);
  const players      = results.allPlayers || [];
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
  const tier   = TIER_LABELS[match?.tier || 'bronze'] || TIER_LABELS.bronze;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // ─── Render the card to a PNG ─────────────────────────────────────────────
  const renderCard = async () => {
    setPhase('rendering');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0b0b1a',
        scale:            2,
        useCORS:          true,
        allowTaint:       true,
        logging:          false,
      });
      const dataUrl = canvas.toDataURL('image/png');
      setImgSrc(dataUrl);
      setPhase('image');
    } catch (err) {
      console.error('Render failed:', err);
      setPhase('card');
      alert('Could not render image. Try the Share button instead.');
    }
  };

  // ─── Desktop download ──────────────────────────────────────────────────────
  const downloadDesktop = async () => {
    let url = imgSrc;
    if (!url) {
      try {
        const html2canvas = (await import('html2canvas')).default;
        const canvas = await html2canvas(cardRef.current, {
          backgroundColor: '#0b0b1a', scale: 2, useCORS: true, allowTaint: true, logging: false,
        });
        url = canvas.toDataURL('image/png');
      } catch { return; }
    }
    const a  = document.createElement('a');
    a.href   = url;
    a.download = `humble-hero-win-${Date.now()}.png`;
    a.click();
  };

  // ─── Text share / clipboard ────────────────────────────────────────────────
  const handleShare = async () => {
    const text = `⚡ Just won ${payout} ETH on Humble Hero!\n🏆 Beat ${totalPlayers - 1} player${totalPlayers > 2 ? 's' : ''} in the ${tier.label} pool\n🎯 Score: ${winnerScore.toLocaleString()} pts\n\nPlay on Base → humblehero.xyz @1humblehero`;
    if (navigator.share) {
      try { await navigator.share({ title: 'I won on Humble Hero!', text, url: 'https://humblehero.xyz' }); return; }
      catch (_) {}
    }
    try {
      await navigator.clipboard.writeText(text + '\nhttps://humblehero.xyz');
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      prompt('Copy this to share:', text + '\nhttps://humblehero.xyz');
    }
  };

  const handleTweet = () => {
    const text = encodeURIComponent(
      `⚡ Just won ${payout} ETH on Humble Hero!\n🏆 Beat ${totalPlayers - 1} player${totalPlayers > 2 ? 's' : ''} in the ${tier.label} pool\n🎯 Score: ${winnerScore.toLocaleString()}\n\nPlay → humblehero.xyz @1humblehero`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, '_blank');
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="wsc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wsc-modal">

        {/* Phase: card — the visual card (hidden once rendered to image) */}
        {phase !== 'image' && (
          <div className="wsc-card" ref={cardRef} style={{ opacity: phase === 'rendering' ? 0 : 1, pointerEvents: phase === 'rendering' ? 'none' : 'auto' }}>
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
        )}

        {/* Phase: rendering spinner */}
        {phase === 'rendering' && (
          <div className="wsc-rendering">
            <div className="wsc-spinner" />
            <p>Preparing your card...</p>
          </div>
        )}

        {/* Phase: image — shown after rendering, user can long-press to save */}
        {phase === 'image' && imgSrc && (
          <div className="wsc-image-phase">
            <img
              src={imgSrc}
              alt="Your win card"
              className="wsc-rendered-img"
            />
            {isMobile && (
              <div className="wsc-save-hint">
                👆 Long-press the image above to save it to your photos
              </div>
            )}
          </div>
        )}

        {/* Actions — always visible */}
        <div className="wsc-actions">
          {isMobile ? (
            /* Mobile: show card → render image → long-press to save */
            phase === 'image' ? (
              <button className="wsc-btn wsc-btn-download" onClick={() => { setPhase('card'); setImgSrc(null); }}>
                ← Back to card
              </button>
            ) : (
              <button className="wsc-btn wsc-btn-download" onClick={renderCard} disabled={phase === 'rendering'}>
                {phase === 'rendering' ? '⏳ Rendering...' : '🖼 Get Image'}
              </button>
            )
          ) : (
            /* Desktop: direct download */
            <button className="wsc-btn wsc-btn-download" onClick={downloadDesktop}>
              ⬇ Download
            </button>
          )}

          <button className="wsc-btn wsc-btn-tweet" onClick={handleTweet}>
            𝕏 Tweet
          </button>

          <button className="wsc-btn wsc-btn-share" onClick={handleShare}>
            {copied ? '✅ Copied!' : '↑ Share'}
          </button>
        </div>

        <button className="wsc-close" onClick={onClose}>✕ Close</button>
      </div>
    </div>
  );
}