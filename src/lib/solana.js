import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// === CONFIG FOR TESTING (Easy to change later) ===
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com'; // or use devnet: 'https://api.devnet.solana.com' for even cheaper tests

export const connection = new Connection(SOLANA_RPC, 'confirmed');

// Use YOUR wallet address here as the platform/escrow wallet
// This is where the small test SOL fees will go during "entry fee" payment
const YOUR_PLATFORM_WALLET = '62hsHB81wV7xyYoU7SD1wjeuQdbKygPw7gFVTxnWZpWA';   // ←←← CHANGE THIS

export const PLATFORM_WALLET = new PublicKey(YOUR_PLATFORM_WALLET);

// We are NOT using $HERO token yet → use SOL as placeholder
export const ENTRY_FEE_HERO = 0.001;        // Very small SOL amount for testing (0.001 SOL)
export const PLATFORM_FEE_PERCENT = 5;

// Dummy mint just to avoid errors (we won't actually use it for transfers yet)
const DUMMY_MINT = 'So11111111111111111111111111111111111111112'; // Wrapped SOL
export const HERO_TOKEN_MINT = new PublicKey(DUMMY_MINT);

// =================================================

// Get SOL balance (used for testing)
export const getSolBalance = async (publicKey) => {
  try {
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error('Error fetching SOL balance:', err);
    return 0;
  }
};

// Fake HERO balance → always returns enough for testing
export const getHeroBalance = async (publicKey) => {
  return 1000; // Always enough during testing
};

// Validate entry (always passes during testing)
export const validateEntryBalance = async (publicKey) => {
  return {
    hasEnough: true,
    balance: 1000,
    required: ENTRY_FEE_HERO,
  };
};

// Pay entry fee → sends tiny amount of SOL to your platform wallet
export const payEntryFee = async (wallet, escrowWallet) => {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const targetPubkey = escrowWallet 
      ? new PublicKey(escrowWallet) 
      : PLATFORM_WALLET;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: targetPubkey,
        lamports: Math.floor(ENTRY_FEE_HERO * LAMPORTS_PER_SOL), // e.g. 0.001 SOL
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    const signed = await wallet.signTransaction(transaction);
    const txId = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(txId, 'confirmed');

    console.log(`✅ Test entry fee paid. Tx: ${txId}`);
    return { success: true, txId };
  } catch (err) {
    console.error('Entry fee payment failed:', err);
    return { success: false, error: err.message };
  }
};

// Prize distribution (just logs for now)
export const distributePrize = async (winnerWallet, prizeAmount) => {
  console.log(`🏆 Prize of ${prizeAmount} would go to ${winnerWallet}`);
  return { success: true, amount: prizeAmount };
};

// Format wallet
export const formatWallet = (address) => {
  if (!address) return '';
  const str = typeof address === 'string' ? address : address.toBase58();
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
};