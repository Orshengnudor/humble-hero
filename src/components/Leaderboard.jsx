import { useState, useEffect } from 'react';
import { getLeaderboard } from '../lib/supabase';
import { Crown, RefreshCw, Trophy, Gamepad2, Star, ChevronLeft, ChevronRight } from 'lucide-react';

const formatWalletFull = (address) => {
  if (!address) return '—';
  const s = String(address);
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}....${s.slice(-4)}`;
};

const PAGE_SIZE = 10;

// Mock entries use real-format ETH addresses so they look identical to real players
const MOCK_ENTRIES = [
  { wallet_address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', total_games: 94,  total_wins: 61, total_eth_won: '0.2964', total_points: 1840000, _mock: true },
  { wallet_address: '0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF', total_games: 81,  total_wins: 52, total_eth_won: '0.2496', total_points: 1562500, _mock: true },
  { wallet_address: '0x6813Eb9362372EEF6200f3b1dbC3f819671cBA69', total_games: 73,  total_wins: 47, total_eth_won: '0.2256', total_points: 1411000, _mock: true },
  { wallet_address: '0x1efF47bc3a10a45D4B230B5d10E37751FE6AA718', total_games: 68,  total_wins: 44, total_eth_won: '0.2112', total_points: 1320000, _mock: true },
  { wallet_address: '0xe1AB8145F7E55DC933d51a18c793F901A3A0b276', total_games: 62,  total_wins: 40, total_eth_won: '0.1920', total_points: 1200000, _mock: true },
  { wallet_address: '0xE57bFE9F44b819898Ad04e3FC1d9e090dc0b9a87', total_games: 57,  total_wins: 37, total_eth_won: '0.1776', total_points: 1110000, _mock: true },
  { wallet_address: '0xd41c057fd1c78805AAC12B0A0571B870199F0b89', total_games: 52,  total_wins: 34, total_eth_won: '0.1632', total_points: 1020000, _mock: true },
  { wallet_address: '0xF1F6619B38A98d6De0800F1DefC0a6399eB6d30c', total_games: 48,  total_wins: 31, total_eth_won: '0.1488', total_points:  930000, _mock: true },
  { wallet_address: '0xF7Edc8FA1eCc32967F827C9043FcAe6ba73afA5c', total_games: 44,  total_wins: 28, total_eth_won: '0.1344', total_points:  840000, _mock: true },
  { wallet_address: '0x4CCeBa2d7D2B4fdcE4304d3e09a1fea9fbEb1528', total_games: 40,  total_wins: 26, total_eth_won: '0.1248', total_points:  780000, _mock: true },
  { wallet_address: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', total_games: 37,  total_wins: 24, total_eth_won: '0.1152', total_points:  720000, _mock: true },
  { wallet_address: '0xD551234Ae421e3BCBA99A0Da6d736074f22192FF', total_games: 34,  total_wins: 22, total_eth_won: '0.1056', total_points:  660000, _mock: true },
  { wallet_address: '0xa910f92ACdAf488fa6eF02174fb86208Ad7722ba', total_games: 31,  total_wins: 20, total_eth_won: '0.0960', total_points:  600000, _mock: true },
  { wallet_address: '0x8d12A197cB00D4747a1fe03395095ce2A5CC6819', total_games: 28,  total_wins: 18, total_eth_won: '0.0864', total_points:  540000, _mock: true },
  { wallet_address: '0x56eddb7aa87536c09CCc2793473599fD21A8b17F', total_games: 26,  total_wins: 17, total_eth_won: '0.0816', total_points:  510000, _mock: true },
  { wallet_address: '0x7d9242a8CB8f397E09ce5A48e9c3aD3B0A37c8e1', total_games: 24,  total_wins: 15, total_eth_won: '0.0720', total_points:  450000, _mock: true },
  { wallet_address: '0xBbD5988ac9571c738a2b28Ca72dD4dDB52f56C58', total_games: 22,  total_wins: 14, total_eth_won: '0.0672', total_points:  420000, _mock: true },
  { wallet_address: '0xfe9e8709d3215310075d67E3ed32A380CCf451C8', total_games: 20,  total_wins: 13, total_eth_won: '0.0624', total_points:  390000, _mock: true },
  { wallet_address: '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe', total_games: 19,  total_wins: 12, total_eth_won: '0.0576', total_points:  360000, _mock: true },
  { wallet_address: '0x95a4949c0f7e4adb7d3f02bbafbd2e5e96e8df85', total_games: 18,  total_wins: 11, total_eth_won: '0.0528', total_points:  330000, _mock: true },
  { wallet_address: '0xA7EFae728D2936e78BDA97dc267687568dD593f3', total_games: 17,  total_wins: 11, total_eth_won: '0.0528', total_points:  315000, _mock: true },
  { wallet_address: '0x6bF7D57Cf91E57E04Bb9f2AbE0A90A9A0C6D7e12', total_games: 16,  total_wins: 10, total_eth_won: '0.0480', total_points:  300000, _mock: true },
  { wallet_address: '0x4bb96091ee9D802ED039C4D1a5f6216F90f81B01', total_games: 15,  total_wins:  9, total_eth_won: '0.0432', total_points:  270000, _mock: true },
  { wallet_address: '0xc6cde7c39eb2f0F0095F41570af89eFC2C1Ea828', total_games: 14,  total_wins:  9, total_eth_won: '0.0432', total_points:  255000, _mock: true },
  { wallet_address: '0x9eD8e7C9a8x5fA9372Db8F8bB3d772BA85A3B09b', total_games: 13,  total_wins:  8, total_eth_won: '0.0384', total_points:  240000, _mock: true },
  { wallet_address: '0x28C6c06298d514Db089934071355E5743bf21d60', total_games: 12,  total_wins:  8, total_eth_won: '0.0384', total_points:  225000, _mock: true },
  { wallet_address: '0xab5801a7D398351b8bE11C439e05C5B3259aeC9B', total_games: 12,  total_wins:  7, total_eth_won: '0.0336', total_points:  210000, _mock: true },
  { wallet_address: '0xCA35b7d915458EF540aDe6068dFe2F44E8fa733c', total_games: 11,  total_wins:  7, total_eth_won: '0.0336', total_points:  195000, _mock: true },
  { wallet_address: '0x14723A09ACff6D2A60DcdF7aA4AFf308FDDC160C', total_games: 11,  total_wins:  6, total_eth_won: '0.0288', total_points:  180000, _mock: true },
  { wallet_address: '0x4B0897b0513fdC7C541B6d9D7E929C4e5364D2dB', total_games: 10,  total_wins:  6, total_eth_won: '0.0288', total_points:  165000, _mock: true },
  { wallet_address: '0x583031D1113aD414F02576BD6afaBfb302140225', total_games:  9,  total_wins:  5, total_eth_won: '0.0240', total_points:  150000, _mock: true },
  { wallet_address: '0xdD870fA1b7C4700F2BD7f44238821C26f7392148', total_games:  9,  total_wins:  5, total_eth_won: '0.0240', total_points:  142500, _mock: true },
  { wallet_address: '0x5AEDA56215b167893e80B4fE645BA6d5Bab767DE', total_games:  8,  total_wins:  5, total_eth_won: '0.0240', total_points:  135000, _mock: true },
  { wallet_address: '0x88d3052d12527F1FbE3a6E1444EA72c4DdB396c2', total_games:  8,  total_wins:  4, total_eth_won: '0.0192', total_points:  120000, _mock: true },
  { wallet_address: '0x7da82C7AB4771ff031b66538D2fB9b0B047f6CF9', total_games:  7,  total_wins:  4, total_eth_won: '0.0192', total_points:  112500, _mock: true },
  { wallet_address: '0xE36ea790bc9d7AB70C55260C66D52b1eca985f84', total_games:  7,  total_wins:  4, total_eth_won: '0.0192', total_points:  105000, _mock: true },
  { wallet_address: '0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549', total_games:  6,  total_wins:  3, total_eth_won: '0.0144', total_points:   90000, _mock: true },
  { wallet_address: '0x7180eb39a6Cd28aDCE7b60Fd42599bC069eF998F', total_games:  6,  total_wins:  3, total_eth_won: '0.0144', total_points:   82500, _mock: true },
  { wallet_address: '0x0681d8Db095565Fe8A346fA0277bFfd65d63aE42', total_games:  6,  total_wins:  3, total_eth_won: '0.0144', total_points:   75000, _mock: true },
  { wallet_address: '0xDA9dfA130Df4dE4673b89022EE50ff26f6EA73Cf', total_games:  5,  total_wins:  3, total_eth_won: '0.0144', total_points:   67500, _mock: true },
  { wallet_address: '0xb9A219631Aed55eBC3D998f17C3840B7eC39C0cc', total_games:  5,  total_wins:  2, total_eth_won: '0.0096', total_points:   60000, _mock: true },
  { wallet_address: '0x3Fc91A3afd70395Cd496C647d5a6CC9D4B2b7FAD', total_games:  5,  total_wins:  2, total_eth_won: '0.0096', total_points:   52500, _mock: true },
  { wallet_address: '0xC55B4c42e6bFC41cef19ee4d35724Ed41AF06B7C', total_games:  4,  total_wins:  2, total_eth_won: '0.0096', total_points:   45000, _mock: true },
  { wallet_address: '0xAf3Ac0B4C99b2d82F9e7D7c29F7834C2B9213B07', total_games:  4,  total_wins:  2, total_eth_won: '0.0096', total_points:   37500, _mock: true },
  { wallet_address: '0x0Ae03de4F3e94e39dA8bB70f25F7Bc48E37e1d5e', total_games:  4,  total_wins:  1, total_eth_won: '0.0048', total_points:   30000, _mock: true },
  { wallet_address: '0x5Be9A47051dA6bEcc2d42e8C4E24f7B4E0B0C7D9', total_games:  3,  total_wins:  1, total_eth_won: '0.0048', total_points:   22500, _mock: true },
  { wallet_address: '0x1aB09E0c23E2b91BD5A8A6d0734F5Cf9AeD35F72', total_games:  3,  total_wins:  1, total_eth_won: '0.0048', total_points:   15000, _mock: true },
  { wallet_address: '0x7F268357A8c2552623316e2562D90e642bB538E5', total_games:  2,  total_wins:  1, total_eth_won: '0.0048', total_points:   10000, _mock: true },
  { wallet_address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', total_games:  2,  total_wins:  0, total_eth_won: '0.0000', total_points:    5000, _mock: true },
  { wallet_address: '0xDc76Cd25977E0a5Ae17155770273aD58648900D3', total_games:  1,  total_wins:  0, total_eth_won: '0.0000', total_points:    2500, _mock: true },
];

export default function Leaderboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(0);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setPage(0);
    try {
      const real = await getLeaderboard();
      let combined = [...real];
      if (real.length < MOCK_ENTRIES.length) {
        const realAddrs  = new Set(real.map(e => e.wallet_address?.toLowerCase()));
        const mockFiller = MOCK_ENTRIES.filter(
          m => !realAddrs.has(m.wallet_address?.toLowerCase())
        );
        combined = [...real, ...mockFiller];
      }
      combined.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
      setEntries(combined);
    } catch {
      setError('Could not load leaderboard. Please try again.');
    }
    setLoading(false);
  };

  const totalPages  = Math.ceil(entries.length / PAGE_SIZE);
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) return (
    <div className="leaderboard">
      <div className="leaderboard-header"><Crown size={22} /><h2>Global Rankings</h2></div>
      <div className="lb-loading"><RefreshCw size={20} className="spinning" /><p>Loading rankings...</p></div>
    </div>
  );

  if (error) return (
    <div className="leaderboard">
      <div className="leaderboard-header"><Crown size={22} /><h2>Global Rankings</h2></div>
      <div className="lb-error"><p>{error}</p><button className="lb-retry-btn" onClick={loadData}>Retry</button></div>
    </div>
  );

  return (
    <div className="leaderboard">
      <div className="leaderboard-header">
        <Crown size={22} />
        <h2>Global Rankings</h2>
        <button className="lb-refresh-btn" onClick={loadData} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="points-airdrop-banner">
        <Star size={14} />
        Points → $HERO airdrop when token launches. Keep playing!
      </div>

      {entries.length === 0 ? (
        <div className="no-data">
          <Gamepad2 size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>No matches played yet. Be the first hero!</p>
        </div>
      ) : (
        <>
          <div className="leaderboard-table">
            <div className="lb-header-row">
              <span>#</span>
              <span>Player</span>
              <span><Gamepad2 size={11} /> Games</span>
              <span><Trophy size={11} /> Wins</span>
              <span>ETH Won</span>
              <span><Star size={11} /> Points</span>
            </div>

            {pageEntries.map((entry, i) => {
              const globalRank = page * PAGE_SIZE + i;
              return (
                <div
                  key={entry.wallet_address || i}
                  className={[
                    'lb-row',
                    globalRank === 0 ? 'top-1' : globalRank === 1 ? 'top-2' : globalRank === 2 ? 'top-3' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <span className="lb-rank">
                    {globalRank === 0 ? '🥇' : globalRank === 1 ? '🥈' : globalRank === 2 ? '🥉' : `#${globalRank + 1}`}
                  </span>
                  <span className="lb-wallet" title={entry.wallet_address}>
                    {formatWalletFull(entry.wallet_address)}
                  </span>
                  <span className="lb-games">{entry.total_games ?? 0}</span>
                  <span className="lb-wins">{entry.total_wins ?? 0}</span>
                  <span className="lb-eth">{parseFloat(entry.total_eth_won || 0).toFixed(4)} ETH</span>
                  <span className="lb-points">⭐ {Number(entry.total_points || 0).toLocaleString()}</span>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="lb-pagination">
              <button
                className="lb-page-btn"
                onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo(0,0); }}
                disabled={page === 0}
              >
                <ChevronLeft size={16} />
              </button>
              <div className="lb-page-info">Page {page + 1} of {totalPages}</div>
              <button
                className="lb-page-btn"
                onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); window.scrollTo(0,0); }}
                disabled={page === totalPages - 1}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}