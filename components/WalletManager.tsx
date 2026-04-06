'use client';

import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWalletStore } from '@/store/useWalletStore';
import { scanWallet, processWallet, truncateAddress, formatSOL } from '@/utils/solana';
import { scanWalletForTokens, claimCreatorFees } from '@/utils/pumpfun';

export default function WalletManager() {
  const { publicKey, signTransaction, disconnect } = useWallet();
  const {
    wallet,
    scanProgress,
    summaryStats,
    setWallet,
    updateWallet,
    setScanProgress,
    updateSummaryStats,
    reset,
  } = useWalletStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [isPumpfunScanning, setIsPumpfunScanning] = useState(false);

  const performScan = useCallback(async () => {
    if (!publicKey) return;

    setScanProgress({ current: 0, total: 1, isScanning: true });

    const walletInfo = await scanWallet(publicKey);
    setWallet(walletInfo);

    setScanProgress({ current: 1, total: 1, isScanning: false });
  }, [publicKey, setScanProgress, setWallet]);

  // Initial scan on mount
  useEffect(() => {
    performScan();
  }, [performScan]);

  const handleProcess = async () => {
    if (!wallet || !publicKey || !signTransaction) return;

    const totalAccounts = wallet.emptyTokenAccounts + wallet.dustTokenAccounts;
    if (totalAccounts === 0) {
      alert('No token accounts to process');
      return;
    }

    if (!confirm(`Process wallet?\n\nThis will close ${wallet.emptyTokenAccounts} empty and burn+close ${wallet.dustTokenAccounts} dust token accounts.`)) {
      return;
    }

    setIsProcessing(true);
    updateWallet({ isProcessing: true });

    const result = await processWallet(wallet, publicKey, signTransaction, (status) => {
      setProcessStatus(status);
    });

    if (result.success) {
      updateWallet({
        isProcessing: false,
        emptyTokenAccounts: 0,
        dustTokenAccounts: 0,
        tokenAccounts: [],
      });
      alert(
        `Processing complete!\n\nAccounts closed: ${result.accountsClosed}\nSOL reclaimed: ${formatSOL(result.solReclaimed)}`
      );
    } else {
      updateWallet({
        isProcessing: false,
        error: result.error,
      });
      alert(`Processing failed: ${result.error}`);
    }

    setIsProcessing(false);
    setProcessStatus('');
    updateSummaryStats();

    // Rescan to update balances
    await performScan();
  };

  const handleScanPumpfunTokens = async () => {
    if (!wallet) return;

    if (!confirm('Scan wallet for pump.fun tokens created?\n\nThis will check transaction history.')) {
      return;
    }

    setIsPumpfunScanning(true);

    try {
      const updated = await scanWalletForTokens(wallet, (status) => {
        setProcessStatus(status);
      });

      setWallet(updated);

      const tokenCount = updated.pumpfunTokens?.length || 0;
      alert(`Pump.fun Scan Complete!\n\nFound ${tokenCount} created tokens.`);
    } catch (error) {
      alert(`Scan failed: ${(error as Error).message}`);
    } finally {
      setIsPumpfunScanning(false);
      setProcessStatus('');
    }
  };

  const handleClaimFees = async () => {
    if (!wallet || !signTransaction) return;

    const tokenCount = wallet.pumpfunTokens?.length || 0;
    if (tokenCount === 0) {
      alert('No pump.fun tokens found.\n\nRun "Scan Pump.fun Tokens" first.');
      return;
    }

    if (!confirm(`Claim creator fees for ${tokenCount} pump.fun tokens?`)) {
      return;
    }

    setIsProcessing(true);

    try {
      const result = await claimCreatorFees(
        wallet,
        signTransaction as any,
        (status) => setProcessStatus(status)
      );

      if (result.success) {
        alert(`Fee Claiming Complete!\n\nSignature: ${result.signature}`);
      } else {
        alert(`Fee claiming failed: ${result.error}`);
      }

      await performScan();
    } catch (error) {
      alert(`Fee claiming failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  const handleDisconnect = () => {
    if (confirm('Disconnect wallet and return to setup?')) {
      reset();
      disconnect();
    }
  };

  const RENT_PER_ACCOUNT = 0.00203928;
  const hasAccounts = wallet
    ? wallet.emptyTokenAccounts > 0 || wallet.dustTokenAccounts > 0
    : false;
  const pumpfunTokenCount = wallet?.pumpfunTokens?.length || 0;
  const lockedSOL = wallet
    ? (wallet.emptyTokenAccounts + wallet.dustTokenAccounts) * RENT_PER_ACCOUNT
    : 0;

  const gridBgStyle = {
    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    backgroundSize: '30px 30px',
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 p-6" style={gridBgStyle}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-green-500/20 p-2 rounded-lg">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h1 className="text-4xl font-bold tracking-tighter">Dashboard</h1>
            </div>
            <p className="text-sm text-gray-400 font-mono">
              {publicKey ? truncateAddress(publicKey.toBase58(), 6) : ''}
            </p>
          </div>
          <div className="flex gap-3 items-center">
            <button
              onClick={handleScanPumpfunTokens}
              disabled={isProcessing || scanProgress.isScanning || isPumpfunScanning}
              className="px-4 py-2 text-xs bg-purple-600 text-white hover:bg-purple-500 transition-all rounded-lg font-medium shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isPumpfunScanning ? 'SCANNING...' : 'SCAN PUMP.FUN TOKENS'}
            </button>
            {pumpfunTokenCount > 0 && (
              <button
                onClick={handleClaimFees}
                disabled={isProcessing || scanProgress.isScanning || isPumpfunScanning}
                className="px-4 py-2 text-xs bg-yellow-600 text-white hover:bg-yellow-500 transition-all rounded-lg font-medium shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:shadow-[0_0_25px_rgba(234,179,8,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                CLAIM FEES ({pumpfunTokenCount})
              </button>
            )}
            <WalletMultiButton
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                height: '2.25rem',
              }}
            />
          </div>
        </div>

        {/* Scanning Progress */}
        {scanProgress.isScanning && (
          <div className="mb-8 p-6 border border-white/10 rounded-xl bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm text-gray-300">Scanning wallet...</span>
            </div>
          </div>
        )}

        {/* Pump.fun Scanning Progress */}
        {isPumpfunScanning && (
          <div className="mb-8 p-6 border border-purple-500/20 bg-purple-500/5 rounded-xl">
            <div className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-sm text-purple-300">Scanning for pump.fun tokens...</span>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {!scanProgress.isScanning && wallet && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-6 border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <p className="text-xs text-gray-400 mb-2 font-medium">SOL BALANCE</p>
              <p className="text-3xl font-bold tracking-tight">{formatSOL(wallet.solBalance)}</p>
            </div>
            <div className="p-6 border border-green-500/20 rounded-xl bg-green-500/5 hover:bg-green-500/10 transition-colors">
              <p className="text-xs text-green-400 mb-2 font-medium">RECLAIMABLE SOL</p>
              <p className="text-3xl font-bold tracking-tight text-green-400">
                {formatSOL(summaryStats.totalReclaimableSOL)}
              </p>
            </div>
            <div className="p-6 border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <p className="text-xs text-gray-400 mb-2 font-medium">EMPTY ACCOUNTS</p>
              <p className="text-3xl font-bold tracking-tight">{summaryStats.totalEmptyAccounts}</p>
            </div>
            <div className="p-6 border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <p className="text-xs text-gray-400 mb-2 font-medium">DUST ACCOUNTS</p>
              <p className="text-3xl font-bold tracking-tight">{summaryStats.totalDustAccounts}</p>
            </div>
            <div className="p-6 border border-blue-500/20 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 transition-colors">
              <p className="text-xs text-blue-400 mb-2 font-medium">LOCKED TOKENS</p>
              <p className="text-3xl font-bold tracking-tight text-blue-400">{summaryStats.totalLockedTokens}</p>
            </div>
            <div className="p-6 border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <p className="text-xs text-gray-400 mb-2 font-medium">UNLOCKABLE</p>
              <p className="text-3xl font-bold tracking-tight">{summaryStats.totalUnlockableTokens}</p>
            </div>
          </div>
        )}

        {/* Pump.fun Summary */}
        {!scanProgress.isScanning && !isPumpfunScanning && pumpfunTokenCount > 0 && (
          <div className="mb-8 p-6 border border-purple-500/20 bg-purple-500/5 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-400 mb-2 font-medium">PUMP.FUN TOKENS CREATED</p>
                <p className="text-3xl font-bold tracking-tight text-purple-400">{pumpfunTokenCount}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-300 bg-purple-500/10 px-4 py-2 rounded-lg border border-purple-500/20">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Click &quot;CLAIM FEES&quot; to collect creator rewards
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!scanProgress.isScanning && wallet && (
          <div className="flex gap-3 mb-6">
            {hasAccounts && (
              <button
                onClick={handleProcess}
                disabled={isProcessing}
                className="px-6 py-3 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-500 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                PROCESS ACCOUNTS ({wallet.emptyTokenAccounts + wallet.dustTokenAccounts})
              </button>
            )}
            <button
              onClick={performScan}
              disabled={isProcessing || scanProgress.isScanning}
              className="px-6 py-3 border border-white/10 text-gray-400 text-sm font-medium rounded-lg hover:border-white/30 hover:text-white transition-all bg-white/[0.02] hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              RESCAN
            </button>
          </div>
        )}

        {/* Processing Status */}
        {isProcessing && (
          <div className="mb-6 p-4 border border-green-500/20 bg-green-500/5 rounded-xl">
            <div className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-sm text-green-300 font-mono">{processStatus}</p>
            </div>
          </div>
        )}

        {/* Wallet Details Table */}
        {!scanProgress.isScanning && wallet && (
          <div className="border border-white/10 rounded-xl overflow-hidden bg-black/30 backdrop-blur-sm">
            <div className="p-6">
              <h2 className="text-sm font-medium text-gray-400 mb-4">WALLET DETAILS</h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Address</span>
                  <span className="text-sm font-mono text-gray-200">{wallet.address}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">SOL Balance</span>
                  <span className="text-sm font-mono text-gray-200">{formatSOL(wallet.solBalance)} SOL</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Empty Token Accounts</span>
                  <span className={`text-sm font-mono ${wallet.emptyTokenAccounts > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {wallet.emptyTokenAccounts}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Dust Token Accounts</span>
                  <span className={`text-sm font-mono ${wallet.dustTokenAccounts > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                    {wallet.dustTokenAccounts}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Reclaimable SOL (from rent)</span>
                  <span className={`text-sm font-mono ${lockedSOL > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                    {formatSOL(lockedSOL)} SOL
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-sm text-gray-400">Locked Tokens</span>
                  <span className={`text-sm font-mono ${wallet.lockedTokens.length > 0 ? 'text-blue-400' : 'text-gray-600'}`}>
                    {wallet.lockedTokens.length}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-400">Pump.fun Tokens Created</span>
                  <span className={`text-sm font-mono ${pumpfunTokenCount > 0 ? 'text-purple-400' : 'text-gray-600'}`}>
                    {pumpfunTokenCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Token Accounts List */}
            {wallet.tokenAccounts.length > 0 && (
              <div className="border-t border-white/10 p-6">
                <h3 className="text-sm font-medium text-gray-400 mb-4">TOKEN ACCOUNTS ({wallet.tokenAccounts.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left p-2 text-xs font-medium text-gray-500">MINT</th>
                        <th className="text-right p-2 text-xs font-medium text-gray-500">BALANCE</th>
                        <th className="text-right p-2 text-xs font-medium text-gray-500">TYPE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wallet.tokenAccounts.map((account) => (
                        <tr key={account.pubkey} className="border-b border-white/5 hover:bg-white/[0.02]">
                          <td className="p-2 text-xs font-mono text-gray-400">
                            {truncateAddress(account.mint, 6)}
                          </td>
                          <td className="p-2 text-right text-xs font-mono text-gray-300">
                            {account.uiAmount}
                          </td>
                          <td className="p-2 text-right text-xs">
                            {account.uiAmount === 0 ? (
                              <span className="text-yellow-500">Empty</span>
                            ) : (
                              <span className="text-gray-500">Dust</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* No accounts message */}
            {!hasAccounts && wallet.lockedTokens.length === 0 && (
              <div className="border-t border-white/10 p-8 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Wallet is clean - no accounts to reclaim
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {wallet?.error && (
          <div className="mt-6 p-4 border border-red-500/20 bg-red-500/10 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-400">{wallet.error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
