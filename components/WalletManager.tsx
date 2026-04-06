'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWalletStore } from '@/store/useWalletStore';
import { scanWallet, processWallet, truncateAddress, formatSOL } from '@/utils/solana';
import { scanWalletForTokens, claimCreatorFees } from '@/utils/pumpfun';

export default function WalletManager() {
  const { publicKey, signTransaction } = useWallet();
  const {
    wallet, scanProgress, summaryStats,
    setWallet, updateWallet, setScanProgress, updateSummaryStats,
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

  useEffect(() => { performScan(); }, [performScan]);

  const handleProcess = async () => {
    if (!wallet || !publicKey || !signTransaction) return;
    const total = wallet.emptyTokenAccounts + wallet.dustTokenAccounts;
    if (total === 0) return;
    if (!confirm(`Close ${wallet.emptyTokenAccounts} empty + burn ${wallet.dustTokenAccounts} dust accounts?`)) return;
    setIsProcessing(true);
    updateWallet({ isProcessing: true });
    const result = await processWallet(wallet, publicKey, signTransaction, (s) => setProcessStatus(s));
    if (result.success) {
      updateWallet({ isProcessing: false, emptyTokenAccounts: 0, dustTokenAccounts: 0, tokenAccounts: [] });
      alert(`Closed ${result.accountsClosed} accounts, reclaimed ${formatSOL(result.solReclaimed)} SOL`);
    } else {
      updateWallet({ isProcessing: false, error: result.error });
    }
    setIsProcessing(false);
    setProcessStatus('');
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
  const hasAccounts = wallet ? wallet.emptyTokenAccounts > 0 || wallet.dustTokenAccounts > 0 : false;
  const pumpfunCount = wallet?.pumpfunTokens?.length || 0;
  const reclaimable = wallet ? (wallet.emptyTokenAccounts + wallet.dustTokenAccounts) * RENT : 0;

  return (
    <div className="min-h-screen bg-[#060608] text-white/90 relative">
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-40" />

      {/* ─── NAV ─── */}
      <nav className="w-full border-b border-white/[0.05] backdrop-blur-2xl sticky top-0 z-50 bg-[#060608]/80">
        <div className="max-w-[1100px] mx-auto px-6 h-[56px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0a0a0c] border border-[#00e85e]/30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#00e85e] shadow-[0_0_10px_rgba(0,232,94,0.35)]" />
            </div>
            <span className="font-mono font-bold text-[15px] tracking-wide">NULLSET</span>
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
        {/* Loading state */}
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

        {/* ─── HERO STAT ─── */}
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
                    <p className="text-[11px] text-[#00e85e]/40 mb-1 font-medium">RECLAIMABLE</p>
                    <p className="text-2xl font-bold tracking-tight text-[#00e85e]">
                      {formatSOL(reclaimable)}
                      <span className="text-sm font-normal text-[#00e85e]/40 ml-1">SOL</span>
                    </p>
                  </div>
                </div>
              </div>

              {hasAccounts && (
                <button
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="btn-shimmer bg-gradient-to-r from-[#00e85e] to-[#00c4aa] text-[#060608] font-semibold text-[13px] px-6 py-3 rounded-xl hover:shadow-[0_0_30px_rgba(0,232,94,0.15)] transition-all disabled:opacity-30"
                >
                  Recover {wallet.emptyTokenAccounts + wallet.dustTokenAccounts} accounts
                </button>
              )}
            </div>
          </div>
        )}

        {/* ─── STAT GRID ─── */}
        {!scanProgress.isScanning && wallet && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Empty Accounts" value={summaryStats.totalEmptyAccounts} warn={summaryStats.totalEmptyAccounts > 0} />
            <Stat label="Dust Accounts" value={summaryStats.totalDustAccounts} warn={summaryStats.totalDustAccounts > 0} />
            <Stat label="Locked Tokens" value={summaryStats.totalLockedTokens} color="blue" />
            <Stat label="Pump.fun Tokens" value={pumpfunCount} color="purple" />
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

        {/* ─── TOKEN TABLE ─── */}
        {!scanProgress.isScanning && wallet && wallet.tokenAccounts.length > 0 && (
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                <span className="text-[13px] text-white/60 font-medium">Token Accounts</span>
              </div>
              <span className="text-[12px] text-white/20">{wallet.tokenAccounts.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.03]">
                    <th className="text-left px-6 py-3 text-[11px] text-white/20 font-medium">Mint Address</th>
                    <th className="text-right px-6 py-3 text-[11px] text-white/20 font-medium">Balance</th>
                    <th className="text-right px-6 py-3 text-[11px] text-white/20 font-medium">Status</th>
                    <th className="text-right px-6 py-3 text-[11px] text-white/20 font-medium">Rent</th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.tokenAccounts.map((account) => (
                    <tr key={account.pubkey} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-3 font-mono text-[12px] text-white/40">
                        {truncateAddress(account.mint, 8)}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[12px] text-white/35">
                        {account.uiAmount}
                      </td>
                      <td className="px-6 py-3 text-right">
                        {account.uiAmount === 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400/70 bg-amber-500/[0.06] px-2 py-[3px] rounded-md font-medium">
                            <span className="w-1 h-1 rounded-full bg-amber-400/70" />
                            Empty
                          </span>
                        ) : (
                          <span className="text-[11px] text-white/20 bg-white/[0.02] px-2 py-[3px] rounded-md font-medium">
                            Dust
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-[12px] text-[#00e85e]/50">
                        ~{RENT.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Clean state */}
        {!scanProgress.isScanning && wallet && !hasAccounts && wallet.lockedTokens.length === 0 && wallet.tokenAccounts.length === 0 && (
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

/* ─── Stat Card ─── */
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
