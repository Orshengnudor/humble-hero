import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import WalletProvider from './components/WalletProvider';
import Header from './components/Header';
import Lobby from './components/Lobby';
import Matchmaking from './components/Matchmaking';
import GamePlay from './components/GamePlay';
import GameResults from './components/GameResults';
import Leaderboard from './components/Leaderboard';
import Dashboard from './components/Dashboard';
import Docs from './components/Docs';
import OnboardingTour, { shouldShowTour } from './components/OnboardingTour';
import { updateLeaderboard } from './lib/supabase';
import { getTierByKey } from './lib/blockchain';
import './App.css';

function GameApp() {
  const { address } = useAccount();
  const [activeView,    setActiveView]    = useState('lobby');
  const [currentMatch,  setCurrentMatch]  = useState(null);
  const [matchPlayers,  setMatchPlayers]  = useState([]);
  const [gameResults,   setGameResults]   = useState(null);
  const [prizePool,     setPrizePool]     = useState(0);
  const [showTour,      setShowTour]      = useState(false);
  const [isDarkMode,    setIsDarkMode]    = useState(() => {
    const saved = localStorage.getItem('hh-theme');
    return saved !== null ? saved === 'dark' : true;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('hh-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Show tour to first-time visitors, only on lobby view
  useEffect(() => {
    if (activeView === 'lobby' && shouldShowTour()) {
      const t = setTimeout(() => setShowTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [activeView]);

  const handleJoinMatch = (match) => {
    setCurrentMatch(match);
    setPrizePool(match.prize_pool || match.entry_fee);
    setActiveView('matchmaking');
  };

  const handleGameStart = (match, players) => {
    setCurrentMatch(match);
    setMatchPlayers(players);
    setPrizePool(match.prize_pool || match.entry_fee);
    setActiveView('game');
  };

  const handleGameEnd = async (results) => {
    setGameResults(results);
    setActiveView('results');
    if (address) {
      const isWinner   = results.winner === address;
      const tier       = getTierByKey(currentMatch?.tier || 'bronze');
      await updateLeaderboard(address, isWinner, results.score, tier.points);
    }
  };

  const handleBackToLobby = () => {
    setCurrentMatch(null);
    setMatchPlayers([]);
    setGameResults(null);
    setPrizePool(0);
    setActiveView('lobby');
  };

  const handleLeaveMatch = () => {
    setCurrentMatch(null);
    setPrizePool(0);
    setActiveView('lobby');
  };

  // Docs page — full-page replacement
  if (activeView === 'docs') {
    return <Docs onBack={() => setActiveView('lobby')} />;
  }

  const renderView = () => {
    switch (activeView) {
      case 'lobby':        return <Lobby onJoinMatch={handleJoinMatch} />;
      case 'matchmaking':  return <Matchmaking match={currentMatch} onGameStart={handleGameStart} onLeave={handleLeaveMatch} />;
      case 'game':         return <GamePlay match={currentMatch} players={matchPlayers} onGameEnd={handleGameEnd} />;
      case 'results':      return <GameResults results={gameResults} onBackToLobby={handleBackToLobby} />;
      case 'leaderboard':  return <Leaderboard />;
      case 'dashboard':    return <Dashboard />;
      default:             return <Lobby onJoinMatch={handleJoinMatch} />;
    }
  };

  return (
    <div className="app-container">
      <Header
        activeView={activeView}
        setActiveView={setActiveView}
        prizePool={prizePool}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode(prev => !prev)}
      />

      <main className="app-main">
        {renderView()}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-links">
          <button onClick={() => setActiveView('docs')}>Docs</button>
          <button onClick={() => { setActiveView('docs'); }}>How to Play</button>
          <button onClick={() => setActiveView('docs')}>Terms</button>
          <button onClick={() => setActiveView('docs')}>Privacy</button>
          <a href="mailto:humblehero89@gmail.com">Contact</a>
          <a href="https://x.com/1humblehero" target="_blank" rel="noopener noreferrer">X</a>
        </div>
        <div className="footer-copy">
          © {new Date().getFullYear()} Humble Hero • Built on Base •{' '}
          <button className="footer-tour-btn" onClick={() => setShowTour(true)}>
            Replay Tutorial
          </button>
        </div>
      </footer>

      {/* Onboarding Tour */}
      {showTour && activeView === 'lobby' && (
        <OnboardingTour onDone={() => setShowTour(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <GameApp />
    </WalletProvider>
  );
}