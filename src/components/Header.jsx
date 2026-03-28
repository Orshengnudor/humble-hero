import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { formatWallet } from '../lib/solana';
import { Trophy, Gamepad2, Sun, Moon } from 'lucide-react';

export default function Header({ activeView, setActiveView, prizePool, isDarkMode, toggleDarkMode }) {
  const { publicKey } = useWallet();

  return (
    <header className="game-header">
      <div className="header-left">
        <Gamepad2 size={28} className="text-accent" />
        <h1 className="header-title">Humble Hero</h1>
      </div>

      <nav className="header-nav">
        <button className={`nav-btn ${activeView === 'lobby' ? 'active' : ''}`} onClick={() => setActiveView('lobby')}>Lobby</button>
        <button className={`nav-btn ${activeView === 'leaderboard' ? 'active' : ''}`} onClick={() => setActiveView('leaderboard')}>
          <Trophy size={16} /> Ranks
        </button>
      </nav>

      <div className="header-right">
        {prizePool > 0 && <div className="prize-badge">🏆 {prizePool} $HERO</div>}
        
        <button onClick={toggleDarkMode} className="dark-toggle-btn">
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        
        <WalletMultiButton className="wallet-btn" />
      </div>
    </header>
  );
}