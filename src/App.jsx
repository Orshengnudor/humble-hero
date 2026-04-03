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
      const tierPoints = tier.points;
      await updateLeaderboard(address, isWinner, results.score, tierPoints);
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

  const renderView = () => {
    switch (activeView) {
      case 'lobby':
        return <Lobby onJoinMatch={handleJoinMatch} />;
      case 'matchmaking':
        return <Matchmaking match={currentMatch} onGameStart={handleGameStart} onLeave={handleLeaveMatch} />;
      case 'game':
        return <GamePlay match={currentMatch} players={matchPlayers} onGameEnd={handleGameEnd} />;
      case 'results':
        return <GameResults results={gameResults} onBackToLobby={handleBackToLobby} />;
      case 'leaderboard':
        return <Leaderboard />;
      case 'dashboard':
        return <Dashboard />;
      default:
        return <Lobby onJoinMatch={handleJoinMatch} />;
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
      <main className="app-main">{renderView()}</main>
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