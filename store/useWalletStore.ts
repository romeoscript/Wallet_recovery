import { create } from 'zustand';
import { Keypair, PublicKey } from '@solana/web3.js';
import { WalletInfo, ScanProgress, SummaryStats, SetupConfig } from '@/types';

interface WalletStore {
  // Setup state
  isSetup: boolean;
  masterAddress: string | null;

  // Wallets state
  wallets: WalletInfo[];
  scanProgress: ScanProgress;
  summaryStats: SummaryStats;

  // Actions
  setSetupComplete: (config: SetupConfig) => void;
  setWallets: (wallets: WalletInfo[]) => void;
  updateWallet: (address: string, updates: Partial<WalletInfo>) => void;
  setScanProgress: (progress: ScanProgress) => void;
  updateSummaryStats: () => void;
  reset: () => void;
}

const RENT_EXEMPT_ACCOUNT = 0.00203928;

export const useWalletStore = create<WalletStore>((set, get) => ({
  // Initial state
  isSetup: false,
  masterAddress: null,
  wallets: [],
  scanProgress: {
    current: 0,
    total: 0,
    isScanning: false,
  },
  summaryStats: {
    totalWallets: 0,
    totalReclaimableSOL: 0,
    totalDustAccounts: 0,
    totalEmptyAccounts: 0,
    totalLockedTokens: 0,
    totalUnlockableTokens: 0,
  },

  // Actions
  setSetupComplete: (config) =>
    set({
      isSetup: true,
      masterAddress: config.masterAddress,
    }),

  setWallets: (wallets) => {
    set({ wallets });
    get().updateSummaryStats();
  },

  updateWallet: (address, updates) =>
    set((state) => {
      const wallets = state.wallets.map((w) =>
        w.address === address ? { ...w, ...updates } : w
      );
      return { wallets };
    }),

  setScanProgress: (progress) => set({ scanProgress: progress }),

  updateSummaryStats: () =>
    set((state) => {
      const stats: SummaryStats = {
        totalWallets: state.wallets.length,
        totalReclaimableSOL: 0,
        totalDustAccounts: 0,
        totalEmptyAccounts: 0,
        totalLockedTokens: 0,
        totalUnlockableTokens: 0,
      };

      state.wallets.forEach((wallet) => {
        stats.totalDustAccounts += wallet.dustTokenAccounts;
        stats.totalEmptyAccounts += wallet.emptyTokenAccounts;
        stats.totalReclaimableSOL +=
          (wallet.emptyTokenAccounts + wallet.dustTokenAccounts) * RENT_EXEMPT_ACCOUNT;

        // Count locked tokens
        stats.totalLockedTokens += wallet.lockedTokens.length;
        stats.totalUnlockableTokens += wallet.lockedTokens.filter((lt) => lt.canClaim).length;
      });

      return { summaryStats: stats };
    }),

  reset: () =>
    set({
      isSetup: false,
      masterAddress: null,
      wallets: [],
      scanProgress: {
        current: 0,
        total: 0,
        isScanning: false,
      },
      summaryStats: {
        totalWallets: 0,
        totalReclaimableSOL: 0,
        totalDustAccounts: 0,
        totalEmptyAccounts: 0,
        totalLockedTokens: 0,
        totalUnlockableTokens: 0,
      },
    }),
}));
