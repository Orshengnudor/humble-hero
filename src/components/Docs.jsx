import { ArrowLeft, Zap, Trophy, Shield, Star, Mail, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const Section = ({ title, children }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="docs-section">
      <button className="docs-section-header" onClick={() => setOpen(o => !o)}>
        <h2>{title}</h2>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="docs-section-body">{children}</div>}
    </div>
  );
};

export default function Docs({ onBack }) {
  return (
    <div className="docs-page">
      <div className="docs-container">

        {/* Header */}
        <div className="docs-header">
          <button className="docs-back-btn" onClick={onBack}>
            <ArrowLeft size={16} /> Back to Game
          </button>
          <div className="docs-title-block">
            <h1>Humble Hero Docs</h1>
            <p>Everything you need to know about the game, points, prizes and policies.</p>
          </div>
        </div>

        {/* How to Play */}
        <Section title="📖 How to Play">
          <div className="docs-steps">
            <div className="docs-step">
              <div className="docs-step-num">1</div>
              <div>
                <strong>Connect your wallet</strong>
                <p>Connect a Base-compatible wallet (MetaMask, Coinbase Wallet, or any WalletConnect wallet). Make sure you are on the Base network and have some ETH for entry fees and gas.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">2</div>
              <div>
                <strong>Choose a pool tier</strong>
                <p>Select your pool tier based on how much you want to wager. Tiers range from 🥉 Bronze (0.0002 ETH) to 👑 Elite (0.02 ETH). Higher tiers earn more points per game.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">3</div>
              <div>
                <strong>Create or join a match</strong>
                <p>Create a new match and wait for other players, or join an open match. Your entry fee is sent directly to a smart contract on Base — it is locked safely until the game ends.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">4</div>
              <div>
                <strong>Play the game</strong>
                <p>When all players join (or the host starts early), a 60-second reaction round begins. Click the targets as fast as possible. Different target types give different points:</p>
                <ul className="docs-target-list">
                  <li><span className="dot purple" /> Normal — 1× points</li>
                  <li><span className="dot amber" /> Fast — 2× points (smaller, faster)</li>
                  <li><span className="dot green" /> Bonus — 3× points (rare, small)</li>
                  <li><span className="dot red" /> Trap — Avoid! Clicking costs you points</li>
                </ul>
                <p>Hit targets quickly for PERFECT (100pts), GOOD (60pts), or OK (30pts) bonuses. Build combos for multipliers — every 5 hits in a row adds 0.5× to your score.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">5</div>
              <div>
                <strong>Win the prize pool</strong>
                <p>The player with the highest score wins. If players tie, a rematch starts automatically between tied players — lower scorers are eliminated. The winner is declared on-chain by the platform within seconds of the game ending.</p>
              </div>
            </div>
            <div className="docs-step">
              <div className="docs-step-num">6</div>
              <div>
                <strong>Claim your prize</strong>
                <p>Winners can claim their ETH from the Dashboard page. You receive 95% of the total prize pool. The 5% platform fee goes to Humble Hero to keep the game running. Prizes must be claimed within 7 days.</p>
              </div>
            </div>
          </div>

          <div className="docs-info-box">
            <Shield size={15} />
            <p>All entry fees and prize payouts are handled by a smart contract on Base. Humble Hero never holds your funds — the contract does. You can verify all transactions on <a href="https://basescan.org" target="_blank" rel="noopener noreferrer">Basescan</a>.</p>
          </div>
        </Section>

        {/* Pool Tiers */}
        <Section title="💎 Pool Tiers & Points">
          <p className="docs-body-text">Each tier has a different entry fee and points reward. Points accumulate on your account and will convert to $HERO token in the future.</p>
          <div className="docs-tier-table">
            <div className="docs-tier-row header">
              <span>Tier</span>
              <span>Entry Fee</span>
              <span>Points/game</span>
              <span>Winner bonus</span>
            </div>
            {[
              { icon: '🥉', name: 'Bronze',   eth: '0.0002 ETH', pts: '1,000',  bonus: '2,000' },
              { icon: '🥈', name: 'Silver',   eth: '0.0004 ETH', pts: '2,500',  bonus: '5,000' },
              { icon: '🥇', name: 'Gold',     eth: '0.0008 ETH', pts: '6,000',  bonus: '12,000' },
              { icon: '💎', name: 'Platinum', eth: '0.002 ETH',  pts: '15,000', bonus: '30,000' },
              { icon: '💠', name: 'Diamond',  eth: '0.004 ETH',  pts: '35,000', bonus: '70,000' },
              { icon: '👑', name: 'Elite',    eth: '0.02 ETH',   pts: '75,000', bonus: '150,000' },
            ].map(t => (
              <div key={t.name} className="docs-tier-row">
                <span>{t.icon} {t.name}</span>
                <span>{t.eth}</span>
                <span>⭐ {t.pts}</span>
                <span>⭐ {t.bonus}</span>
              </div>
            ))}
          </div>

          <div className="docs-info-box">
            <Star size={15} />
            <p><strong>$HERO Airdrop:</strong> Points you earn now will convert to $HERO tokens when we launch. The more you play and win, the more $HERO you will receive. Points never expire.</p>
          </div>
        </Section>

        {/* Cancellation */}
        <Section title="↩ Cancellations & Refunds">
          <p className="docs-body-text">If you create a match and no other player joins, you can cancel the match and get your entry fee refunded on-chain. The Cancel & Get Refund button appears in the matchmaking screen when you are the only player.</p>
          <p className="docs-body-text">Once another player joins, the match cannot be cancelled and all entry fees are locked until the game ends and a winner is declared.</p>
          <p className="docs-body-text">Prizes must be claimed within 7 days of the match ending. Unclaimed prizes after 7 days are reclaimed by the platform.</p>
        </Section>

        {/* Terms */}
        <Section title="📜 Terms of Service">
          <p className="docs-body-text">Last updated: {new Date().getFullYear()}</p>
          <p className="docs-body-text">By using Humble Hero you agree to these terms. Please read them carefully.</p>
          <h3 className="docs-h3">1. Eligibility</h3>
          <p className="docs-body-text">You must be of legal age in your jurisdiction to participate in games involving real money. You are responsible for ensuring that participating in skill-based wagering games is legal where you live.</p>
          <h3 className="docs-h3">2. Nature of the Game</h3>
          <p className="docs-body-text">Humble Hero is a skill-based reaction game. Winners are determined purely by performance (score), not by chance. All matches are conducted fairly and transparently on the Base blockchain.</p>
          <h3 className="docs-h3">3. Smart Contract</h3>
          <p className="docs-body-text">Entry fees and prize distributions are handled by an auditable smart contract on Base. Humble Hero cannot alter, freeze, or redirect funds held by the contract outside of normal game operations.</p>
          <h3 className="docs-h3">4. Platform Fee</h3>
          <p className="docs-body-text">A 5% platform fee is automatically deducted from the prize pool upon claim. This fee funds platform development and operations.</p>
          <h3 className="docs-h3">5. Points & $HERO</h3>
          <p className="docs-body-text">Points earned in the game are not a financial instrument and have no guaranteed monetary value. The $HERO airdrop is a future plan and is not guaranteed. Humble Hero reserves the right to change the conversion rate or timeline.</p>
          <h3 className="docs-h3">6. Prohibited Conduct</h3>
          <p className="docs-body-text">You may not use bots, scripts, or any automated tools to play the game. Suspected exploits or cheating will result in score invalidation. Humble Hero uses server-side validation to detect suspicious activity.</p>
          <h3 className="docs-h3">7. Disclaimer</h3>
          <p className="docs-body-text">Humble Hero is provided as-is. We are not responsible for losses resulting from network issues, wallet errors, or smart contract bugs. Always verify transactions on Basescan before signing.</p>
        </Section>

        {/* Privacy */}
        <Section title="🔒 Privacy Policy">
          <p className="docs-body-text">Last updated: {new Date().getFullYear()}</p>
          <h3 className="docs-h3">What we collect</h3>
          <p className="docs-body-text">We collect your wallet address (public on-chain), game scores, match history, and points balance. We do not collect your name, email, or any personally identifiable information unless you contact us directly.</p>
          <h3 className="docs-h3">How we use it</h3>
          <p className="docs-body-text">Your wallet address and game data are used to display your stats, leaderboard position, and award points. This data is stored in our database and associated with your wallet address.</p>
          <h3 className="docs-h3">On-chain data</h3>
          <p className="docs-body-text">All transactions on Base are public and permanent. Entry fees, prize claims, and match results are visible on Basescan to anyone.</p>
          <h3 className="docs-h3">Third parties</h3>
          <p className="docs-body-text">We use Supabase for database storage and Vercel for hosting. We do not sell your data to advertisers or third parties.</p>
          <h3 className="docs-h3">Cookies</h3>
          <p className="docs-body-text">We use localStorage to remember your theme preference (dark/light mode) and whether you have completed the onboarding tour. No tracking cookies are used.</p>
        </Section>

        {/* Contact */}
        <Section title="📬 Contact Us">
          <p className="docs-body-text">Have a question, bug report, or partnership inquiry? Reach out through any of the channels below.</p>
          <div className="docs-contact-cards">
            <a href="mailto:humblehero89@gmail.com" className="docs-contact-card">
              <Mail size={22} />
              <div>
                <strong>Email</strong>
                <span>humblehero89@gmail.com</span>
              </div>
            </a>
            <a href="https://x.com/1humblehero" target="_blank" rel="noopener noreferrer" className="docs-contact-card">
              <X size={22} />
              <div>
                <strong>X</strong>
                <span>@1humblehero</span>
              </div>
            </a>
          </div>
        </Section>

        <div className="docs-footer-note">
          © {new Date().getFullYear()} Humble Hero. Built on Base.
        </div>
      </div>
    </div>
  );
}