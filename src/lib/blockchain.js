import { ethers } from 'ethers';

// ─── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = import.meta.env.VITE_BASE_RPC || 'https://mainnet.base.org';
export const provider = new ethers.JsonRpcProvider(RPC_URL);

export const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT || null;
export const PLATFORM_FEE_PERCENT    = 5;

// ─── Pool Tiers ──────────────────────────────────────────────────────────────
// Entry fees in ETH. Adjust the eth values when ETH price changes.
// Points are awarded per game played (win or lose) — higher pool = more points.
// Points will convert to $HERO airdrop in the future.

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

// Points multiplier for winning vs just playing
export const WIN_POINTS_MULTIPLIER = 2; // Winners get 2x points

// ─── Escrow ABI ──────────────────────────────────────────────────────────────

const ESCROW_ABI = [
  'function createMatch(bytes32 matchId, uint256 maxPlayers) external payable',
  'function joinMatch(bytes32 matchId) external payable',
  'function claimPrize(bytes32 matchId) external',
  'function getMatch(bytes32 matchId) external view returns (address host, uint256 entryFee, uint256 maxPlayers, uint256 playerCount, uint256 totalDeposited, address winner, uint8 status, bool prizeClaimed)',
  'function getPlayers(bytes32 matchId) external view returns (address[10])',
  'function getContractBalance() external view returns (uint256)',
];

// ─── UUID → bytes32 ──────────────────────────────────────────────────────────

export const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padEnd(64, '0');
};

// ─── walletClient → ethers signer ────────────────────────────────────────────

export const walletClientToSigner = async (walletClient) => {
  const { account, chain, transport } = walletClient;
  const network = { chainId: chain.id, name: chain.name };
  const ethersProvider = new ethers.BrowserProvider(transport, network);
  return ethersProvider.getSigner(account.address);
};

// ─── Contract instance ────────────────────────────────────────────────────────

const getEscrowContract = (signerOrProvider) => {
  if (!ESCROW_CONTRACT_ADDRESS) throw new Error('VITE_ESCROW_CONTRACT not set in .env');
  return new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signerOrProvider);
};

// ─── ETH Balance ─────────────────────────────────────────────────────────────

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

// ─── Validate Balance ─────────────────────────────────────────────────────────

export const validateEntryBalance = async (address, tierKey = 'bronze') => {
  const tier    = getTierByKey(tierKey);
  const balance = await getEthBalance(address);
  const required = parseFloat(tier.eth) + 0.001; // entry + gas buffer
  return {
    hasEnough: balance >= required,
    balance:   parseFloat(balance.toFixed(6)),
    required:  parseFloat(tier.eth),
    tierLabel: tier.label,
  };
};

// ─── Create Match On-chain ────────────────────────────────────────────────────

export const createMatchOnChain = async (walletClient, matchId, maxPlayers, tierKey = 'bronze') => {
  try {
    const tier          = getTierByKey(tierKey);
    const entryFeeWei   = ethers.parseEther(tier.eth);
    const matchIdBytes32 = uuidToBytes32(matchId);

    const signer   = await walletClientToSigner(walletClient);
    const contract = getEscrowContract(signer);

    const tx      = await contract.createMatch(matchIdBytes32, maxPlayers, { value: entryFeeWei });
    const receipt = await tx.wait();

    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('createMatchOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

// ─── Join Match On-chain ──────────────────────────────────────────────────────

export const joinMatchOnChain = async (walletClient, matchId, tierKey = 'bronze') => {
  try {
    const tier           = getTierByKey(tierKey);
    const entryFeeWei    = ethers.parseEther(tier.eth);
    const matchIdBytes32 = uuidToBytes32(matchId);

    const signer   = await walletClientToSigner(walletClient);
    const contract = getEscrowContract(signer);

    const tx      = await contract.joinMatch(matchIdBytes32, { value: entryFeeWei });
    const receipt = await tx.wait();

    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('joinMatchOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

// ─── Claim Prize On-chain ─────────────────────────────────────────────────────

export const claimPrizeOnChain = async (walletClient, matchId) => {
  try {
    const matchIdBytes32 = uuidToBytes32(matchId);
    const signer         = await walletClientToSigner(walletClient);
    const contract       = getEscrowContract(signer);

    const tx      = await contract.claimPrize(matchIdBytes32);
    const receipt = await tx.wait();

    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('claimPrizeOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

// ─── Read Escrow State ────────────────────────────────────────────────────────

export const getMatchOnChain = async (matchId) => {
  try {
    const matchIdBytes32 = uuidToBytes32(matchId);
    const contract       = getEscrowContract(provider);
    const data           = await contract.getMatch(matchIdBytes32);
    return {
      host:           data[0],
      entryFee:       ethers.formatEther(data[1]),
      maxPlayers:     Number(data[2]),
      playerCount:    Number(data[3]),
      totalDeposited: ethers.formatEther(data[4]),
      winner:         data[5],
      status:         Number(data[6]),
      prizeClaimed:   data[7],
    };
  } catch (err) {
    console.error('getMatchOnChain failed:', err);
    return null;
  }
};

// ─── Format Helpers ───────────────────────────────────────────────────────────

export const formatWallet = (address) => {
  if (!address) return '';
  const str = String(address);
  if (str.length <= 12) return str;
  return `${str.slice(0, 6)}....${str.slice(-4)}`;
};

export const formatEth = (wei) => {
  if (!wei) return '0';
  return parseFloat(ethers.formatEther(wei.toString())).toFixed(4);
};

export const ethToUsd = (eth, ethPrice = 2500) => {
  return (parseFloat(eth) * ethPrice).toFixed(2);
};