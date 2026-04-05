import { useAccount } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { Trophy, Gamepad2, Sun, Moon, LayoutDashboard, Star } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getEthBalance } from '../lib/blockchain';
import { supabase } from '../lib/supabase';

export default function Header({ activeView, setActiveView, prizePool, isDarkMode, toggleDarkMode }) {
  const { address, isConnected } = useAccount();
  const [ethBalance, setEthBalance] = useState(0);
  const [userPoints, setUserPoints] = useState(0);

  useEffect(() => {
    if (!address) return;
    getEthBalance(address).then(setEthBalance);

    supabase
      .from('leaderboard')
      .select('total_points')
      .eq('wallet_address', address)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setUserPoints(data.total_points || 0);
      });
  }, [address]);

  return (
    <header className="game-header">
      <div className="header-left">
        <img
          src="/hero-logo.png"
          alt="Humble Hero"
          className="header-logo-img"
          onError={e => { e.target.style.display = 'none'; }}
        />
        <Gamepad2 size={22} className="header-logo-icon" />
        <h1 className="header-title">Humble Hero</h1>
      </div>

      <nav className="header-nav">
        <button
          className={`nav-btn ${activeView === 'lobby' ? 'active' : ''}`}
          onClick={() => setActiveView('lobby')}
        >
          Lobby
        </button>
        <button
          data-tour="dashboard-btn"
          className={`nav-btn ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          <LayoutDashboard size={14} /> Dashboard
        </button>
        <button
          className={`nav-btn ${activeView === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveView('leaderboard')}
        >
          <Trophy size={14} /> Ranks
        </button>
      </nav>

      <div className="header-right">
        {prizePool > 0 && (
          <div className="prize-badge">
            🏆 {parseFloat(prizePool).toFixed(4)} ETH
          </div>
        )}

        {isConnected && userPoints > 0 && (
          <div className="points-badge" title="Points → $HERO airdrop">
            <Star size={13} /> {Number(userPoints).toLocaleString()} pts
          </div>
        )}

        <button
          onClick={toggleDarkMode}
          className="dark-toggle-btn"
          title={isDarkMode ? 'Light mode' : 'Dark mode'}
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <ConnectKitButton />
      </div>
    </header>
  );
}