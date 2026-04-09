import { ethers } from 'ethers';

// ─── Builder Code ERC-8021 ────────────────────────────────────────────────────
// Appended to every transaction calldata for Base attribution tracking.
const BUILDER_CODE = 'bc_qupdabmv';
const ERC_MARKER   = '80218021802180218021802180218021';
const SCHEMA_ID    = '00';

const buildDataSuffix = (code) => {
  const codeHex = Array.from(code)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');
  return codeHex + SCHEMA_ID + ERC_MARKER;
};

const DATA_SUFFIX = buildDataSuffix(BUILDER_CODE);

const appendBuilderCode = (data = '0x') => {
  const base = data.startsWith('0x') ? data.slice(2) : data;
  return '0x' + base + DATA_SUFFIX;
};

// ─── Config ───────────────────────────────────────────────────────────────────
const RPC_URL = import.meta.env.VITE_BASE_RPC || 'https://mainnet.base.org';

export const provider = new ethers.JsonRpcProvider(RPC_URL);

export const ESCROW_CONTRACT_ADDRESS = import.meta.env.VITE_ESCROW_CONTRACT || null;
export const PLATFORM_FEE_PERCENT    = 5;

// ─── Pool Tiers ───────────────────────────────────────────────────────────────
export const ENTRY_TIERS = {
  bronze:   { eth: '0.0002', label: '$0.50', points: 1_000,  icon: '🥉' },
  silver:   { eth: '0.0004', label: '$1',    points: 2_500,  icon: '🥈' },
  gold:     { eth: '0.0008', label: '$2',    points: 6_000,  icon: '🥇' },
  platinum: { eth: '0.002',  label: '$5',    points: 15_000, icon: '💎' },
  diamond:  { eth: '0.004',  label: '$10',   points: 35_000, icon: '💠' },
  elite:    { eth: '0.02',   label: '$50',   points: 75_000, icon: '👑' },
};

export const PLAYER_OPTIONS = [2, 3, 4, 5, 6, 8, 10];
export const getTierByKey   = (key) => ENTRY_TIERS[key] || ENTRY_TIERS.bronze;

// ─── Escrow ABI ───────────────────────────────────────────────────────────────
const ESCROW_ABI = [
  'function createMatch(bytes32 matchId, uint256 maxPlayers) external payable',
  'function joinMatch(bytes32 matchId) external payable',
  'function cancelMatch(bytes32 matchId) external',
  'function claimPrize(bytes32 matchId) external',
  'function getMatch(bytes32 matchId) external view returns (address host, uint256 entryFee, uint256 maxPlayers, uint256 playerCount, uint256 totalDeposited, address winner, uint8 status, bool prizeClaimed)',
  'function getPlayers(bytes32 matchId) external view returns (address[10])',
  'function getContractBalance() external view returns (uint256)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  return '0x' + hex.padEnd(64, '0');
};

export const walletClientToSigner = async (walletClient) => {
  const { account, chain, transport } = walletClient;
  const ethersProvider = new ethers.BrowserProvider(transport, { chainId: chain.id, name: chain.name });
  return ethersProvider.getSigner(account.address);
};

const getEscrowContract = (signerOrProvider) => {
  if (!ESCROW_CONTRACT_ADDRESS) throw new Error('VITE_ESCROW_CONTRACT not set');
  return new ethers.Contract(ESCROW_CONTRACT_ADDRESS, ESCROW_ABI, signerOrProvider);
};

// ─── Balance ──────────────────────────────────────────────────────────────────
export const getEthBalance = async (address) => {
  if (!address) return 0;
  try { return parseFloat(ethers.formatEther(await provider.getBalance(address))); }
  catch { return 0; }
};

export const validateEntryBalance = async (address, tierKey = 'bronze') => {
  const tier    = getTierByKey(tierKey);
  const balance = await getEthBalance(address);
  return {
    hasEnough: balance >= parseFloat(tier.eth),
    balance:   parseFloat(balance.toFixed(6)),
    required:  parseFloat(tier.eth),
    tierLabel: tier.label,
  };
};

// ─── On-chain Calls — all append Builder Code to calldata ────────────────────

export const createMatchOnChain = async (walletClient, matchId, maxPlayers, tierKey = 'bronze') => {
  try {
    const tier           = getTierByKey(tierKey);
    const entryFeeWei    = ethers.parseEther(tier.eth);
    const matchIdBytes32 = uuidToBytes32(matchId);
    const signer         = await walletClientToSigner(walletClient);
    const contract       = getEscrowContract(signer);
    const encoded        = contract.interface.encodeFunctionData('createMatch', [matchIdBytes32, maxPlayers]);
    const tx             = await signer.sendTransaction({ to: ESCROW_CONTRACT_ADDRESS, value: entryFeeWei, data: appendBuilderCode(encoded) });
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
    const encoded        = contract.interface.encodeFunctionData('joinMatch', [matchIdBytes32]);
    const tx             = await signer.sendTransaction({ to: ESCROW_CONTRACT_ADDRESS, value: entryFeeWei, data: appendBuilderCode(encoded) });
    const receipt        = await tx.wait();
    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('joinMatchOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

export const cancelMatchOnChain = async (walletClient, matchId) => {
  try {
    const matchIdBytes32 = uuidToBytes32(matchId);
    const signer         = await walletClientToSigner(walletClient);
    const contract       = getEscrowContract(signer);
    const encoded        = contract.interface.encodeFunctionData('cancelMatch', [matchIdBytes32]);
    const tx             = await signer.sendTransaction({ to: ESCROW_CONTRACT_ADDRESS, data: appendBuilderCode(encoded) });
    const receipt        = await tx.wait();
    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('cancelMatchOnChain failed:', err);
    return { success: false, error: err.reason || err.message };
  }
};

export const claimPrizeOnChain = async (walletClient, matchId) => {
  try {
    if (!matchId) throw new Error('matchId required');
    const matchIdBytes32 = uuidToBytes32(matchId);
    const signer         = await walletClientToSigner(walletClient);
    const contract       = getEscrowContract(signer);

    // Pre-check to catch reverts with friendly messages
    try {
      await contract.claimPrize.estimateGas(matchIdBytes32);
    } catch (gasErr) {
      const errorData = gasErr.data || gasErr.error?.data;
      if (errorData === '0x9cd0e68f') throw new Error('You are not the winner of this match.');
      if (errorData === '0x8f4eb604') throw new Error('Prize has already been claimed.');
      if (errorData === '0x5e6f9f0e') throw new Error('Match is not finished yet.');
      throw new Error('Contract rejected the claim. Winner may not be declared yet — try again in a moment.');
    }

    const encoded = contract.interface.encodeFunctionData('claimPrize', [matchIdBytes32]);
    const tx      = await signer.sendTransaction({ to: ESCROW_CONTRACT_ADDRESS, data: appendBuilderCode(encoded) });
    const receipt = await tx.wait();
    return { success: true, txId: tx.hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    console.error('claimPrizeOnChain failed:', err);
    return { success: false, error: err.message };
  }
};

// ─── Format Helpers ───────────────────────────────────────────────────────────
export const formatWallet = (address) => {
  if (!address) return '';
  const s = String(address);
  return s.length <= 12 ? s : `${s.slice(0, 6)}....${s.slice(-4)}`;
};

export const formatEth = (eth) => parseFloat(eth || 0).toFixed(4);