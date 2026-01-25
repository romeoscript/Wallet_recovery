import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { PumpFunTokenInfo, ClaimFeesResult, WalletInfo } from '@/types';
import { connection, transferSOL, truncateAddress } from './solana';

// Pump.fun Program ID
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// PumpPortal API endpoints
const PUMPPORTAL_API_LOCAL = 'https://pumpportal.fun/api/trade-local';

/**
 * Detect tokens created by a wallet address by scanning transaction history
 */
export async function detectCreatedTokens(
  walletAddress: PublicKey,
  limit = 100
): Promise<PumpFunTokenInfo[]> {
  const createdTokens: PumpFunTokenInfo[] = [];

  try {
    // Fetch transaction signatures for this wallet
    const signatures = await connection.getSignaturesForAddress(walletAddress, {
      limit,
    });

    console.log(`Found ${signatures.length} transactions for ${walletAddress.toBase58()}`);

    // Parse each transaction to find token creation events
    for (const sigInfo of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) continue;

        // Check if this transaction interacted with pump.fun program
        const isPumpFunTx = tx.transaction.message.accountKeys.some(
          (key) => key.pubkey.equals(PUMPFUN_PROGRAM_ID)
        );

        if (!isPumpFunTx) continue;

        // Look for token creation by checking instruction data and logs
        const logs = tx.meta.logMessages || [];

        // Pump.fun logs typically contain "Program log: Create" when creating a token
        const isCreateTx = logs.some(
          (log) =>
            log.includes('Program log: Create') ||
            log.includes('invoke [1]: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
        );

        if (isCreateTx) {
          // Try to extract mint address from post token balances
          const postTokenBalances = tx.meta.postTokenBalances || [];

          let mintAddress: string | undefined;
          let bondingCurve: string | undefined;

          // The creator usually gets the first token balance
          if (postTokenBalances.length > 0) {
            mintAddress = postTokenBalances[0].mint;
          }

          // Try to find bonding curve from account keys
          // Bonding curve is typically a PDA derived from mint
          const accountKeys = tx.transaction.message.accountKeys;
          for (const key of accountKeys) {
            const addr = key.pubkey.toBase58();
            // Bonding curves are typically PDAs, skip known addresses
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
              hasGraduated: false, // We'd need to check if it migrated to Raydium
              estimatedFees: 0, // Would need to query bonding curve state
            });
          }
        }
      } catch (txError) {
        // Silent fail for individual transaction parsing
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
 * Uses PumpPortal API to generate the transaction, then signs locally
 */
export async function claimCreatorFees(
  wallet: WalletInfo,
  onProgress?: (status: string) => void
): Promise<ClaimFeesResult> {
  try {
    // Check if wallet has created tokens
    if (!wallet.pumpfunTokens || wallet.pumpfunTokens.length === 0) {
      return {
        success: false,
        error: 'No pump.fun tokens found for this wallet',
        tokensClaimed: 0,
        feesCollected: 0,
      };
    }

    onProgress?.(`Claiming fees for ${wallet.pumpfunTokens.length} created tokens...`);

    // Build the claim request for PumpPortal API
    const requestBody = {
      publicKey: wallet.address,
      action: 'collectCreatorFee',
      priorityFee: 0.00001, // 0.00001 SOL priority fee
      pool: 'pump', // pump.fun pool (claims all fees at once)
    };

    onProgress?.('Requesting claim transaction from PumpPortal...');

    // Call PumpPortal API to generate the transaction
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

    // PumpPortal returns a base64 encoded serialized transaction
    const txBuffer = Buffer.from(responseData.transaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);

    onProgress?.('Signing and sending claim transaction...');

    // Sign the transaction
    transaction.sign([wallet.keypair]);

    // Send the transaction
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: true,
      maxRetries: 3,
    });

    onProgress?.('Waiting for confirmation...');

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    onProgress?.(`✅ Claimed fees! Signature: ${signature}`);

    // We don't know exact fees collected without parsing the transaction
    // Return success with signature
    return {
      success: true,
      signature,
      tokensClaimed: wallet.pumpfunTokens.length,
      feesCollected: 0, // Would need to parse transaction to get exact amount
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
 * Auto-fund and claim creator fees for wallets with created tokens
 * Similar to autoFundWallets but specifically for fee claiming
 */
export async function autoFundAndClaimFees(
  wallets: WalletInfo[],
  onProgress?: (status: string) => void
): Promise<{
  claimedCount: number;
  totalFeesClaimed: number;
  fundedCount: number;
  errors: string[];
}> {
  const MIN_SOL_FOR_CLAIM = 0.001; // Amount needed to claim fees
  const MIN_SOL_TO_LEND = 0.01; // Wallets need at least this much to be lenders

  // Find wallets that created tokens and need funding
  const needFunding = wallets.filter(
    (w) =>
      w.pumpfunTokens &&
      w.pumpfunTokens.length > 0 &&
      w.solBalance < MIN_SOL_FOR_CLAIM
  );

  // Find wallets that can lend
  const canLend = wallets.filter((w) => w.solBalance >= MIN_SOL_TO_LEND);

  let claimedCount = 0;
  let totalFeesClaimed = 0;
  let fundedCount = 0;
  const errors: string[] = [];
  let lenderIndex = 0;

  // Fund wallets that need it
  for (const wallet of needFunding) {
    try {
      if (canLend.length === 0) {
        errors.push(`No lenders available for ${truncateAddress(wallet.address)}`);
        continue;
      }

      // Round-robin through lenders
      const lender = canLend[lenderIndex % canLend.length];

      // Check if lender still has enough
      if (lender.solBalance < MIN_SOL_TO_LEND) {
        lenderIndex++;
        continue;
      }

      onProgress?.(
        `Funding ${truncateAddress(wallet.address)} from ${truncateAddress(lender.address)}...`
      );

      // Transfer SOL
      await transferSOL(lender.keypair, wallet.keypair.publicKey, MIN_SOL_FOR_CLAIM);

      // Update balances
      wallet.solBalance += MIN_SOL_FOR_CLAIM;
      lender.solBalance -= MIN_SOL_FOR_CLAIM + 0.000005; // Include tx fee

      fundedCount++;
      lenderIndex++;

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      errors.push(
        `Failed to fund ${truncateAddress(wallet.address)}: ${(error as Error).message}`
      );
    }
  }

  // Now claim fees for all wallets with created tokens
  const walletsWithTokens = wallets.filter(
    (w) => w.pumpfunTokens && w.pumpfunTokens.length > 0 && w.solBalance >= MIN_SOL_FOR_CLAIM
  );

  for (const wallet of walletsWithTokens) {
    try {
      onProgress?.(
        `Claiming fees for ${truncateAddress(wallet.address)} (${wallet.pumpfunTokens?.length || 0} tokens)...`
      );

      const result = await claimCreatorFees(wallet, onProgress);

      if (result.success) {
        claimedCount++;
        totalFeesClaimed += result.feesCollected;
      } else {
        errors.push(`${truncateAddress(wallet.address)}: ${result.error}`);
      }

      // Delay between claims
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      errors.push(
        `Failed to claim fees for ${truncateAddress(wallet.address)}: ${(error as Error).message}`
      );
    }
  }

  return { claimedCount, totalFeesClaimed, fundedCount, errors };
}

/**
 * Scan all wallets for created pump.fun tokens
 */
export async function scanAllWalletsForTokens(
  wallets: WalletInfo[],
  onProgress?: (current: number, total: number) => void
): Promise<WalletInfo[]> {
  const updatedWallets: WalletInfo[] = [];

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    onProgress?.(i + 1, wallets.length);

    try {
      const createdTokens = await detectCreatedTokens(wallet.keypair.publicKey, 100);

      updatedWallets.push({
        ...wallet,
        pumpfunTokens: createdTokens,
      });

      // Delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Error scanning wallet ${wallet.address}:`, error);
      updatedWallets.push({
        ...wallet,
        pumpfunTokens: [],
      });
    }
  }

  return updatedWallets;
}
