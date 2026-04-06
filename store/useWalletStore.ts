import { create } from 'zustand';
import { WalletInfo, ScanProgress, SummaryStats } from '@/types';

interface WalletStore {
  // Wallet state
  wallet: WalletInfo | null;
  scanProgress: ScanProgress;
  summaryStats: SummaryStats;

  // Actions
  setWallet: (wallet: WalletInfo) => void;
  updateWallet: (updates: Partial<WalletInfo>) => void;
  setScanProgress: (progress: ScanProgress) => void;
  updateSummaryStats: () => void;
  reset: () => void;
}

const RENT_EXEMPT_ACCOUNT = 0.00203928;

export const useWalletStore = create<WalletStore>((set, get) => ({
  wallet: null,
  scanProgress: {
    current: 0,
    total: 1,
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

  setWallet: (wallet) => {
    set({ wallet });
    get().updateSummaryStats();
  },

  updateWallet: (updates) =>
    set((state) => {
      if (!state.wallet) return {};
      return { wallet: { ...state.wallet, ...updates } };
    }),

  setScanProgress: (progress) => set({ scanProgress: progress }),

  updateSummaryStats: () =>
    set((state) => {
      const wallet = state.wallet;
      if (!wallet) {
        return {
          summaryStats: {
            totalWallets: 0,
            totalReclaimableSOL: 0,
            totalDustAccounts: 0,
            totalEmptyAccounts: 0,
            totalLockedTokens: 0,
            totalUnlockableTokens: 0,
          },
        };
      }

      return {
        summaryStats: {
          totalWallets: 1,
          totalReclaimableSOL:
            (wallet.emptyTokenAccounts + wallet.dustTokenAccounts) * RENT_EXEMPT_ACCOUNT,
          totalDustAccounts: wallet.dustTokenAccounts,
          totalEmptyAccounts: wallet.emptyTokenAccounts,
          totalLockedTokens: wallet.lockedTokens.length,
          totalUnlockableTokens: wallet.lockedTokens.filter((lt) => lt.canClaim).length,
        },
      };
    }),

  reset: () =>
    set({
      wallet: null,
      scanProgress: {
        current: 0,
        total: 1,
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
