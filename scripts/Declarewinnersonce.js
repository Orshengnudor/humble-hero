import 'dotenv/config';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL           = process.env.BASE_RPC                || 'https://mainnet.base.org';
const ESCROW_ADDRESS    = process.env.ESCROW_CONTRACT_ADDRESS;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_KEY;

// Validate all required env vars up front
const missing = [];
if (!ESCROW_ADDRESS)    missing.push('ESCROW_CONTRACT_ADDRESS');
if (!ADMIN_PRIVATE_KEY) missing.push('ADMIN_PRIVATE_KEY');
if (!SUPABASE_URL)      missing.push('SUPABASE_URL');
if (!SUPABASE_KEY)      missing.push('SUPABASE_SERVICE_KEY');

if (missing.length > 0) {
  console.error('Missing required secrets:', missing.join(', '));
  console.error('Add them in GitHub → Settings → Secrets and variables → Actions');
  process.exit(1);
}

const provider    = new ethers.JsonRpcProvider(RPC_URL);
const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
const supabase    = createClient(SUPABASE_URL, SUPABASE_KEY);

// Minimal ABI — only what we need, no getMatch to avoid ABI mismatch issues
const ESCROW_ABI = [
  'function declareWinner(bytes32 matchId, address winner) external',
];

const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, adminWallet);

const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padEnd(64, '0');
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const run = async () => {
  console.log('=== Humble Hero Winner Declarer (one-shot) ===');
  console.log(`Admin:   ${adminWallet.address}`);
  console.log(`Escrow:  ${ESCROW_ADDRESS}`);
  console.log(`Network: ${RPC_URL}`);

  // Check admin wallet has ETH for gas
  const balance = await provider.getBalance(adminWallet.address);
  const balEth  = ethers.formatEther(balance);
  console.log(`Balance: ${balEth} ETH`);

  if (parseFloat(balEth) < 0.0005) {
    console.warn('WARNING: Admin wallet ETH is very low. Top up on Base to pay gas.');
  }

  // Fetch finished matches that need on-chain declaration
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, winner_wallet, match_players(wallet_address)')
    .eq('status', 'finished')
    .not('winner_wallet', 'is', null)
    .is('declare_tx', null);

  if (error) {
    console.error('Supabase query failed:', error.message);
    process.exit(1);
  }

  if (!matches?.length) {
    console.log('No pending matches to declare. All done.');
    process.exit(0);
  }

  console.log(`Found ${matches.length} match(es) to process.\n`);

  let processed = 0;
  let failed    = 0;

  for (const match of matches) {
    const shortId = match.id.slice(0, 8);
    try {
      // Verify winner is actually a registered player in this match
      const playerAddrs = (match.match_players || []).map(p => p.wallet_address.toLowerCase());
      if (!playerAddrs.includes(match.winner_wallet.toLowerCase())) {
        console.error(`[${shortId}] Winner ${match.winner_wallet} not in player list — skipping`);
        await supabase.from('matches').update({ declare_tx: 'invalid-winner' }).eq('id', match.id);
        continue;
      }

      const matchIdBytes32 = uuidToBytes32(match.id);
      console.log(`[${shortId}] Declaring winner: ${match.winner_wallet}`);

      const tx      = await escrowContract.declareWinner(matchIdBytes32, match.winner_wallet);
      console.log(`[${shortId}] TX sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`[${shortId}] Confirmed in block ${receipt.blockNumber} ✅`);

      await supabase.from('matches').update({ declare_tx: tx.hash }).eq('id', match.id);
      processed++;

    } catch (err) {
      const msg = err.reason || err.message || String(err);
      console.error(`[${shortId}] Failed: ${msg}`);

      // If already declared on-chain, mark it so we don't retry
      if (msg.includes('already') || msg.includes('0x7bfa4b9f') || msg.includes('InvalidWinner')) {
        await supabase.from('matches').update({ declare_tx: 'already-declared' }).eq('id', match.id);
        console.log(`[${shortId}] Marked as already-declared`);
        processed++;
      } else {
        failed++;
      }
    }
  }

  console.log(`\n=== Done. Processed: ${processed}, Failed: ${failed} ===`);

  // Exit 0 even with some failures so the workflow doesn't show as failed
  // unless ALL matches failed
  if (failed > 0 && processed === 0) {
    process.exit(1);
  }
  process.exit(0);
};

run().catch(err => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});