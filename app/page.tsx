'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import SetupScreen from '@/components/SetupScreen';
import WalletManager from '@/components/WalletManager';

export default function Home() {
  const { connected, publicKey } = useWallet();

  if (!connected || !publicKey) {
    return <SetupScreen />;
  }

  return <WalletManager />;
}
