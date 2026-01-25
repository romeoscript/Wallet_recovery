'use client';

import { useState, useEffect } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import pLimit from 'p-limit';
import { useWalletStore } from '@/store/useWalletStore';
import { scanWallet, processWallet, truncateAddress, formatSOL, autoFundWallets, sweepAllSOL } from '@/utils/solana';
import { scanAllWalletsForTokens, autoFundAndClaimFees } from '@/utils/pumpfun';
import { WalletInfo } from '@/types';

interface WalletManagerProps {
  keypairs: Keypair[];
  masterAddress: string;
  onReset?: () => void;
}

export default function WalletManager({ keypairs, masterAddress, onReset }: WalletManagerProps) {
  const {
    wallets,
    scanProgress,
    summaryStats,
    setWallets,
    updateWallet,
    setScanProgress,
    updateSummaryStats,
    reset,
  } = useWalletStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set());
  const [hideCleanWallets, setHideCleanWallets] = useState(false);
  const [isPumpfunScanning, setIsPumpfunScanning] = useState(false);
  const [pumpfunScanProgress, setPumpfunScanProgress] = useState({ current: 0, total: 0 });

  // Initial scan on mount
  useEffect(() => {
    performScan();
  }, []);

  const performScan = async () => {
    setScanProgress({ current: 0, total: keypairs.length, isScanning: true });

    const limit = pLimit(3); // Helius dev tier: 50 RPS, limited to 3 concurrent to avoid rate limits
    const walletInfos: WalletInfo[] = [];

    const scanPromises = keypairs.map((keypair, index) =>
      limit(async () => {
        // Delay between wallet scans to spread out RPC requests
        await new Promise((resolve) => setTimeout(resolve, 300));
        const walletInfo = await scanWallet(keypair);
        walletInfos[index] = walletInfo;
        setScanProgress({
          current: index + 1,
          total: keypairs.length,
          isScanning: true,
        });
      })
    );

    await Promise.all(scanPromises);

    setWallets(walletInfos);
    setScanProgress({
      current: keypairs.length,
      total: keypairs.length,
      isScanning: false,
    });
  };

  const handleSelectWallet = (address: string) => {
    const newSelected = new Set(selectedWallets);
    if (newSelected.has(address)) {
      newSelected.delete(address);
    } else {
      newSelected.add(address);
    }
    setSelectedWallets(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedWallets.size === walletsWithAccounts.length) {
      setSelectedWallets(new Set());
    } else {
      setSelectedWallets(new Set(walletsWithAccounts.map((w) => w.address)));
    }
  };

  const handleProcessSelected = async () => {
    if (selectedWallets.size === 0) {
      alert('Please select at least one wallet to process');
      return;
    }

    if (!confirm(`Process ${selectedWallets.size} selected wallet(s)?`)) {
      return;
    }

    setIsProcessing(true);
    const masterPubkey = new PublicKey(masterAddress);

    let totalClosed = 0;
    let totalReclaimed = 0;

    for (const address of selectedWallets) {
      const wallet = wallets.find((w) => w.address === address);
      if (!wallet) continue;

      updateWallet(address, { isProcessing: true });
      setProcessStatus(`Processing ${truncateAddress(address)}...`);

      const result = await processWallet(wallet, masterPubkey, (status) => {
        setProcessStatus(`${truncateAddress(address)}: ${status}`);
      });

      if (result.success) {
        totalClosed += result.accountsClosed;
        totalReclaimed += result.solReclaimed;
        updateWallet(address, {
          isProcessing: false,
          emptyTokenAccounts: 0,
          dustTokenAccounts: 0,
          tokenAccounts: [],
        });
      } else {
        updateWallet(address, {
          isProcessing: false,
          error: result.error,
        });
      }

      // Small delay between wallets
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    setIsProcessing(false);
    setProcessStatus('');
    setSelectedWallets(new Set());
    updateSummaryStats();

    alert(
      `Processing complete!\n\nAccounts closed: ${totalClosed}\nSOL reclaimed: ${formatSOL(
        totalReclaimed
      )}`
    );

    // Rescan to update balances
    await performScan();
  };

  const handleProcessAll = async () => {
    if (walletsWithAccounts.length === 0) {
      alert('No wallets with token accounts to process');
      return;
    }

    if (
      !confirm(
        `Process all ${walletsWithAccounts.length} wallets with token accounts?\n\nThis will burn all dust and close all empty token accounts.`
      )
    ) {
      return;
    }

    // Select all wallets with accounts
    const allAddresses = walletsWithAccounts.map((w) => w.address);
    setSelectedWallets(new Set(allAddresses));

    // Wait a bit for state to update, then process
    setTimeout(() => handleProcessSelected(), 100);
  };

  const handleFundAndProcessAll = async () => {
    const needFunding = walletsWithAccounts.filter((w) => w.solBalance < 0.001);
    const canLend = wallets.filter((w) => w.solBalance >= 0.01);

    if (needFunding.length === 0) {
      // No funding needed, just process
      handleProcessAll();
      return;
    }

    if (canLend.length === 0) {
      alert(
        `Cannot auto-fund: ${needFunding.length} wallet(s) need SOL but no wallets have enough to lend (need >= 0.01 SOL).\n\nPlease fund some wallets manually first.`
      );
      return;
    }

    if (
      !confirm(
        `Auto-Fund & Process All:\n\n` +
          `• ${needFunding.length} wallet(s) need 0.003 SOL each\n` +
          `• ${canLend.length} wallet(s) available to lend\n` +
          `• Total to distribute: ${(needFunding.length * 0.003).toFixed(4)} SOL\n\n` +
          `SOL will be borrowed from funded wallets, then all wallets will be processed.\n` +
          `The rent reclaimed will more than cover the borrowed amount.\n\n` +
          `Continue?`
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      // Step 1: Auto-fund wallets
      setProcessStatus('Auto-funding wallets with insufficient SOL...');
      const fundingResult = await autoFundWallets(wallets, (status) => {
        setProcessStatus(status);
      });

      if (fundingResult.errors.length > 0) {
        console.error('Funding errors:', fundingResult.errors);
      }

      // Update summary stats after funding
      updateSummaryStats();

      setProcessStatus(
        `Funded ${fundingResult.fundedCount} wallet(s) with ${fundingResult.totalSent.toFixed(
          4
        )} SOL total. Starting processing...`
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Process all wallets
      const allAddresses = walletsWithAccounts.map((w) => w.address);
      setSelectedWallets(new Set(allAddresses));

      // Wait a bit then process
      setTimeout(() => handleProcessSelected(), 100);
    } catch (error) {
      setIsProcessing(false);
      alert(`Auto-funding failed: ${(error as Error).message}`);
    }
  };

  const handleSweepAllSOL = async () => {
    const walletsWithSOL = wallets.filter((w) => w.solBalance > 0.00001);

    if (walletsWithSOL.length === 0) {
      alert('No wallets with SOL to sweep');
      return;
    }

    const totalSOL = walletsWithSOL.reduce((sum, w) => sum + w.solBalance, 0);

    if (
      !confirm(
        `Sweep All SOL to Master:\n\n` +
          `• ${walletsWithSOL.length} wallet(s) have SOL\n` +
          `• Total to sweep: ~${totalSOL.toFixed(6)} SOL\n` +
          `• Destination: ${truncateAddress(masterAddress)}\n\n` +
          `This will transfer ALL remaining SOL from wallets to your master address.\n\n` +
          `Continue?`
      )
    ) {
      return;
    }

    setIsProcessing(true);

    try {
      setProcessStatus('Sweeping SOL from all wallets...');
      const sweepResult = await sweepAllSOL(walletsWithSOL, new PublicKey(masterAddress), (status) => {
        setProcessStatus(status);
      });

      if (sweepResult.errors.length > 0) {
        console.error('Sweep errors:', sweepResult.errors);
      }

      // Update summary stats after sweeping
      updateSummaryStats();

      alert(
        `Sweep Complete!\n\n` +
          `✅ Sent ${sweepResult.sweptCount} transaction(s)\n` +
          `💰 Total: ${sweepResult.totalSwept.toFixed(6)} SOL sent to master\n\n` +
          `⏳ Transactions may take 30-60 seconds to confirm on-chain.\n` +
          `   Check your master wallet in Solscan.io to verify.\n` +
          (sweepResult.errors.length > 0
            ? `\n⚠ ${sweepResult.errors.length} error(s) occurred (see console)`
            : '')
      );

      // Wait a bit longer before rescanning to let transactions confirm
      setTimeout(() => performScan(), 3000);
    } catch (error) {
      alert(`Sweep failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const walletsWithAccounts = wallets.filter(
    (w) => w.emptyTokenAccounts > 0 || w.dustTokenAccounts > 0 || w.lockedTokens.length > 0
  );

  const walletsWithInsufficientSOL = walletsWithAccounts.filter(
    (w) => w.solBalance < 0.001
  );

  const cleanWallets = wallets.filter(
    (w) => w.emptyTokenAccounts === 0 && w.dustTokenAccounts === 0 && w.lockedTokens.length === 0
  );

  // Filter wallets for display
  const displayedWallets = hideCleanWallets
    ? wallets.filter((w) => w.emptyTokenAccounts > 0 || w.dustTokenAccounts > 0 || w.lockedTokens.length > 0)
    : wallets;

  const handleExportNonCleanKeys = () => {
    const nonCleanWallets = wallets.filter(
      (w) => w.emptyTokenAccounts > 0 || w.dustTokenAccounts > 0 || w.lockedTokens.length > 0
    );

    if (nonCleanWallets.length === 0) {
      alert('No wallets with accounts to export');
      return;
    }

    const secretKeys = nonCleanWallets.map((w) => Array.from(w.keypair.secretKey));
    const jsonString = JSON.stringify(secretKeys, null, 2);

    // Download as JSON file
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `non-clean-wallets-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    alert(
      `Exported ${nonCleanWallets.length} wallet(s) with token accounts.\n\n` +
        `${cleanWallets.length} clean wallet(s) were excluded.`
    );
  };

  const handleScanPumpfunTokens = async () => {
    if (!confirm('Scan all wallets for pump.fun tokens created?\n\nThis will check transaction history for each wallet.')) {
      return;
    }

    setIsPumpfunScanning(true);
    setPumpfunScanProgress({ current: 0, total: keypairs.length });

    try {
      const updatedWallets = await scanAllWalletsForTokens(wallets, (current, total) => {
        setPumpfunScanProgress({ current, total });
      });

      setWallets(updatedWallets);

      const walletsWithTokens = updatedWallets.filter(w => w.pumpfunTokens && w.pumpfunTokens.length > 0);
      const totalTokens = updatedWallets.reduce((sum, w) => sum + (w.pumpfunTokens?.length || 0), 0);

      alert(
        `Pump.fun Scan Complete!\n\n` +
        `Found ${totalTokens} created tokens across ${walletsWithTokens.length} wallets.`
      );
    } catch (error) {
      alert(`Scan failed: ${(error as Error).message}`);
    } finally {
      setIsPumpfunScanning(false);
    }
  };

  const handleClaimAllFees = async () => {
    const walletsWithTokens = wallets.filter(w => w.pumpfunTokens && w.pumpfunTokens.length > 0);

    if (walletsWithTokens.length === 0) {
      alert('No wallets with created tokens found.\n\nRun "Scan Pump.fun Tokens" first.');
      return;
    }

    const needFunding = walletsWithTokens.filter(w => w.solBalance < 0.001);
    const totalTokens = walletsWithTokens.reduce((sum, w) => sum + (w.pumpfunTokens?.length || 0), 0);

    if (!confirm(
      `Claim Creator Fees:\n\n` +
      `• ${walletsWithTokens.length} wallet(s) created ${totalTokens} tokens\n` +
      (needFunding.length > 0 ? `• ${needFunding.length} wallet(s) need SOL and will be auto-funded\n` : '') +
      `\nClaim fees from all tokens?`
    )) {
      return;
    }

    setIsProcessing(true);

    try {
      const result = await autoFundAndClaimFees(wallets, (status) => {
        setProcessStatus(status);
      });

      if (result.errors.length > 0) {
        console.error('Claim errors:', result.errors);
      }

      alert(
        `Fee Claiming Complete!\n\n` +
        `✅ Claimed fees from ${result.claimedCount} wallet(s)\n` +
        (result.fundedCount > 0 ? `💰 Auto-funded ${result.fundedCount} wallet(s)\n` : '') +
        (result.errors.length > 0 ? `\n⚠ ${result.errors.length} error(s) occurred (see console)` : '')
      );

      // Rescan to update balances
      await performScan();
    } catch (error) {
      alert(`Fee claiming failed: ${(error as Error).message}`);
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  const RENT_PER_ACCOUNT = 0.00203928;

  const walletsWithPumpfunTokens = wallets.filter(w => w.pumpfunTokens && w.pumpfunTokens.length > 0);
  const totalPumpfunTokens = wallets.reduce((sum, w) => sum + (w.pumpfunTokens?.length || 0), 0);

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
              Master: {truncateAddress(masterAddress, 6)}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleScanPumpfunTokens}
              disabled={isProcessing || scanProgress.isScanning || isPumpfunScanning}
              className="px-4 py-2 text-xs bg-purple-600 text-white hover:bg-purple-500 transition-all rounded-lg font-medium shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isPumpfunScanning ? 'SCANNING...' : 'SCAN PUMP.FUN TOKENS'}
            </button>
            {walletsWithPumpfunTokens.length > 0 && (
              <button
                onClick={handleClaimAllFees}
                disabled={isProcessing || scanProgress.isScanning || isPumpfunScanning}
                className="px-4 py-2 text-xs bg-yellow-600 text-white hover:bg-yellow-500 transition-all rounded-lg font-medium shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:shadow-[0_0_25px_rgba(234,179,8,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                CLAIM ALL FEES ({walletsWithPumpfunTokens.length})
              </button>
            )}
            <button
              onClick={handleSweepAllSOL}
              disabled={isProcessing || scanProgress.isScanning || wallets.filter((w) => w.solBalance > 0.00001).length === 0}
              className="px-4 py-2 text-xs bg-green-600 text-white hover:bg-green-500 transition-all rounded-lg font-medium shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              SWEEP ALL SOL
            </button>
            <button
              onClick={handleExportNonCleanKeys}
              disabled={cleanWallets.length === 0 || scanProgress.isScanning}
              className="px-4 py-2 text-xs border border-white/10 hover:border-white/30 transition-all rounded-lg bg-white/[0.02] hover:bg-white/[0.05] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              EXPORT NON-CLEAN KEYS
            </button>
            <button
              onClick={() => {
                if (confirm('Reset and return to setup?')) {
                  if (onReset) {
                    onReset();
                  } else {
                    reset();
                  }
                }
              }}
              className="px-4 py-2 text-xs border border-white/10 hover:border-white/30 transition-all rounded-lg bg-white/[0.02] hover:bg-white/[0.05]"
            >
              RESET
            </button>
          </div>
        </div>

        {/* View Controls */}
        {!scanProgress.isScanning && wallets.length > 0 && (
          <div className="mb-6 flex items-center justify-between p-4 border border-white/10 rounded-xl bg-white/[0.02]">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={hideCleanWallets}
                  onChange={(e) => setHideCleanWallets(e.target.checked)}
                  className="cursor-pointer w-4 h-4 rounded border-white/20 bg-black/50 checked:bg-green-500 checked:border-green-500 transition-all"
                />
                <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                  Hide clean wallets ({cleanWallets.length})
                </span>
              </label>
            </div>
            <div className="text-xs text-gray-500">
              Showing {displayedWallets.length} of {wallets.length} wallets
            </div>
          </div>
        )}

        {/* Scanning Progress */}
        {scanProgress.isScanning && (
          <div className="mb-8 p-6 border border-white/10 rounded-xl bg-white/[0.02]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-gray-300">Scanning wallets...</span>
              </div>
              <span className="text-sm text-white font-mono">
                {scanProgress.current} / {scanProgress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300 shadow-[0_0_10px_rgba(34,197,94,0.5)]"
                style={{
                  width: `${(scanProgress.current / scanProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Pump.fun Scanning Progress */}
        {isPumpfunScanning && (
          <div className="mb-8 p-6 border border-purple-500/20 bg-purple-500/5 rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm text-purple-300">Scanning for pump.fun tokens...</span>
              </div>
              <span className="text-sm text-white font-mono">
                {pumpfunScanProgress.current} / {pumpfunScanProgress.total}
              </span>
            </div>
            <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-400 transition-all duration-300 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                style={{
                  width: `${pumpfunScanProgress.total > 0 ? (pumpfunScanProgress.current / pumpfunScanProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {!scanProgress.isScanning && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="p-6 border border-white/10 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <p className="text-xs text-gray-400 mb-2 font-medium">TOTAL WALLETS</p>
              <p className="text-3xl font-bold tracking-tight">{summaryStats.totalWallets}</p>
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
        {!scanProgress.isScanning && !isPumpfunScanning && totalPumpfunTokens > 0 && (
          <div className="mb-8 p-6 border border-purple-500/20 bg-purple-500/5 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-400 mb-2 font-medium">PUMP.FUN TOKENS CREATED</p>
                <p className="text-3xl font-bold tracking-tight text-purple-400">{totalPumpfunTokens}</p>
              </div>
              <div>
                <p className="text-xs text-purple-400 mb-2 font-medium">WALLETS WITH TOKENS</p>
                <p className="text-3xl font-bold tracking-tight text-purple-400">{walletsWithPumpfunTokens.length}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-purple-300 bg-purple-500/10 px-4 py-2 rounded-lg border border-purple-500/20">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Click &quot;CLAIM ALL FEES&quot; to collect creator rewards
              </div>
            </div>
          </div>
        )}

        {/* Insufficient SOL Warning */}
        {!scanProgress.isScanning && walletsWithInsufficientSOL.length > 0 && (
          <div className="mb-6 p-6 border border-yellow-500/20 bg-yellow-500/5 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-yellow-200/90 leading-relaxed mb-2">
                  <strong className="text-yellow-400">{walletsWithInsufficientSOL.length} wallet(s)</strong> have
                  token accounts but less than 0.001 SOL. They cannot pay transaction
                  fees to process their accounts.
                </p>
                <p className="text-sm text-yellow-200/70 leading-relaxed">
                  <strong className="text-yellow-300">Solution:</strong> Click &quot;AUTO-FUND &amp; PROCESS ALL&quot; to
                  automatically borrow 0.003 SOL from funded wallets, then process
                  everything. The rent reclaimed will more than cover the borrowed amount.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!scanProgress.isScanning && walletsWithAccounts.length > 0 && (
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleProcessSelected}
              disabled={isProcessing || selectedWallets.size === 0}
              className="px-6 py-3 bg-white text-black text-sm font-bold rounded-lg hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              PROCESS SELECTED ({selectedWallets.size})
            </button>
            <button
              onClick={handleProcessAll}
              disabled={isProcessing}
              className="px-6 py-3 border border-white/30 text-white text-sm font-bold rounded-lg hover:bg-white hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              PROCESS ALL ({walletsWithAccounts.length})
            </button>
            {walletsWithInsufficientSOL.length > 0 && (
              <button
                onClick={handleFundAndProcessAll}
                disabled={isProcessing}
                className="px-6 py-3 bg-yellow-600 text-black text-sm font-bold rounded-lg hover:bg-yellow-500 transition-all shadow-[0_0_15px_rgba(234,179,8,0.3)] hover:shadow-[0_0_25px_rgba(234,179,8,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                AUTO-FUND & PROCESS ALL
              </button>
            )}
            <button
              onClick={performScan}
              disabled={isProcessing}
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

        {/* Wallets Table */}
        {!scanProgress.isScanning && (
          <div className="border border-white/10 rounded-xl overflow-hidden bg-black/30 backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="text-left p-4 text-xs font-medium text-gray-400 tracking-wide">
                      <input
                        type="checkbox"
                        checked={
                          walletsWithAccounts.length > 0 &&
                          selectedWallets.size === walletsWithAccounts.length
                        }
                        onChange={handleSelectAll}
                        className="cursor-pointer"
                        disabled={walletsWithAccounts.length === 0}
                      />
                    </th>
                    <th className="text-left p-4 text-xs font-medium text-gray-400 tracking-wide">
                      ADDRESS
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-gray-400 tracking-wide">
                      SOL BALANCE
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-gray-400 tracking-wide">
                      EMPTY
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-gray-400 tracking-wide">
                      DUST
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-gray-400 tracking-wide">
                      LOCKED
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-gray-400 tracking-wide">
                      LOCKED SOL
                    </th>
                    <th className="text-right p-4 text-xs font-medium text-gray-400 tracking-wide">
                      PUMP.FUN
                    </th>
                    <th className="text-left p-4 text-xs font-medium text-gray-400 tracking-wide">
                      STATUS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedWallets.map((wallet, index) => {
                    const hasAccounts =
                      wallet.emptyTokenAccounts > 0 || wallet.dustTokenAccounts > 0;
                    const isSelected = selectedWallets.has(wallet.address);
                    const hasInsufficientSOL = wallet.solBalance < 0.001 && hasAccounts;
                    const lockedSOL =
                      (wallet.emptyTokenAccounts + wallet.dustTokenAccounts) * RENT_PER_ACCOUNT;

                    return (
                      <tr
                        key={wallet.address}
                        className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${
                          wallet.isProcessing ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="p-4">
                          {hasAccounts && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectWallet(wallet.address)}
                              disabled={wallet.isProcessing || isProcessing}
                              className="cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="p-4 font-mono text-sm">
                          {truncateAddress(wallet.address, 6)}
                        </td>
                        <td className="p-4 text-right text-sm">
                          <span className={hasInsufficientSOL ? 'text-yellow-500' : ''}>
                            {formatSOL(wallet.solBalance)}
                          </span>
                        </td>
                        <td className="p-4 text-right text-sm">
                          {wallet.emptyTokenAccounts > 0 ? (
                            <span className="text-gray-400">{wallet.emptyTokenAccounts}</span>
                          ) : (
                            <span className="text-gray-700">0</span>
                          )}
                        </td>
                        <td className="p-4 text-right text-sm">
                          {wallet.dustTokenAccounts > 0 ? (
                            <span className="text-gray-400">{wallet.dustTokenAccounts}</span>
                          ) : (
                            <span className="text-gray-700">0</span>
                          )}
                        </td>
                        <td className="p-4 text-right text-sm">
                          {wallet.lockedTokens.length > 0 ? (
                            <span className="text-blue-400">{wallet.lockedTokens.length}</span>
                          ) : (
                            <span className="text-gray-700">0</span>
                          )}
                        </td>
                        <td className="p-4 text-right text-sm">
                          {lockedSOL > 0 ? (
                            <span className="text-green-400">{formatSOL(lockedSOL)}</span>
                          ) : (
                            <span className="text-gray-700">0.000000</span>
                          )}
                        </td>
                        <td className="p-4 text-right text-sm">
                          {wallet.pumpfunTokens && wallet.pumpfunTokens.length > 0 ? (
                            <span className="text-purple-400">{wallet.pumpfunTokens.length}</span>
                          ) : (
                            <span className="text-gray-700">0</span>
                          )}
                        </td>
                        <td className="p-4 text-xs">
                          {wallet.isProcessing && <span className="text-gray-600">Processing...</span>}
                          {wallet.error && (
                            <span className="text-red-500">{wallet.error}</span>
                          )}
                          {!wallet.isProcessing && !wallet.error && hasInsufficientSOL && (
                            <span className="text-yellow-500">Insufficient SOL</span>
                          )}
                          {!wallet.isProcessing && !wallet.error && !hasInsufficientSOL && hasAccounts && (
                            <span className="text-gray-600">Ready</span>
                          )}
                          {!wallet.isProcessing && !wallet.error && !hasAccounts && (
                            <span className="text-gray-600">Clean</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {displayedWallets.length === 0 && wallets.length === 0 && (
              <div className="p-12 text-center text-gray-500 text-sm">
                No wallets scanned yet
              </div>
            )}
            {displayedWallets.length === 0 && wallets.length > 0 && (
              <div className="p-12 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  All {wallets.length} wallet(s) are clean!
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Uncheck &quot;Hide clean wallets&quot; to view them.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
