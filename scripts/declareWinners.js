import 'dotenv/config';
/**
 * Humble Hero - Winner Declaration Service
 * Run with: node scripts/declareWinners.js
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';

// ─── Config ──────────────────────────────────────────────────────────────────
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
const connection = new Connection(SOLANA_RPC, 'confirmed');

// Get Program ID safely
let PROGRAM_ID;
try {
  const programIdStr = process.env.PROGRAM_ID;
  if (!programIdStr || programIdStr.length < 32) {
    throw new Error("PROGRAM_ID environment variable is missing or invalid");
  }
  PROGRAM_ID = new PublicKey(programIdStr);
} catch (err) {
  console.error("❌ Invalid PROGRAM_ID:", err.message);
  console.error("Please set PROGRAM_ID in your .env file (the deployed program address)");
  process.exit(1);
}

// Load Admin Keypair safely
let adminKeypair;
try {
  const keypairJson = process.env.ADMIN_KEYPAIR_JSON;
  if (!keypairJson) throw new Error("ADMIN_KEYPAIR_JSON is not set");
  adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson)));
} catch (err) {
  console.error("❌ Failed to load ADMIN_KEYPAIR_JSON:", err.message);
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Helper Functions ────────────────────────────────────────────────────────
const uuidToBytes = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

const getMatchEscrowPDA = (matchIdBytes) => {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('match_escrow'), Buffer.from(matchIdBytes)],
    PROGRAM_ID
  )[0];
};

// ─── Declare Winner On-chain ─────────────────────────────────────────────────
const declareWinnerOnChain = async (matchId, winnerWallet) => {
  const matchIdBytes = uuidToBytes(matchId);
  const escrowPDA = getMatchEscrowPDA(matchIdBytes);
  const winnerPubkey = new PublicKey(winnerWallet);

  console.log(`\n🏆 Processing match ${matchId}`);
  console.log(`   Winner: ${winnerWallet}`);
  console.log(`   Escrow PDA: ${escrowPDA.toBase58()}`);

  const discriminator = Buffer.from([99, 183, 126, 205, 37, 75, 150, 88]); // declare_winner

  const data = Buffer.concat([
    discriminator,
    Buffer.from(matchIdBytes),
    winnerPubkey.toBuffer()
  ]);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: escrowPDA, isSigner: false, isWritable: true },
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = adminKeypair.publicKey;
  tx.sign(adminKeypair);

  const txId = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await connection.confirmTransaction(txId, 'confirmed');

  console.log(`   ✅ Success! TX: ${txId}`);
  return txId;
};

// ─── Main Processor ──────────────────────────────────────────────────────────
const processFinishedMatches = async () => {
  console.log('🔍 Checking for finished matches to declare...');

  const { data: matches, error } = await supabase
    .from('matches')
    .select('*, match_players(*)')
    .eq('status', 'finished')
    .not('winner_wallet', 'is', null)
    .is('declare_tx', null);

  if (error) {
    console.error('Supabase error:', error);
    return;
  }

  if (!matches?.length) {
    console.log('   No pending matches found.');
    return;
  }

  for (const match of matches) {
    try {
      const txId = await declareWinnerOnChain(match.id, match.winner_wallet);

      await supabase
        .from('matches')
        .update({ declare_tx: txId, prize_claimed: false })
        .eq('id', match.id);

      console.log(`   ✅ Match ${match.id.slice(0,8)}... processed`);
    } catch (err) {
      console.error(`   ❌ Failed match ${match.id}:`, err.message);
    }
  }
};

// ─── Start Watcher ───────────────────────────────────────────────────────────
const startWatcher = async () => {
  console.log('🚀 Humble Hero Winner Declarer Started');
  console.log(`   Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`   Admin: ${adminKeypair.publicKey.toBase58()}\n`);

  await processFinishedMatches();
  setInterval(processFinishedMatches, 15000); // every 15 seconds
};

startWatcher().catch(console.error);