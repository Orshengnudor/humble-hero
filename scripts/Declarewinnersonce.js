import 'dotenv/config';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL           = process.env.BASE_RPC                || 'https://mainnet.base.org';
const ESCROW_ADDRESS    = process.env.ESCROW_CONTRACT_ADDRESS;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

if (!ESCROW_ADDRESS)    { console.error('ESCROW_CONTRACT_ADDRESS not set'); process.exit(1); }
if (!ADMIN_PRIVATE_KEY) { console.error('ADMIN_PRIVATE_KEY not set');       process.exit(1); }

const provider    = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
const supabase    = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ESCROW_ABI = [
  'function declareWinner(bytes32 matchId, address winner) external',
  'function getMatch(bytes32 matchId) external view returns (address host, uint256 entryFee, uint256 maxPlayers, uint256 playerCount, uint256 totalDeposited, address winner, uint8 status, bool prizeClaimed)',
];

const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, adminWallet);

const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padEnd(64, '0');
};

// ─── Main — runs once then exits ──────────────────────────────────────────────
const run = async () => {
  console.log('Humble Hero — Winner Declarer (one-shot)');
  console.log(`Admin:  ${adminWallet.address}`);
  console.log(`Escrow: ${ESCROW_ADDRESS}`);

  const balance = await provider.getBalance(adminWallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance < ethers.parseEther('0.0005')) {
    console.warn('WARNING: Admin wallet ETH is very low. Top up on Base.');
  }

  // Fetch all finished matches with no declare_tx
  const { data: matches, error } = await supabase
    .from('matches')
    .select('*, match_players(*)')
    .eq('status', 'finished')
    .not('winner_wallet', 'is', null)
    .is('declare_tx', null);

  if (error) {
    console.error('Supabase error:', error.message);
    process.exit(1);
  }

  if (!matches?.length) {
    console.log('No pending matches. Done.');
    process.exit(0);
  }

  console.log(`Found ${matches.length} match(es) to process.`);
  let processed = 0;
  let failed    = 0;

  for (const match of matches) {
    try {
      const players = (match.match_players || []).map(p => p.wallet_address.toLowerCase());
      if (!players.includes(match.winner_wallet.toLowerCase())) {
        console.error(`Winner not in player list for match ${match.id.slice(0, 8)}`);
        await supabase.from('matches').update({ declare_tx: 'invalid-winner' }).eq('id', match.id);
        continue;
      }

      const matchIdBytes32 = uuidToBytes32(match.id);

      // Check on-chain state to avoid double-declaring
      const onChain = await escrowContract.getMatch(matchIdBytes32);
      if (Number(onChain.status) === 2) {
        console.log(`Match ${match.id.slice(0, 8)} already declared on-chain. Syncing...`);
        await supabase.from('matches').update({ declare_tx: 'already-declared' }).eq('id', match.id);
        processed++;
        continue;
      }

      console.log(`Declaring winner for match ${match.id.slice(0, 8)}...`);
      console.log(`  Winner: ${match.winner_wallet}`);

      const tx      = await escrowContract.declareWinner(matchIdBytes32, match.winner_wallet);
      console.log(`  TX sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  Confirmed in block ${receipt.blockNumber}`);

      await supabase.from('matches').update({ declare_tx: tx.hash }).eq('id', match.id);
      processed++;
    } catch (err) {
      console.error(`Failed match ${match.id.slice(0, 8)}:`, err.message);
      failed++;
    }
  }

  console.log(`Done. Processed: ${processed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});