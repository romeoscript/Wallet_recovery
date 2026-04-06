'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import WalletManager from '@/components/WalletManager';

export default function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!connected || !publicKey) {
      router.push('/');
    }
  }, [connected, publicKey, router]);

  if (!connected || !publicKey) {
    return null;
  }

  return <WalletManager />;
}
