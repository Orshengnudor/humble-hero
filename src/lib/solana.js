import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
export const connection = new Connection(SOLANA_RPC, 'confirmed');

export const PLATFORM_WALLET = new PublicKey('62hsHB81wV7xyYoU7SD1wjeuQdbKygPw7gFVTxnWZpWA');
export const PLATFORM_FEE_PERCENT = 5;

// Pool tiers in SOL (approximate USD values)
export const POOL_TIERS = {
  basic: { name: 'Basic', entrySol: 0.003, usdValue: '$0.50', icon: '🟢', color: '#10b981' },
  mega:  { name: 'Mega',  entrySol: 0.006, usdValue: '$1.00', icon: '🔵', color: '#3b82f6' },
  whale: { name: 'Whale', entrySol: 0.03,  usdValue: '$5.00', icon: '🐳', color: '#f59e0b' },
};

export const PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8, 10];

// Get SOL balance
export const getSolBalance = async (publicKey) => {
  try {
    const balance = await connection.getBalance(publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error('Error fetching SOL balance:', err);
    return 0;
  }
};

// Validate user has enough SOL for entry
export const validateEntryBalance = async (publicKey, entrySol) => {
  const balance = await getSolBalance(publicKey);
  return {
    hasEnough: balance >= entrySol + 0.001, // extra for tx fee
    balance,
    required: entrySol,
  };
};

// Pay entry fee → sends SOL to platform wallet (escrow)
export const payEntryFee = async (wallet, entrySol) => {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: PLATFORM_WALLET,
        lamports: Math.floor(entrySol * LAMPORTS_PER_SOL),
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    const signed = await wallet.signTransaction(transaction);
    const txId = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(txId, 'confirmed');

    console.log(`✅ Entry fee paid: ${entrySol} SOL. Tx: ${txId}`);
    return { success: true, txId };
  } catch (err) {
    console.error('Entry fee payment failed:', err);
    return { success: false, error: err.message };
  }
};

// Distribute prize to winner (platform sends SOL minus fee)
export const distributePrize = async (winnerWallet, prizeAmountSol) => {
  // In production, this would be handled server-side or via bags.fm fee sharing
  console.log(`🏆 Prize of ${prizeAmountSol} SOL pending for ${winnerWallet}`);
  return { success: true, amount: prizeAmountSol };
};

// Format wallet address
export const formatWallet = (address) => {
  if (!address) return '';
  const str = typeof address === 'string' ? address : address.toBase58();
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
};
