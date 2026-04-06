'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import LandingPage from '@/components/LandingPage';
import WalletManager from '@/components/WalletManager';

export default function Home() {
  const { connected, publicKey } = useWallet();

  if (!connected || !publicKey) {
    return <LandingPage />;
  }

  return <WalletManager />;
}
