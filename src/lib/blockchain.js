import { ethers } from 'ethers';

const RPC_URL = import.meta.env.VITE_BASE_RPC || 'https://mainnet.base.org';
export const provider = new ethers.JsonRpcProvider(RPC_URL);

export const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT || null;
export const PLATFORM_FEE_PERCENT    = 5;

export const ENTRY_TIERS = {
  bronze:   { eth: '0.0002', label: '$0.50',  points: 1_000,  icon: '🥉' },
  silver:   { eth: '0.0004', label: '$1',      points: 2_500,  icon: '🥈' },
  gold:     { eth: '0.0008', label: '$2',      points: 6_000,  icon: '🥇' },
  platinum: { eth: '0.002',  label: '$5',      points: 15_000, icon: '💎' },
  diamond:  { eth: '0.004',  label: '$10',     points: 35_000, icon: '💠' },
  elite:    { eth: '0.02',   label: '$50',     points: 75_000, icon: '👑' },
};

export const PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8, 10];
export const getTierByKey   = (key) => ENTRY_TIERS[key] || ENTRY_TIERS.bronze;

const ESCROW_ABI = [
  'function createMatch(bytes32 matchId, uint256 maxPlayers) external payable',
  'function joinMatch(bytes32 matchId) external payable',
  'function cancelMatch(bytes32 matchId) external',
  'function claimPrize(bytes32 matchId) external',
  'function getMatch(bytes32 matchId) external view returns (address host, uint256 entryFee, uint256 maxPlayers, uint256 playerCount, uint256 totalDeposited, address winner, uint8 status, bool prizeClaimed)',
  'function getPlayers(bytes32 matchId) external view returns (address[10])',
  'function getContractBalance() external view returns (uint256)',
];

export const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padEnd(64, '0');
};

export const walletClientToSigner = async (walletClient) => {
  const { account, chain, transport } = walletClient;
  const network        = { chainId: chain.id, name: chain.name };
  const ethersProvider = new ethers.BrowserProvider(transport, network);
  return ethersProvider.getSigner(account.address);
};

const getEscrowContract = (signerOrProvider) => {
  if (!ESCROW_CONTRACT_ADDRESS) throw new Error('VITE_ESCROW_CONTRACT not set in .env');
  return new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signerOrProvider);
};

export const getEthBalance = async (address) => {
  if (!address) return 0;
  try {
    const balance = await provider.getBalance(address);
    return parseFloat(ethers.formatEther(balance));
  } catch (err) {
    console.error('Error fetching ETH balance:', err);
    return 0;
  }
};

export const validateEntryBalance = async (address, tierKey = 'bronze') => {
  const tier     = getTierByKey(tierKey);
  const balance  = await getEthBalance(address);
  const entryFee = parseFloat(tier.eth);
  return {
    hasEnough: balance >= entryFee,
    balance:   parseFloat(balance.toFixed(6)),
    required:  entryFee,
    tierLabel: tier.label,
  };
};

export const createMatchOnChain = async (walletClient, matchId, maxPlayers, tierKey = 'bronze') => {
  try {
    const tier           = getTierByKey(tierKey);
    const entryFeeWei    = ethers.parseEther(tier.eth);
    const matchIdBytes32 = uuidToBytes32(matchId);
    const signer         = await walletClientToSigner(walletClient);
    const contract       = getEscrowContract(signer);
    const tx             = await contract.createMatch(matchIdBytes32, maxPlayers, { value: entryFeeWei });
    const receipt        = await tx.wait();
    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('createMatchOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

export const joinMatchOnChain = async (walletClient, matchId, tierKey = 'bronze') => {
  try {
    const tier           = getTierByKey(tierKey);
    const entryFeeWei    = ethers.parseEther(tier.eth);
    const matchIdBytes32 = uuidToBytes32(matchId);
    const signer         = await walletClientToSigner(walletClient);
    const contract       = getEscrowContract(signer);
    const tx             = await contract.joinMatch(matchIdBytes32, { value: entryFeeWei });
    const receipt        = await tx.wait();
    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('joinMatchOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

// ─── Cancel Match — host gets refund if no one else joined ───────────────────
export const cancelMatchOnChain = async (walletClient, matchId) => {
  try {
    const matchIdBytes32 = uuidToBytes32(matchId);
    const signer         = await walletClientToSigner(walletClient);
    const contract       = getEscrowContract(signer);
    const tx             = await contract.cancelMatch(matchIdBytes32);
    const receipt        = await tx.wait();
    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('cancelMatchOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

// ─── Claim Prize On-chain (Improved with better error messages) ───────────────
export const claimPrizeOnChain = async (walletClient, matchId) => {
  try {
    if (!matchId) throw new Error("matchId is required");

    const matchIdBytes32 = uuidToBytes32(matchId);

    console.log("🔄 Claim attempt started for match:", matchId);
    console.log("   Bytes32:", matchIdBytes32);

    const signer = await walletClientToSigner(walletClient);
    const contract = getEscrowContract(signer);

    // Gas estimation to catch reverts early
    try {
      const gasEstimate = await contract.claimPrize.estimateGas(matchIdBytes32);
      console.log("   Gas estimate successful:", gasEstimate.toString());
    } catch (gasErr) {
      console.error("Gas estimation failed (contract revert):", gasErr);
      
      const errorData = gasErr.data || gasErr.error?.data;
      if (errorData === "0x9cd0e68f") {
        throw new Error("You are not the winner of this match.");
      } else if (errorData === "0x8f4eb604") {
        throw new Error("Prize has already been claimed.");
      } else if (errorData === "0x5e6f9f0e") {
        throw new Error("Match is not yet finished.");
      } else {
        throw new Error("Contract rejected the claim. You may not be the winner or the prize may have already been claimed.");
      }
    }

    const tx = await contract.claimPrize(matchIdBytes32);
    console.log("   Transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("   ✅ Claim successful! Block:", receipt.blockNumber);

    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };

  } catch (err) {
    console.error("claimPrizeOnChain failed:", err);
    return { 
      success: false, 
      error: err.message || "Failed to claim prize" 
    };
  }
};

export const formatWallet = (address) => {
  if (!address) return '';
  const str = String(address);
  if (str.length <= 12) return str;
  return `${str.slice(0, 6)}....${str.slice(-4)}`;
};

export const formatEth = (eth) => parseFloat(eth || 0).toFixed(4);