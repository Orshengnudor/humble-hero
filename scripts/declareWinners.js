import 'dotenv/config';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC_URL          = process.env.BASE_RPC            || 'https://mainnet.base.org';
const ESCROW_ADDRESS   = process.env.ESCROW_CONTRACT_ADDRESS;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

if (!ESCROW_ADDRESS)    { console.error('❌ ESCROW_CONTRACT_ADDRESS not set'); process.exit(1); }
if (!ADMIN_PRIVATE_KEY) { console.error('❌ ADMIN_PRIVATE_KEY not set');       process.exit(1); }

const provider    = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ESCROW_ABI = [
  'function declareWinner(bytes32 matchId, address winner) external',
  'function getMatch(bytes32 matchId) external view returns (address host, uint256 entryFee, uint256 maxPlayers, uint256 playerCount, uint256 totalDeposited, address winner, uint8 status, bool prizeClaimed)',
];

const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, adminWallet);

// ─── UUID → bytes32 ──────────────────────────────────────────────────────────

const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padEnd(64, '0');
};

// ─── Declare Winner ───────────────────────────────────────────────────────────

const declareWinnerOnChain = async (matchId, winnerAddress) => {
  const matchIdBytes32 = uuidToBytes32(matchId);

  console.log(`\n🏆 Declaring winner for match ${matchId.slice(0, 8)}...`);
  console.log(`   Winner: ${winnerAddress}`);

  const tx      = await escrowContract.declareWinner(matchIdBytes32, winnerAddress);
  console.log(`   TX sent: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

  return tx.hash;
};

// ─── Process Matches ──────────────────────────────────────────────────────────

const processFinishedMatches = async () => {
  console.log('\n🔍 Checking for finished matches...');

  const { data: matches, error } = await supabase
    .from('matches')
    .select('*, match_players(*)')
    .eq('status', 'finished')
    .not('winner_wallet', 'is', null)
    .is('declare_tx', null);

  if (error) {
    console.error('Supabase error:', error.message);
    return;
  }

  if (!matches?.length) {
    console.log('   No pending matches.');
    return;
  }

  console.log(`   Found ${matches.length} match(es) to process.`);

  for (const match of matches) {
    try {
      // Verify winner is a registered player
      const players = match.match_players.map(p => p.wallet_address.toLowerCase());
      if (!players.includes(match.winner_wallet.toLowerCase())) {
        console.error(`   ❌ Winner not in player list for match ${match.id.slice(0, 8)}`);
        continue;
      }

      const txHash = await declareWinnerOnChain(match.id, match.winner_wallet);

      await supabase
        .from('matches')
        .update({ declare_tx: txHash })
        .eq('id', match.id);

      console.log(`   ✅ Match ${match.id.slice(0, 8)}... processed`);
    } catch (err) {
      console.error(`   ❌ Match ${match.id.slice(0, 8)} failed:`, err.message);
    }
  }
};

// ─── Start ────────────────────────────────────────────────────────────────────

const start = async () => {
  const network = await provider.getNetwork();
  const balance = await provider.getBalance(adminWallet.address);

  console.log('🚀 Humble Hero Winner Declarer — Base Network');
  console.log(`   Chain:   ${network.name} (${network.chainId})`);
  console.log(`   Admin:   ${adminWallet.address}`);
  console.log(`   Escrow:  ${ESCROW_ADDRESS}`);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance < ethers.parseEther('0.001')) {
    console.warn('\n⚠️  Admin wallet ETH is low. Send at least 0.01 ETH to cover gas fees.');
  }

  await processFinishedMatches();
  setInterval(processFinishedMatches, 15_000);
};

start().catch(console.error);