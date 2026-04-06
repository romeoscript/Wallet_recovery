'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWalletStore } from '@/store/useWalletStore';
import { scanWallet, processEmptyAccounts, processDustTokens, truncateAddress, formatSOL } from '@/utils/solana';
import { scanWalletForTokens, claimCreatorFees } from '@/utils/pumpfun';
import { TokenAccountInfo } from '@/types';

export default function WalletManager() {
  const { publicKey, signTransaction } = useWallet();
  const {
    wallet, scanProgress, summaryStats,
    setWallet, updateWallet, setScanProgress, updateSummaryStats,
  } = useWalletStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [isPumpfunScanning, setIsPumpfunScanning] = useState(false);
  const [selectedDust, setSelectedDust] = useState<Set<string>>(new Set());

  const performScan = useCallback(async () => {
    if (!publicKey) return;
    setScanProgress({ current: 0, total: 1, isScanning: true });
    const walletInfo = await scanWallet(publicKey);
    setWallet(walletInfo);
    setScanProgress({ current: 1, total: 1, isScanning: false });
    setSelectedDust(new Set());
  }, [publicKey, setScanProgress, setWallet]);

  useEffect(() => { performScan(); }, [performScan]);

  const dustAccounts = wallet?.tokenAccounts.filter((a) => a.uiAmount > 0) || [];
  const emptyAccounts = wallet?.tokenAccounts.filter((a) => a.uiAmount === 0) || [];

  const toggleDust = (pubkey: string) => {
    setSelectedDust((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      return next;
    });
  };

  const selectAllDust = () => {
    if (selectedDust.size === dustAccounts.length) {
      setSelectedDust(new Set());
    } else {
      setSelectedDust(new Set(dustAccounts.map((a) => a.pubkey)));
    }
  };

  // Close empty accounts — rent goes to user
  const handleCloseEmpty = async () => {
    if (!wallet || !publicKey || !signTransaction) return;
    if (emptyAccounts.length === 0) return;
    if (!confirm(`Close ${emptyAccounts.length} empty token accounts?\n\nYou will reclaim ~${formatSOL(emptyAccounts.length * 0.00203928)} SOL in rent.`)) return;

    setIsProcessing(true);
    updateWallet({ isProcessing: true });
    const result = await processEmptyAccounts(wallet, publicKey, signTransaction, (s) => setProcessStatus(s));

    if (result.success) {
      updateWallet({ isProcessing: false, emptyTokenAccounts: 0 });
      alert(`Closed ${result.accountsClosed} accounts, reclaimed ${formatSOL(result.solReclaimed)} SOL`);
    } else {
      updateWallet({ isProcessing: false, error: result.error });
    }
    setIsProcessing(false);
    setProcessStatus('');
    updateSummaryStats();
    await performScan();
  };

  // Recover selected dust — tokens to treasury, rent to user
  const handleRecoverDust = async () => {
    if (!wallet || !publicKey || !signTransaction) return;
    if (selectedDust.size === 0) return;

    const selected = dustAccounts.filter((a) => selectedDust.has(a.pubkey));
    const rentBack = selected.length * 0.00203928;

    if (!confirm(`Recover ${selected.length} dust token account(s)?\n\nDust tokens will be cleared and you reclaim ~${formatSOL(rentBack)} SOL in rent.`)) return;

    setIsProcessing(true);
    const result = await processDustTokens(selected, publicKey, signTransaction, (s) => setProcessStatus(s));

    if (result.success) {
      alert(`Recovered ${result.accountsClosed} dust accounts, reclaimed ${formatSOL(result.solReclaimed)} SOL in rent.`);
    } else {
      alert(`Failed: ${result.error}`);
    }
    setIsProcessing(false);
    setProcessStatus('');
    setSelectedDust(new Set());
    updateSummaryStats();
    await performScan();
  };

  const handleScanPumpfun = async () => {
    if (!wallet || !confirm('Scan for pump.fun tokens?')) return;
    setIsPumpfunScanning(true);
    try {
      const updated = await scanWalletForTokens(wallet, (s) => setProcessStatus(s));
      setWallet(updated);
      alert(`Found ${updated.pumpfunTokens?.length || 0} pump.fun tokens.`);
    } catch (e) { alert(`Failed: ${(e as Error).message}`); }
    finally { setIsPumpfunScanning(false); setProcessStatus(''); }
  };

  const handleClaimFees = async () => {
    if (!wallet || !signTransaction || !wallet.pumpfunTokens?.length) return;
    if (!confirm(`Claim fees for ${wallet.pumpfunTokens.length} tokens?`)) return;
    setIsProcessing(true);
    try {
      const result = await claimCreatorFees(wallet, signTransaction as any, (s) => setProcessStatus(s));
      if (result.success) alert(`Claimed! TX: ${result.signature}`);
      else alert(`Failed: ${result.error}`);
      await performScan();
    } catch (e) { alert(`Failed: ${(e as Error).message}`); }
    finally { setIsProcessing(false); setProcessStatus(''); }
  };

  const RENT = 0.00203928;
  const pumpfunCount = wallet?.pumpfunTokens?.length || 0;
  const reclaimable = wallet ? (wallet.emptyTokenAccounts + wallet.dustTokenAccounts) * RENT : 0;

  return (
    <div className="min-h-screen bg-[#060608] text-white/90 relative">
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-40" />

      {/* NAV */}
      <nav className="w-full border-b border-white/[0.05] backdrop-blur-2xl sticky top-0 z-50 bg-[#060608]/80">
        <div className="max-w-[1100px] mx-auto px-6 h-[56px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0a0a0c] border border-[#00e85e]/30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#00e85e] shadow-[0_0_10px_rgba(0,232,94,0.35)]" />
            </div>
            <span className="font-mono font-bold text-[15px] tracking-wide">GLEAN</span>
            <div className="h-4 w-px bg-white/[0.06] mx-1" />
            <span className="text-[12px] text-white/25 font-medium">Dashboard</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={performScan}
              disabled={isProcessing || scanProgress.isScanning}
              className="text-[12px] text-white/35 hover:text-white/70 border border-white/[0.06] hover:border-white/[0.12] px-3.5 py-[6px] rounded-lg transition-all disabled:opacity-20 font-medium"
            >
              Rescan
            </button>
            <WalletMultiButton
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                fontSize: '11px',
                fontFamily: 'IBM Plex Mono, monospace',
                fontWeight: 500,
                height: '34px',
                padding: '0 14px',
                color: 'rgba(255,255,255,0.45)',
              }}
            />
          </div>
        </div>
      </nav>

      <main className="max-w-[1100px] mx-auto px-6 py-8 relative">
        {/* Loading */}
        {scanProgress.isScanning && (
          <div className="mb-6 flex items-center gap-3 p-5 rounded-2xl border border-white/[0.04] bg-white/[0.01]">
            <div className="w-5 h-5 border-2 border-[#00e85e]/20 border-t-[#00e85e] rounded-full animate-spin" />
            <span className="text-[13px] text-white/40">Scanning wallet...</span>
          </div>
        )}

        {isPumpfunScanning && (
          <div className="mb-6 flex items-center gap-3 p-5 rounded-2xl border border-purple-500/10 bg-purple-500/[0.02]">
            <div className="w-5 h-5 border-2 border-purple-400/20 border-t-purple-400 rounded-full animate-spin" />
            <span className="text-[13px] text-purple-300/50">Scanning pump.fun tokens...</span>
          </div>
        )}

        {/* HERO STAT */}
        {!scanProgress.isScanning && wallet && (
          <div className="mb-8 p-7 rounded-2xl border border-white/[0.05] bg-gradient-to-br from-white/[0.02] to-transparent relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e85e]/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-[12px] text-white/25 font-medium mb-1">Connected Wallet</p>
                <p className="font-mono text-[13px] text-white/50 mb-5">{wallet.address}</p>
                <div className="flex items-baseline gap-3">
                  <div>
                    <p className="text-[11px] text-white/20 mb-1 font-medium">BALANCE</p>
                    <p className="text-2xl font-bold tracking-tight text-white/85">
                      {formatSOL(wallet.solBalance)}
                      <span className="text-sm font-normal text-white/25 ml-1">SOL</span>
                    </p>
                  </div>
                  <div className="h-10 w-px bg-white/[0.05] mx-3" />
                  <div>
                    <p className="text-[11px] text-[#00e85e]/40 mb-1 font-medium">RECLAIMABLE RENT</p>
                    <p className="text-2xl font-bold tracking-tight text-[#00e85e]">
                      {formatSOL(reclaimable)}
                      <span className="text-sm font-normal text-[#00e85e]/40 ml-1">SOL</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STAT GRID */}
        {!scanProgress.isScanning && wallet && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Empty Accounts" value={emptyAccounts.length} warn={emptyAccounts.length > 0} />
            <Stat label="Dust Accounts" value={dustAccounts.length} warn={dustAccounts.length > 0} />
            <Stat label="Locked Tokens" value={summaryStats.totalLockedTokens} color="blue" />
            <Stat label="Pump.fun Tokens" value={pumpfunCount} color="purple" />
          </div>
        )}

        {/* EMPTY ACCOUNTS SECTION */}
        {!scanProgress.isScanning && wallet && emptyAccounts.length > 0 && (
          <div className="mb-6 p-5 rounded-2xl border border-[#00e85e]/[0.08] bg-[#00e85e]/[0.015] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00e85e]/[0.08] border border-[#00e85e]/[0.12] flex items-center justify-center">
                <svg className="w-4 h-4 text-[#00e85e]/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] text-white/70 font-medium">{emptyAccounts.length} empty token accounts</p>
                <p className="text-[12px] text-white/25">Close them to reclaim ~{formatSOL(emptyAccounts.length * RENT)} SOL in rent</p>
              </div>
            </div>
            <button
              onClick={handleCloseEmpty}
              disabled={isProcessing}
              className="btn-shimmer bg-gradient-to-r from-[#00e85e] to-[#00c4aa] text-[#060608] font-semibold text-[12px] px-5 py-2.5 rounded-xl hover:shadow-[0_0_20px_rgba(0,232,94,0.15)] transition-all disabled:opacity-30"
            >
              Close & Reclaim Rent
            </button>
          </div>
        )}

        {/* DUST TOKENS SECTION — selectable */}
        {!scanProgress.isScanning && wallet && dustAccounts.length > 0 && (
          <div className="mb-6 rounded-2xl border border-white/[0.05] bg-white/[0.01] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                <span className="text-[13px] text-white/60 font-medium">Dust Tokens</span>
                <span className="text-[11px] text-white/20 ml-1">Select tokens to recover</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAllDust}
                  className="text-[11px] text-white/30 hover:text-white/60 transition-colors font-medium"
                >
                  {selectedDust.size === dustAccounts.length ? 'Deselect All' : 'Select All'}
                </button>
                {selectedDust.size > 0 && (
                  <button
                    onClick={handleRecoverDust}
                    disabled={isProcessing}
                    className="text-[12px] font-medium bg-amber-500/[0.1] border border-amber-500/[0.15] text-amber-300/80 px-4 py-1.5 rounded-lg hover:bg-amber-500/[0.18] transition-all disabled:opacity-30"
                  >
                    Recover {selectedDust.size} token{selectedDust.size !== 1 ? 's' : ''} (+{formatSOL(selectedDust.size * RENT)} SOL rent)
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.03]">
                    <th className="text-left px-6 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={dustAccounts.length > 0 && selectedDust.size === dustAccounts.length}
                        onChange={selectAllDust}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-3 text-[11px] text-white/20 font-medium">Mint</th>
                    <th className="text-right px-6 py-3 text-[11px] text-white/20 font-medium">Balance</th>
                    <th className="text-right px-6 py-3 text-[11px] text-white/20 font-medium">Rent Reclaimable</th>
                  </tr>
                </thead>
                <tbody>
                  {dustAccounts.map((account) => (
                    <tr
                      key={account.pubkey}
                      className={`border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors cursor-pointer ${selectedDust.has(account.pubkey) ? 'bg-amber-500/[0.03]' : ''}`}
                      onClick={() => toggleDust(account.pubkey)}
                    >
                      <td className="px-6 py-3">
                        <input
                          type="checkbox"
                          checked={selectedDust.has(account.pubkey)}
                          onChange={() => toggleDust(account.pubkey)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] text-white/40">
                        {truncateAddress(account.mint, 8)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[12px] text-amber-400/60">
                        {account.uiAmount}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[12px] text-[#00e85e]/50">
                        ~{RENT.toFixed(4)} SOL
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-white/[0.03] flex items-center justify-between text-[11px]">
              <span className="text-white/15">{selectedDust.size} of {dustAccounts.length} selected</span>
              <span className="text-white/20">
                Dust tokens are cleared from your wallet. Rent (~{RENT.toFixed(4)} SOL/account) is returned to you.
              </span>
            </div>
          </div>
        )}

        {/* EMPTY TOKEN ACCOUNTS TABLE */}
        {!scanProgress.isScanning && wallet && emptyAccounts.length > 0 && (
          <div className="mb-6 rounded-2xl border border-white/[0.05] bg-white/[0.01] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-gray-500/50" />
                <span className="text-[13px] text-white/60 font-medium">Empty Accounts</span>
              </div>
              <span className="text-[12px] text-white/20">{emptyAccounts.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.03]">
                    <th className="text-left px-6 py-3 text-[11px] text-white/20 font-medium">Mint</th>
                    <th className="text-right px-6 py-3 text-[11px] text-white/20 font-medium">Balance</th>
                    <th className="text-right px-6 py-3 text-[11px] text-white/20 font-medium">Rent</th>
                  </tr>
                </thead>
                <tbody>
                  {emptyAccounts.map((account) => (
                    <tr key={account.pubkey} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-3 font-mono text-[12px] text-white/40">{truncateAddress(account.mint, 8)}</td>
                      <td className="px-6 py-3 text-right font-mono text-[12px] text-white/20">0</td>
                      <td className="px-6 py-3 text-right font-mono text-[12px] text-[#00e85e]/50">~{RENT.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pump.fun banner */}
        {!scanProgress.isScanning && pumpfunCount > 0 && (
          <div className="mb-6 p-5 rounded-2xl border border-purple-500/[0.08] bg-purple-500/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/[0.08] border border-purple-500/[0.12] flex items-center justify-center">
                <svg className="w-4 h-4 text-purple-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] text-white/70 font-medium">{pumpfunCount} creator tokens detected</p>
                <p className="text-[12px] text-white/25">Claimable trading fees available</p>
              </div>
            </div>
            <button
              onClick={handleClaimFees}
              disabled={isProcessing}
              className="text-[12px] font-medium bg-purple-500/[0.08] border border-purple-500/[0.15] text-purple-300/80 px-4 py-2 rounded-lg hover:bg-purple-500/[0.15] transition-all disabled:opacity-30"
            >
              Claim Fees
            </button>
          </div>
        )}

        {/* Action row */}
        {!scanProgress.isScanning && wallet && (
          <div className="flex gap-2.5 mb-6">
            <button
              onClick={handleScanPumpfun}
              disabled={isProcessing || isPumpfunScanning}
              className="text-[12px] font-medium border border-white/[0.06] text-white/35 hover:text-white/60 hover:border-white/[0.1] px-4 py-2 rounded-lg transition-all disabled:opacity-20"
            >
              Scan Pump.fun
            </button>
          </div>
        )}

        {/* Processing */}
        {isProcessing && (
          <div className="mb-6 p-4 rounded-2xl border border-[#00e85e]/[0.08] bg-[#00e85e]/[0.015] flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-[#00e85e]/20 border-t-[#00e85e] rounded-full animate-spin" />
            <p className="text-[13px] text-[#00e85e]/60">{processStatus}</p>
          </div>
        )}

        {/* Clean state */}
        {!scanProgress.isScanning && wallet && emptyAccounts.length === 0 && dustAccounts.length === 0 && wallet.lockedTokens.length === 0 && (
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#00e85e]/[0.06] border border-[#00e85e]/[0.1] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#00e85e]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[15px] text-white/50 font-medium mb-1">Wallet is clean</p>
            <p className="text-[13px] text-white/20">No reclaimable accounts found</p>
          </div>
        )}

        {/* Error */}
        {wallet?.error && (
          <div className="mt-6 p-5 rounded-2xl border border-red-500/[0.08] bg-red-500/[0.02] flex items-start gap-3">
            <svg className="w-4 h-4 text-red-400/50 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-[13px] text-red-400/60">{wallet.error}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, warn, color }: { label: string; value: number; warn?: boolean; color?: 'blue' | 'purple' }) {
  const accent = color === 'blue' ? '#3b82f6' : color === 'purple' ? '#a855f7' : warn ? '#f59e0b' : undefined;
  const border = accent ? `1px solid ${accent}12` : '1px solid rgba(255,255,255,0.04)';
  const bg = accent ? `${accent}04` : 'rgba(255,255,255,0.01)';

  return (
    <div className="p-5 rounded-2xl transition-colors card-hover" style={{ border, backgroundColor: bg }}>
      <p className="text-[11px] text-white/20 font-medium mb-2">{label}</p>
      <p className="text-[22px] font-bold tracking-tight" style={{ color: accent || 'rgba(255,255,255,0.8)' }}>
        {value}
      </p>
    </div>
  );
}
