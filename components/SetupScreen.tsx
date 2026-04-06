'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function SetupScreen() {
  const { connected } = useWallet();

  const gridBgStyle = {
    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    backgroundSize: '30px 30px',
  };

  return (
    <div className="min-h-screen bg-[#050505] text-gray-200 flex items-center justify-center p-6" style={gridBgStyle}>
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="bg-green-500/20 p-2 rounded-lg">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold tracking-tighter">
              NULLSET
            </h1>
          </div>
          <p className="text-gray-400 text-lg mb-2">
            Solana Wallet Recovery Dashboard
          </p>
          <p className="text-gray-500 text-sm">
            Reclaim rent from empty token accounts, burn dust, and recover locked value.
          </p>
        </div>

        {/* Connect Wallet Card */}
        <div className="p-8 border border-white/10 rounded-xl bg-white/[0.02] text-center">
          <div className="mb-6">
            <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
            </svg>
            <h2 className="text-xl font-semibold text-gray-200 mb-2">
              Connect Your Wallet
            </h2>
            <p className="text-sm text-gray-500">
              Connect with Phantom, Solflare, or any Solana wallet to scan and recover value.
            </p>
          </div>

          <div className="flex justify-center">
            <WalletMultiButton
              style={{
                backgroundColor: '#16a34a',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                height: '3rem',
                padding: '0 2rem',
              }}
            />
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="p-4 border border-white/5 rounded-xl bg-white/[0.01]">
            <p className="text-xs text-green-400 font-medium mb-1">RENT RECOVERY</p>
            <p className="text-xs text-gray-500">Close empty token accounts and reclaim ~0.002 SOL each</p>
          </div>
          <div className="p-4 border border-white/5 rounded-xl bg-white/[0.01]">
            <p className="text-xs text-blue-400 font-medium mb-1">LOCKED TOKENS</p>
            <p className="text-xs text-gray-500">Detect and claim unlocked vesting contracts</p>
          </div>
          <div className="p-4 border border-white/5 rounded-xl bg-white/[0.01]">
            <p className="text-xs text-purple-400 font-medium mb-1">PUMP.FUN FEES</p>
            <p className="text-xs text-gray-500">Scan for and claim creator reward fees</p>
          </div>
        </div>
      </div>
    </div>
  );
}
