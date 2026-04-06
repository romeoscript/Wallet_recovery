'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function LandingPage() {
  const { connected } = useWallet();
  const [isSimulating, setIsSimulating] = useState(false);
  const [showCTA, setShowCTA] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<
    Array<{ text: string; type: string }>
  >([]);
  const [statCounter, setStatCounter] = useState({ sol: 0, accounts: 0 });
  const terminalRef = useRef<HTMLDivElement>(null);
  const hasAutoPlayed = useRef(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const addLog = (text: string, type = 'default') => {
    setTerminalOutput((prev) => [...prev, { text, type }]);
    if (terminalRef.current) {
      setTimeout(() => {
        terminalRef.current?.scrollTo({ top: terminalRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    }
  };

  const startDemo = async () => {
    setTerminalOutput([]);
    setShowCTA(false);
    setIsSimulating(true);
    setStatCounter({ sol: 0, accounts: 0 });

    addLog('$ glean scan --network mainnet', 'command');
    await sleep(600);
    addLog('Connecting to Solana RPC...', 'dim');
    await sleep(400);
    addLog('Wallet connected: 8xQt...7k9P', 'success');
    await sleep(500);
    addLog('Scanning token accounts...', 'dim');
    await sleep(400);

    let totalRent = 0;
    let totalAccounts = 0;

    const prefixes = ['Gk4r', 'HsN2', 'Jm8q', '4xBz', 'BqR7', 'RzWp'];
    for (let i = 0; i < prefixes.length; i++) {
      const found = Math.floor(Math.random() * 5) + 1;
      const rent = 0.002039 * found;

      addLog(`  Checking ${prefixes[i]}...${Math.floor(1000 + Math.random() * 9000)}`, 'dim');
      await sleep(120);

      if (Math.random() > 0.15) {
        totalRent += rent;
        totalAccounts += found;
        setStatCounter({ sol: totalRent, accounts: totalAccounts });
        addLog(`  Found ${found} empty accounts  (+${rent.toFixed(6)} SOL)`, 'success');
        await sleep(200);
      }
    }

    addLog('', 'spacer');
    addLog('Detecting dust balances...', 'dim');
    await sleep(500);
    addLog('  420,690 $BONK (dust)', 'warn');
    addLog('  12,000 $WIF (dust)', 'warn');
    await sleep(300);

    addLog('', 'spacer');
    addLog('Checking Streamflow vesting...', 'dim');
    await sleep(400);
    addLog('  1 claimable contract found', 'success');
    await sleep(400);

    addLog('', 'spacer');
    addLog('---------- RECOVERY REPORT ----------', 'divider');
    addLog(`  Reclaimable rent   ${totalRent.toFixed(6)} SOL`, 'highlight');
    addLog('  Burnable dust      2 accounts', 'highlight');
    addLog('  Claimable vesting  1 contract', 'highlight');
    addLog(`  TOTAL              ${(totalRent + 0.004).toFixed(6)} SOL`, 'total');
    addLog('-------------------------------------', 'divider');
    await sleep(1000);

    setIsSimulating(false);
    setShowCTA(true);
  };

  // Auto-play demo on first mount after a short delay
  useEffect(() => {
    if (hasAutoPlayed.current) return;
    hasAutoPlayed.current = true;
    const timer = setTimeout(() => {
      startDemo();
    }, 1500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logStyle = (type: string) => {
    const base = 'font-mono text-[12.5px] leading-[22px] animate-slide-in whitespace-pre';
    switch (type) {
      case 'command': return `${base} text-white/90 font-semibold`;
      case 'success': return `${base} text-emerald-400`;
      case 'warn': return `${base} text-amber-400/80`;
      case 'highlight': return `${base} text-white/80`;
      case 'total': return `${base} text-[#00e85e] font-bold`;
      case 'divider': return `${base} text-white/10`;
      case 'dim': return `${base} text-white/30`;
      case 'spacer': return 'h-2';
      default: return `${base} text-white/40`;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#060608] text-white/90 relative overflow-hidden">
      {/* Background layers */}
      <div className="fixed inset-0 hero-glow pointer-events-none" />
      <div className="fixed inset-0 hero-glow-2 pointer-events-none" />
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-60" />

      {/* ─── NAV ─── */}
      <nav className="w-full border-b border-white/[0.05] backdrop-blur-2xl fixed top-0 z-50 bg-[#060608]/70">
        <div className="max-w-[1200px] mx-auto px-6 h-[56px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-lg bg-[#00e85e]/20 blur-sm" />
              <div className="relative w-8 h-8 rounded-lg bg-[#0a0a0c] border border-[#00e85e]/30 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#00e85e] shadow-[0_0_10px_var(--green-glow)]" />
              </div>
            </div>
            <span className="font-mono font-bold text-[15px] tracking-wide">GLEAN</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#how" className="text-[13px] text-white/40 hover:text-white/80 transition-colors">How it works</a>
            <a href="#features" className="text-[13px] text-white/40 hover:text-white/80 transition-colors">Features</a>
            <WalletMultiButton
              style={{
                background: 'linear-gradient(135deg, #00e85e 0%, #00c4aa 100%)',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontFamily: 'IBM Plex Mono, monospace',
                fontWeight: 600,
                height: '36px',
                padding: '0 18px',
                color: '#060608',
                border: 'none',
                letterSpacing: '0.02em',
              }}
            />
          </div>
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <main className="flex-grow pt-[56px] relative">
        <section className="relative pt-24 pb-10 px-6">
          <div className="max-w-[1200px] mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.06] bg-white/[0.02]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00e85e] opacity-50"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00e85e]"></span>
                </span>
                <span className="text-[12px] text-white/50 font-medium">Solana Mainnet</span>
                <span className="text-white/10">|</span>
                <span className="text-[12px] text-white/35">Avg. recovery 1.2 SOL</span>
              </div>
            </div>

            {/* Headline */}
            <div className="text-center mb-10 max-w-3xl mx-auto">
              <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-bold tracking-[-0.035em] leading-[1.05] mb-6">
                Recover the SOL
                <br />
                <span className="text-gradient">you&apos;re leaving behind.</span>
              </h1>
              <p className="text-[17px] text-white/40 leading-relaxed max-w-lg mx-auto">
                Every empty token account locks <span className="text-white/70">0.002 SOL</span> in rent.
                Connect your wallet, scan, and reclaim it all in one click.
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap justify-center gap-3 mb-16">
              <WalletMultiButton
                style={{
                  background: 'linear-gradient(135deg, #00e85e 0%, #00c4aa 100%)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontWeight: 600,
                  height: '48px',
                  padding: '0 28px',
                  color: '#060608',
                  border: 'none',
                  boxShadow: '0 0 40px rgba(0,232,94,0.15), 0 4px 20px rgba(0,0,0,0.3)',
                  letterSpacing: '0.02em',
                }}
              />
              <button
                onClick={() => { if (!isSimulating && !showCTA) startDemo(); }}
                disabled={isSimulating}
                className="group flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.06] text-white/70 hover:text-white px-6 h-12 rounded-[10px] transition-all text-[14px] font-medium disabled:opacity-30"
              >
                <svg className="w-4 h-4 text-[#00e85e] opacity-70 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                {isSimulating ? 'Running...' : showCTA ? 'Replay Demo' : 'Watch Demo'}
              </button>
            </div>

            {/* ─── TERMINAL ─── */}
            <div className="relative w-full max-w-[720px] mx-auto mb-10">
              {/* Glow behind terminal */}
              <div className="absolute -inset-1 bg-gradient-to-b from-[#00e85e]/[0.06] via-transparent to-transparent rounded-2xl blur-xl pointer-events-none" />

              <div className="relative rounded-2xl border border-white/[0.06] overflow-hidden bg-[#0b0b0e] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                {/* Terminal chrome */}
                <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.04]">
                  <div className="flex gap-[6px]">
                    <div className="w-[10px] h-[10px] rounded-full bg-white/[0.06] hover:bg-red-500/40 transition-colors" />
                    <div className="w-[10px] h-[10px] rounded-full bg-white/[0.06] hover:bg-yellow-500/40 transition-colors" />
                    <div className="w-[10px] h-[10px] rounded-full bg-white/[0.06] hover:bg-green-500/40 transition-colors" />
                  </div>
                  <span className="font-mono text-[10px] text-white/20 tracking-widest">GLEAN</span>
                  <div className="w-12" />
                </div>

                {/* Terminal body */}
                <div ref={terminalRef} className="p-5 h-[340px] overflow-y-auto relative">
                  {terminalOutput.length === 0 && !isSimulating ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center animate-float">
                        <svg className="w-5 h-5 text-[#00e85e]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-white/25 text-sm text-center">
                        Click <span className="text-white/50">&quot;Watch Demo&quot;</span> to see a simulated recovery
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-[2px] pb-12">
                      {terminalOutput.map((log, idx) => (
                        <div key={idx} className={logStyle(log.type)}>
                          {log.type === 'spacer' ? null : log.text}
                        </div>
                      ))}
                      {isSimulating && (
                        <div className="mt-1 flex items-center gap-1">
                          <div className="w-[7px] h-[14px] bg-[#00e85e]/80 animate-pulse rounded-[1px]" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Post-demo CTA */}
                  {showCTA && (
                    <div className="absolute inset-0 bg-[#0b0b0e]/[0.97] backdrop-blur-md flex flex-col items-center justify-center text-center p-8 z-20 animate-fade-in">
                      <div className="w-14 h-14 rounded-2xl bg-[#00e85e]/[0.08] border border-[#00e85e]/20 flex items-center justify-center mb-5">
                        <svg className="w-6 h-6 text-[#00e85e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="font-mono text-[11px] text-white/30 tracking-[0.2em] mb-3">SIMULATION RESULT</p>
                      <p className="text-4xl font-bold text-[#00e85e] text-glow mb-1 font-mono">
                        +{statCounter.sol.toFixed(4)} SOL
                      </p>
                      <p className="text-white/30 text-sm mb-8">
                        from {statCounter.accounts} reclaimable accounts
                      </p>
                      <WalletMultiButton
                        style={{
                          background: 'linear-gradient(135deg, #00e85e 0%, #00c4aa 100%)',
                          borderRadius: '10px',
                          fontSize: '13px',
                          fontFamily: 'IBM Plex Mono, monospace',
                          fontWeight: 600,
                          height: '44px',
                          padding: '0 24px',
                          color: '#060608',
                          border: 'none',
                          boxShadow: '0 0 30px rgba(0,232,94,0.15)',
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Status bar */}
                {isSimulating && (
                  <div className="px-5 py-2 border-t border-white/[0.04] flex items-center justify-between font-mono text-[10px]">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00e85e] animate-pulse" />
                      <span className="text-white/25 tracking-wider">SCANNING</span>
                    </div>
                    <span className="text-[#00e85e]/70 tracking-wider">
                      {statCounter.accounts} ACCTS / {statCounter.sol.toFixed(6)} SOL
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ─── STATS RIBBON ─── */}
        <section className="border-y border-white/[0.04] bg-white/[0.01] py-5">
          <div className="max-w-[1200px] mx-auto px-6 flex justify-between items-center">
            {[
              { n: '~0.002', label: 'SOL per account' },
              { n: '3', label: 'protocols scanned' },
              { n: '1.2', label: 'avg SOL recovered' },
              { n: '100%', label: 'client-side signing' },
            ].map((s, i) => (
              <div key={i} className="text-center flex-1">
                <p className="text-lg font-semibold text-white/80 tracking-tight">{s.n}</p>
                <p className="text-[11px] text-white/25 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section id="how" className="py-24 px-6">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-14">
              <p className="text-[12px] font-mono text-[#00e85e]/40 tracking-[0.2em] mb-3">HOW IT WORKS</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold tracking-tight">
                Three steps. <span className="text-gradient">That&apos;s it.</span>
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  n: '01',
                  title: 'Connect',
                  desc: 'Link your Phantom, Solflare, or any Solana wallet. We never see your keys.',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  ),
                },
                {
                  n: '02',
                  title: 'Scan',
                  desc: 'We read your on-chain token accounts and detect empty slots, dust, locked tokens, and creator fees.',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                  ),
                },
                {
                  n: '03',
                  title: 'Recover',
                  desc: 'Close accounts, burn dust, reclaim SOL. You approve every transaction in your wallet.',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ),
                },
              ].map((step, i) => (
                <div key={i} className="relative group p-7 rounded-2xl border border-white/[0.05] bg-white/[0.015] card-hover">
                  <div className="absolute top-6 right-6 font-mono text-[48px] font-bold text-white/[0.025] leading-none select-none">
                    {step.n}
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#00e85e]/[0.06] border border-[#00e85e]/[0.1] flex items-center justify-center text-[#00e85e]/60 mb-5 group-hover:text-[#00e85e] group-hover:border-[#00e85e]/20 transition-all">
                    {step.icon}
                  </div>
                  <h3 className="text-[17px] font-semibold text-white/90 mb-2">{step.title}</h3>
                  <p className="text-[14px] text-white/35 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section id="features" className="py-24 px-6 border-t border-white/[0.04]">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center mb-14">
              <p className="text-[12px] font-mono text-[#00e85e]/40 tracking-[0.2em] mb-3">WHAT WE RECOVER</p>
              <h2 className="text-3xl md:text-[2.5rem] font-bold tracking-tight">
                Every source of <span className="text-gradient">hidden value.</span>
              </h2>
              <p className="text-white/30 text-[15px] mt-4 max-w-md mx-auto">
                Glean scans your wallet for all recoverable SOL across multiple protocols.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  title: 'Empty Token Accounts',
                  desc: 'Close zero-balance token accounts and reclaim ~0.002 SOL rent locked in each.',
                  color: '#00e85e',
                  tag: 'RENT',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
                },
                {
                  title: 'Pump.fun Creator Rewards',
                  desc: 'Detect tokens you created on Pump.fun and claim accumulated trading fees.',
                  color: '#a855f7',
                  tag: 'FEES',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
                },
                {
                  title: 'Locked & Vested Tokens',
                  desc: 'Detect Streamflow and Jupiter Lock vesting contracts, claim unlocked portions.',
                  color: '#3b82f6',
                  tag: 'VESTING',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />,
                },
                {
                  title: 'Dust Token Balances',
                  desc: 'Burn worthless micro-balances and reclaim the rent from bloated accounts.',
                  color: '#f59e0b',
                  tag: 'DUST',
                  icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />,
                },
              ].map((f, i) => (
                <div key={i} className="group p-6 rounded-2xl border border-white/[0.05] bg-white/[0.015] card-hover">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105"
                      style={{ backgroundColor: `${f.color}0a`, border: `1px solid ${f.color}18`, color: f.color }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{f.icon}</svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h3 className="font-semibold text-white/90 text-[15px]">{f.title}</h3>
                        <span
                          className="font-mono text-[9px] tracking-[0.12em] px-1.5 py-[2px] rounded-md"
                          style={{ backgroundColor: `${f.color}0c`, color: `${f.color}aa` }}
                        >
                          {f.tag}
                        </span>
                      </div>
                      <p className="text-[13.5px] text-white/35 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Security callout */}
            <div className="mt-8 p-5 rounded-2xl border border-[#00e85e]/[0.08] bg-[#00e85e]/[0.015] flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-[#00e85e]/[0.06] border border-[#00e85e]/[0.1] flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-[#00e85e]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] text-white/70 font-medium mb-0.5">Wallet Adapter Security</p>
                <p className="text-[13px] text-white/30 leading-relaxed">
                  Built on the official Solana Wallet Adapter. Your private keys and seed phrase are never accessed.
                  You sign and approve every transaction in your own wallet.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ─── BOTTOM CTA ─── */}
        <section className="py-28 px-6 border-t border-white/[0.04] relative">
          <div className="absolute inset-0 hero-glow pointer-events-none opacity-50" />
          <div className="max-w-lg mx-auto text-center relative">
            <h2 className="text-3xl md:text-[2.5rem] font-bold tracking-tight mb-4">
              Stop leaving SOL
              <br />
              <span className="text-gradient">on the table.</span>
            </h2>
            <p className="text-white/30 text-[15px] mb-10">
              Connect. Scan. Recover. It takes seconds.
            </p>
            <WalletMultiButton
              style={{
                background: 'linear-gradient(135deg, #00e85e 0%, #00c4aa 100%)',
                borderRadius: '12px',
                fontSize: '14px',
                fontFamily: 'IBM Plex Mono, monospace',
                fontWeight: 600,
                height: '52px',
                padding: '0 36px',
                color: '#060608',
                border: 'none',
                boxShadow: '0 0 50px rgba(0,232,94,0.12), 0 4px 24px rgba(0,0,0,0.4)',
                letterSpacing: '0.02em',
              }}
            />
          </div>
        </section>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-white/[0.04] py-8 bg-[#060608]">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-[#00e85e]/10 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-sm bg-[#00e85e]/40" />
            </div>
            <span className="font-mono text-[11px] text-white/20 tracking-wider">GLEAN</span>
          </div>
          <p className="text-[11px] text-white/15">Powered by $GLEAN</p>
          <div className="flex gap-4">
            <a href="#" className="text-white/15 hover:text-white/40 transition-colors">
              <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="#" className="text-white/15 hover:text-white/40 transition-colors">
              <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
