'use client';

import { useState } from 'react';
import { Keypair } from '@solana/web3.js';
import SetupScreen from '@/components/SetupScreen';
import WalletManager from '@/components/WalletManager';

export default function Home() {
  const [keypairs, setKeypairs] = useState<Keypair[] | null>(null);
  const [masterAddress, setMasterAddress] = useState<string | null>(null);

  const handleSetupComplete = (kps: Keypair[], master: string) => {
    setKeypairs(kps);
    setMasterAddress(master);
  };

  const handleReset = () => {
    setKeypairs(null);
    setMasterAddress(null);
  };

  if (!keypairs || !masterAddress) {
    return <SetupScreen onSetupComplete={handleSetupComplete} />;
  }

  return <WalletManager keypairs={keypairs} masterAddress={masterAddress} onReset={handleReset} />;
}
