import { Keypair } from '@solana/web3.js';

export interface WalletInfo {
  address: string;
  keypair: Keypair;
  solBalance: number;
  emptyTokenAccounts: number;
  dustTokenAccounts: number;
  tokenAccounts: TokenAccountInfo[];
  lockedTokens: LockedTokenInfo[];
  pumpfunTokens?: PumpFunTokenInfo[];
  isProcessing?: boolean;
  error?: string;
}

export interface TokenAccountInfo {
  pubkey: string;
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  programId: string; // TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID
}

export interface LockedTokenInfo {
  pubkey: string;
  protocol: 'streamflow' | 'jupiter-lock' | 'unknown';
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  startTime?: number;
  endTime?: number;
  cliffTime?: number;
  isUnlocked: boolean;
  canClaim: boolean;
  recipient?: string;
  // Token metadata
  tokenSymbol?: string;
  tokenName?: string;
  tokenLogoUri?: string;
  // Value information
  solValue?: number;
  usdValue?: number;
  pricePerToken?: number;
}

export interface ScanProgress {
  current: number;
  total: number;
  isScanning: boolean;
}

export interface SummaryStats {
  totalWallets: number;
  totalReclaimableSOL: number;
  totalDustAccounts: number;
  totalEmptyAccounts: number;
  totalLockedTokens: number;
  totalUnlockableTokens: number;
}

export interface SetupConfig {
  inputType: 'seed' | 'keys';
  seedPhrase?: string;
  accountCount?: number;
  secretKeys?: Uint8Array[];
  masterAddress: string;
}

export interface BurnResult {
  success: boolean;
  signature?: string;
  error?: string;
  walletsProcessed: number;
  accountsClosed: number;
  solReclaimed: number;
}

export interface PumpFunTokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  createdAt: number;
  signature: string;
  bondingCurve?: string;
  hasGraduated: boolean;
  estimatedFees?: number;
}

export interface ClaimFeesResult {
  success: boolean;
  signature?: string;
  error?: string;
  tokensClaimed: number;
  feesCollected: number;
}
