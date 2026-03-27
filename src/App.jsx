import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Buffer } from 'buffer';
import WalletProvider from './components/WalletProvider';
import Header from './components/Header';
import Lobby from './components/Lobby';
import Matchmaking from './components/Matchmaking';
import GamePlay from './components/GamePlay';
import GameResults from './components/GameResults';
import Leaderboard from './components/Leaderboard';
import './App.css';

// Polyfill Buffer for Solana
window.Buffer = Buffer;

function GameApp() {
  const { publicKey } = useWallet();
  const [activeView, setActiveView] = useState('lobby');
  const [currentMatch, setCurrentMatch] = useState(null);
  const [matchPlayers, setMatchPlayers] = useState([]);
  const [gameResults, setGameResults] = useState(null);
  const [prizePool, setPrizePool] = useState(0);

  const handleJoinMatch = (match) => {
    setCurrentMatch(match);
    setPrizePool(match.prize_pool || match.entry_fee);
    setActiveView('matchmaking');
  };

  const handleGameStart = (match, players) => {
    setCurrentMatch(match);
    setMatchPlayers(players);
    setPrizePool(match.prize_pool || match.entry_fee * players.length);
    setActiveView('game');
  };

  const handleGameEnd = (results) => {
    setGameResults(results);
    setActiveView('results');
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
        return (
          <Matchmaking
            match={currentMatch}
            onGameStart={handleGameStart}
            onLeave={handleLeaveMatch}
          />
        );
      case 'game':
        return (
          <GamePlay
            match={currentMatch}
            players={matchPlayers}
            onGameEnd={handleGameEnd}
          />
        );
      case 'results':
        return (
          <GameResults
            results={gameResults}
            onBackToLobby={handleBackToLobby}
          />
        );
      case 'leaderboard':
        return <Leaderboard />;
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
      />
      <main className="app-main">
        {renderView()}
      </main>
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
