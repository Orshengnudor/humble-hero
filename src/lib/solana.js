import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Solana connection (mainnet for production)
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
export const connection = new Connection(SOLANA_RPC, 'confirmed');

// $HERO token mint address - UPDATE THIS with your actual token mint
export const HERO_TOKEN_MINT = new PublicKey(
  import.meta.env.VITE_HERO_TOKEN_MINT || '11111111111111111111111111111111'
);

// Platform fee wallet - UPDATE THIS
export const PLATFORM_WALLET = new PublicKey(
  import.meta.env.VITE_PLATFORM_WALLET || '11111111111111111111111111111111'
);

// Entry fee in $HERO tokens (smallest unit)
export const ENTRY_FEE_HERO = 100; // 100 $HERO per match
export const PLATFORM_FEE_PERCENT = 5; // 5% platform fee

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

// Get $HERO token balance (SPL token)
export const getHeroBalance = async (publicKey) => {
  try {
    // For SPL tokens, we need to find the associated token account
    const { value: tokenAccounts } = await connection.getParsedTokenAccountsByOwner(
      publicKey,
      { mint: HERO_TOKEN_MINT }
    );
    
    if (tokenAccounts.length === 0) return 0;
    
    const balance = tokenAccounts[0].account.data.parsed.info.tokenAmount.uiAmount;
    return balance || 0;
  } catch (err) {
    console.error('Error fetching HERO balance:', err);
    return 0;
  }
};

// Validate player has enough $HERO to enter
export const validateEntryBalance = async (publicKey) => {
  const heroBalance = await getHeroBalance(publicKey);
  return {
    hasEnough: heroBalance >= ENTRY_FEE_HERO,
    balance: heroBalance,
    required: ENTRY_FEE_HERO,
  };
};

// Pay entry fee (transfer $HERO to escrow/pool wallet)
// In production, this should be handled by a smart contract or escrow program
export const payEntryFee = async (wallet, escrowWallet) => {
  try {
    if (!wallet.publicKey || !wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }

    // For now, use SOL transfer as placeholder
    // In production: use SPL token transfer to escrow program
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(escrowWallet || PLATFORM_WALLET),
        lamports: 0.001 * LAMPORTS_PER_SOL, // Small SOL fee for gas
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    const signed = await wallet.signTransaction(transaction);
    const txId = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(txId, 'confirmed');

    return { success: true, txId };
  } catch (err) {
    console.error('Entry fee payment failed:', err);
    return { success: false, error: err.message };
  }
};

// Distribute prize pool to winner
export const distributePrize = async (winnerWallet, prizeAmount) => {
  // In production: This would be handled by a Solana program (smart contract)
  // The escrow program would automatically distribute funds
  console.log(`Prize distribution: ${prizeAmount} $HERO → ${winnerWallet}`);
  return { success: true, amount: prizeAmount };
};

// Format wallet address for display
export const formatWallet = (address) => {
  if (!address) return '';
  const str = typeof address === 'string' ? address : address.toBase58();
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
};
