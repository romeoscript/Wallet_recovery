'use client';

import { useState } from 'react';
import { Keypair } from '@solana/web3.js';
import {
  deriveKeypairsFromSeed,
  parseSecretKeysJSON,
  secretKeysToKeypairs,
  isValidPublicKey,
} from '@/utils/solana';
import { SetupConfig } from '@/types';

interface SetupScreenProps {
  onSetupComplete: (keypairs: Keypair[], masterAddress: string) => void;
}

export default function SetupScreen({ onSetupComplete }: SetupScreenProps) {
  const [inputType, setInputType] = useState<'seed' | 'keys'>('seed');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [accountCount, setAccountCount] = useState(100);
  const [secretKeysJSON, setSecretKeysJSON] = useState('');
  const [masterAddress, setMasterAddress] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const gridBgStyle = {
    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    backgroundSize: '30px 30px',
  };

  const handleSubmit = async () => {
    setError('');
    setIsLoading(true);

    try {
      // Validate master address
      if (!isValidPublicKey(masterAddress)) {
        throw new Error('Invalid master destination address');
      }

      let keypairs: Keypair[];

      if (inputType === 'seed') {
        // Validate seed phrase
        if (!seedPhrase.trim()) {
          throw new Error('Seed phrase is required');
        }

        keypairs = await deriveKeypairsFromSeed(seedPhrase.trim(), accountCount);
      } else {
        // Validate secret keys JSON
        if (!secretKeysJSON.trim()) {
          throw new Error('Secret keys are required');
        }

        const secretKeys = parseSecretKeysJSON(secretKeysJSON);
        keypairs = secretKeysToKeypairs(secretKeys);
      }

      if (keypairs.length === 0) {
        throw new Error('No valid keypairs generated');
      }

      onSetupComplete(keypairs, masterAddress);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
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
          <p className="text-gray-400 text-lg">
            Initialize your wallet scanner
          </p>
        </div>

        {/* Security Warning */}
        <div className="mb-8 p-6 border border-yellow-500/20 bg-yellow-500/5 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm text-yellow-200/90 leading-relaxed">
                <strong className="text-yellow-400">Security Note:</strong> This application runs entirely on your machine. Your seed phrase and private keys never leave your browser. All operations are performed locally using your RPC endpoint.
              </p>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div className="space-y-6">
          {/* Input Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Input Method
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setInputType('seed')}
                className={`py-3 px-4 text-sm rounded-lg border transition-all ${
                  inputType === 'seed'
                    ? 'border-green-500 bg-green-500 text-black font-medium shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                    : 'border-white/10 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                Seed Phrase
              </button>
              <button
                onClick={() => setInputType('keys')}
                className={`py-3 px-4 text-sm rounded-lg border transition-all ${
                  inputType === 'keys'
                    ? 'border-green-500 bg-green-500 text-black font-medium shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                    : 'border-white/10 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.05]'
                }`}
              >
                Secret Keys (JSON)
              </button>
            </div>
          </div>

          {/* Seed Phrase Input */}
          {inputType === 'seed' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Seed Phrase (12 or 24 words)
                </label>
                <textarea
                  value={seedPhrase}
                  onChange={(e) => setSeedPhrase(e.target.value)}
                  placeholder="Enter your seed phrase..."
                  className="w-full px-4 py-3 bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 placeholder-gray-600 font-mono transition-all"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Number of Accounts to Derive
                </label>
                <input
                  type="number"
                  value={accountCount}
                  onChange={(e) => setAccountCount(parseInt(e.target.value) || 100)}
                  min={1}
                  max={1000}
                  className="w-full px-4 py-3 bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 transition-all"
                />
                <p className="mt-2 text-xs text-gray-500">
                  Recommended: 100 accounts (path m/44&apos;/501&apos;/0-99&apos;/0&apos;)
                </p>
              </div>
            </>
          )}

          {/* Secret Keys JSON Input */}
          {inputType === 'keys' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Secret Keys (JSON Array)
              </label>
              <textarea
                value={secretKeysJSON}
                onChange={(e) => setSecretKeysJSON(e.target.value)}
                placeholder='[&#10;  [1,2,3,...],&#10;  [4,5,6,...],&#10;  "base58string"&#10;]'
                className="w-full px-4 py-3 bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 placeholder-gray-600 font-mono transition-all"
                rows={6}
              />
              <p className="mt-2 text-xs text-gray-500">
                Accepts array of Uint8Arrays or base58 strings
              </p>
            </div>
          )}

          {/* Master Address Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Master Destination Address
            </label>
            <input
              type="text"
              value={masterAddress}
              onChange={(e) => setMasterAddress(e.target.value)}
              placeholder="Enter Solana address to receive reclaimed SOL..."
              className="w-full px-4 py-3 bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/50 placeholder-gray-600 font-mono transition-all"
            />
            <p className="mt-2 text-xs text-gray-500">
              All reclaimed SOL and fees will be consolidated to this address
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full py-4 bg-green-600 text-white font-bold text-sm rounded-lg hover:bg-green-500 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Initializing Scanner...
              </span>
            ) : 'Initialize Scanner'}
          </button>
        </div>
      </div>
    </div>
  );
}
