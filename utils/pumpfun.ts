import {
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import { PumpFunTokenInfo, ClaimFeesResult, WalletInfo } from '@/types';
import { connection, truncateAddress } from './solana';

// Pump.fun Program ID
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// PumpPortal API endpoints
const PUMPPORTAL_API_LOCAL = 'https://pumpportal.fun/api/trade-local';

// Wallet adapter signing type for versioned transactions
type SignVersionedTransaction = (transaction: VersionedTransaction) => Promise<VersionedTransaction>;

/**
 * Detect tokens created by a wallet address by scanning transaction history
 */
export async function detectCreatedTokens(
  walletAddress: PublicKey,
  limit = 100
): Promise<PumpFunTokenInfo[]> {
  const createdTokens: PumpFunTokenInfo[] = [];

  try {
    const signatures = await connection.getSignaturesForAddress(walletAddress, {
      limit,
    });

    console.log(`Found ${signatures.length} transactions for ${walletAddress.toBase58()}`);

    for (const sigInfo of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) continue;

        const isPumpFunTx = tx.transaction.message.accountKeys.some(
          (key) => key.pubkey.equals(PUMPFUN_PROGRAM_ID)
        );

        if (!isPumpFunTx) continue;

        const logs = tx.meta.logMessages || [];

        const isCreateTx = logs.some(
          (log) =>
            log.includes('Program log: Create') ||
            log.includes('invoke [1]: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
        );

        if (isCreateTx) {
          const postTokenBalances = tx.meta.postTokenBalances || [];

          let mintAddress: string | undefined;
          let bondingCurve: string | undefined;

          if (postTokenBalances.length > 0) {
            mintAddress = postTokenBalances[0].mint;
          }

          const accountKeys = tx.transaction.message.accountKeys;
          for (const key of accountKeys) {
            const addr = key.pubkey.toBase58();
            if (
              addr !== walletAddress.toBase58() &&
              addr !== PUMPFUN_PROGRAM_ID.toBase58() &&
              mintAddress &&
              addr !== mintAddress
            ) {
              bondingCurve = addr;
              break;
            }
          }

          if (mintAddress) {
            createdTokens.push({
              mint: mintAddress,
              createdAt: sigInfo.blockTime || Date.now() / 1000,
              signature: sigInfo.signature,
              bondingCurve,
              hasGraduated: false,
              estimatedFees: 0,
            });
          }
        }
      } catch (txError) {
        console.error(`Failed to parse transaction ${sigInfo.signature}:`, txError);
      }
    }

    console.log(`Detected ${createdTokens.length} pump.fun tokens for ${walletAddress.toBase58()}`);
  } catch (error) {
    console.error(`Error detecting created tokens for ${walletAddress.toBase58()}:`, error);
  }

  return createdTokens;
}

/**
 * Claim creator fees for all tokens created by a wallet
 * Uses PumpPortal API to generate the transaction, then signs via wallet adapter
 */
export async function claimCreatorFees(
  wallet: WalletInfo,
  signTransaction: SignVersionedTransaction,
  onProgress?: (status: string) => void
): Promise<ClaimFeesResult> {
  try {
    if (!wallet.pumpfunTokens || wallet.pumpfunTokens.length === 0) {
      return {
        success: false,
        error: 'No pump.fun tokens found for this wallet',
        tokensClaimed: 0,
        feesCollected: 0,
      };
    }

    onProgress?.(`Claiming fees for ${wallet.pumpfunTokens.length} created tokens...`);

    const requestBody = {
      publicKey: wallet.address,
      action: 'collectCreatorFee',
      priorityFee: 0.00001,
      pool: 'pump',
    };

    onProgress?.('Requesting claim transaction from PumpPortal...');

    const response = await fetch(PUMPPORTAL_API_LOCAL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpPortal API error: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();

    const txBuffer = Buffer.from(responseData.transaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);

    onProgress?.('Signing and sending claim transaction...');

    // Sign via wallet adapter
    const signed = await signTransaction(transaction);

    const signature = await connection.sendTransaction(signed, {
      skipPreflight: true,
      maxRetries: 3,
    });

    onProgress?.('Waiting for confirmation...');

    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    onProgress?.(`Claimed fees! Signature: ${signature}`);

    return {
      success: true,
      signature,
      tokensClaimed: wallet.pumpfunTokens.length,
      feesCollected: 0,
    };
  } catch (error) {
    console.error('Error claiming creator fees:', error);
    return {
      success: false,
      error: (error as Error).message,
      tokensClaimed: 0,
      feesCollected: 0,
    };
  }
}

/**
 * Scan a wallet for created pump.fun tokens
 */
export async function scanWalletForTokens(
  wallet: WalletInfo,
  onProgress?: (status: string) => void
): Promise<WalletInfo> {
  try {
    onProgress?.(`Scanning ${truncateAddress(wallet.address)} for pump.fun tokens...`);
    const createdTokens = await detectCreatedTokens(new PublicKey(wallet.address), 100);

    return {
      ...wallet,
      pumpfunTokens: createdTokens,
    };
  } catch (error) {
    console.error(`Error scanning wallet ${wallet.address}:`, error);
    return {
      ...wallet,
      pumpfunTokens: [],
    };
  }
}
