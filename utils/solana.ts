import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  SystemProgram,
} from '@solana/web3.js';
import {
  createCloseAccountInstruction,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { derivePath } from 'ed25519-hd-key';
import * as bip39 from 'bip39';
import bs58 from 'bs58';
import { WalletInfo, TokenAccountInfo, BurnResult, LockedTokenInfo } from '@/types';
import {
  fetchStreamflowContracts,
  getStreamInfo,
  getClaimableStreams,
  calculateTotalWithdrawable,
} from './streamflow';

// RPC Configuration
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com';
export const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Program IDs for locked token protocols
const STREAMFLOW_PROGRAM_IDS = [
  new PublicKey('strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUTNTqrvg'), // Streamflow v1
  new PublicKey('strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m'), // Streamflow v2 (Timelock)
];
const JUPITER_LOCK_PROGRAM_ID = new PublicKey('LocpQqnNQu2b5vFZG5U5cTacdXhFuVLZHSxHVvhk7VM');

// Constants for transaction batching
const RENT_EXEMPT_ACCOUNT = 0.00203928; // Approximate rent for token account
const MAX_INSTRUCTIONS_PER_TX = 8; // Conservative limit for transaction size

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate exponential backoff delay
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Derive Solana keypairs from a BIP39 seed phrase
 * Uses standard derivation path: m/44'/501'/x'/0'
 */
export async function deriveKeypairsFromSeed(
  seedPhrase: string,
  count: number
): Promise<Keypair[]> {
  if (!bip39.validateMnemonic(seedPhrase)) {
    throw new Error('Invalid seed phrase');
  }

  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const keypairs: Keypair[] = [];

  for (let i = 0; i < count; i++) {
    const path = `m/44'/501'/${i}'/0'`;
    const derivedSeed = derivePath(path, seed.toString('hex')).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    keypairs.push(keypair);
  }

  return keypairs;
}

/**
 * Convert secret key arrays to Keypairs
 */
export function secretKeysToKeypairs(secretKeys: Uint8Array[]): Keypair[] {
  return secretKeys.map((secretKey) => Keypair.fromSecretKey(secretKey));
}

/**
 * Parse secret keys from JSON string
 */
export function parseSecretKeysJSON(jsonString: string): Uint8Array[] {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      throw new Error('Input must be an array');
    }
    return parsed.map((key) => {
      if (Array.isArray(key)) {
        return new Uint8Array(key);
      }
      if (typeof key === 'string') {
        return bs58.decode(key);
      }
      throw new Error('Invalid key format');
    });
  } catch (error) {
    throw new Error(`Failed to parse secret keys: ${(error as Error).message}`);
  }
}

/**
 * Fetch all token accounts for a wallet (both TOKEN and TOKEN-2022 programs)
 */
export async function fetchTokenAccounts(
  walletAddress: PublicKey
): Promise<TokenAccountInfo[]> {
  try {
    // Fetch from both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID
    const [tokenResponse, token2022Response] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(walletAddress, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(walletAddress, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    // Map TOKEN accounts with program ID
    const tokenAccounts = tokenResponse.value.map((accountInfo) => {
      const parsedInfo = (accountInfo.account.data as ParsedAccountData).parsed.info;
      return {
        pubkey: accountInfo.pubkey.toBase58(),
        mint: parsedInfo.mint,
        amount: parsedInfo.tokenAmount.amount,
        decimals: parsedInfo.tokenAmount.decimals,
        uiAmount: parsedInfo.tokenAmount.uiAmount || 0,
        programId: TOKEN_PROGRAM_ID.toBase58(),
      };
    });

    // Map TOKEN-2022 accounts with program ID
    const token2022Accounts = token2022Response.value.map((accountInfo) => {
      const parsedInfo = (accountInfo.account.data as ParsedAccountData).parsed.info;
      return {
        pubkey: accountInfo.pubkey.toBase58(),
        mint: parsedInfo.mint,
        amount: parsedInfo.tokenAmount.amount,
        decimals: parsedInfo.tokenAmount.decimals,
        uiAmount: parsedInfo.tokenAmount.uiAmount || 0,
        programId: TOKEN_2022_PROGRAM_ID.toBase58(),
      };
    });

    // Combine both
    return [...tokenAccounts, ...token2022Accounts];
  } catch (error) {
    console.error(`Error fetching token accounts for ${walletAddress.toBase58()}:`, error);
    return [];
  }
}

/**
 * Fetch locked tokens from Streamflow and Jupiter Lock programs
 * Now uses official Streamflow SDK for accurate deserialization
 */
export async function fetchLockedTokens(
  walletAddress: PublicKey
): Promise<LockedTokenInfo[]> {
  const lockedTokens: LockedTokenInfo[] = [];

  try {
    // Fetch Streamflow vesting contracts using official SDK
    const streamflowContracts = await fetchStreamflowContracts(walletAddress);
    lockedTokens.push(...streamflowContracts);

    // Fetch Jupiter Lock accounts (still using basic detection)
    // TODO: Add Jupiter Lock SDK when available
    try {
      const jupiterOffsets = [8, 32, 40];

      for (const offset of jupiterOffsets) {
        try {
          const jupiterLockAccounts = await connection.getProgramAccounts(JUPITER_LOCK_PROGRAM_ID, {
            filters: [
              {
                memcmp: {
                  offset,
                  bytes: walletAddress.toBase58(),
                },
              },
            ],
          });

          for (const { pubkey, account } of jupiterLockAccounts) {
            // Avoid duplicates
            if (lockedTokens.some((t) => t.pubkey === pubkey.toBase58())) {
              continue;
            }

            lockedTokens.push({
              pubkey: pubkey.toBase58(),
              protocol: 'jupiter-lock',
              mint: 'Unknown',
              amount: '0',
              decimals: 0,
              uiAmount: 0,
              isUnlocked: false,
              canClaim: false,
            });
          }
        } catch (offsetError) {
          // Silent fail for each offset
        }
      }
    } catch (jupiterError) {
      console.error('Error fetching Jupiter Lock accounts:', jupiterError);
    }
  } catch (error) {
    console.error(`Error fetching locked tokens for ${walletAddress.toBase58()}:`, error);
  }

  return lockedTokens;
}

/**
 * Scan a single wallet for balances and token accounts
 */
export async function scanWallet(keypair: Keypair): Promise<WalletInfo> {
  const address = keypair.publicKey.toBase58();

  try {
    // Fetch SOL balance with retry
    const balance = await retryWithBackoff(
      () => connection.getBalance(keypair.publicKey),
      2,
      500
    );
    const solBalance = balance / LAMPORTS_PER_SOL;

    // Fetch token accounts with retry
    const tokenAccounts = await retryWithBackoff(
      () => fetchTokenAccounts(keypair.publicKey),
      2,
      500
    );

    // Fetch locked tokens with retry
    const lockedTokens = await retryWithBackoff(
      () => fetchLockedTokens(keypair.publicKey),
      2,
      500
    );

    console.log(`[DEBUG] Wallet ${address} - Found ${lockedTokens.length} locked tokens:`, lockedTokens);

    // Categorize accounts
    const emptyAccounts = tokenAccounts.filter((acc) => acc.uiAmount === 0);
    const dustAccounts = tokenAccounts.filter((acc) => acc.uiAmount > 0);

    return {
      address,
      keypair,
      solBalance,
      emptyTokenAccounts: emptyAccounts.length,
      dustTokenAccounts: dustAccounts.length,
      tokenAccounts,
      lockedTokens,
    };
  } catch (error) {
    return {
      address,
      keypair,
      solBalance: 0,
      emptyTokenAccounts: 0,
      dustTokenAccounts: 0,
      tokenAccounts: [],
      lockedTokens: [],
      error: (error as Error).message,
    };
  }
}

/**
 * Create a transaction to close empty token accounts
 */
async function createCloseEmptyAccountsTx(
  wallet: WalletInfo,
  masterAddress: PublicKey
): Promise<Transaction | null> {
  const emptyAccounts = wallet.tokenAccounts.filter((acc) => acc.uiAmount === 0);

  if (emptyAccounts.length === 0) return null;

  const transaction = new Transaction();

  // Batch up to MAX_INSTRUCTIONS_PER_TX accounts per transaction
  const accountsToClose = emptyAccounts.slice(0, MAX_INSTRUCTIONS_PER_TX);

  for (const account of accountsToClose) {
    const accountPubkey = new PublicKey(account.pubkey);
    const programId = new PublicKey(account.programId);

    // Close account instruction - rent goes to masterAddress
    const closeInstruction = createCloseAccountInstruction(
      accountPubkey,
      masterAddress, // Destination for rent refund
      wallet.keypair.publicKey,
      undefined, // multiSigners
      programId // Specify TOKEN or TOKEN_2022 program
    );

    transaction.add(closeInstruction);
  }

  return transaction;
}

/**
 * Create a transaction to burn dust and close token accounts
 */
async function createBurnAndCloseAccountsTx(
  wallet: WalletInfo,
  masterAddress: PublicKey
): Promise<Transaction | null> {
  const dustAccounts = wallet.tokenAccounts.filter((acc) => acc.uiAmount > 0);

  if (dustAccounts.length === 0) return null;

  const transaction = new Transaction();
  let instructionCount = 0;

  // Each burn + close = 2 instructions, so we can do MAX_INSTRUCTIONS_PER_TX/2 accounts
  const maxAccountsPerTx = Math.floor(MAX_INSTRUCTIONS_PER_TX / 2);
  const accountsToBurn = dustAccounts.slice(0, maxAccountsPerTx);

  for (const account of accountsToBurn) {
    const accountPubkey = new PublicKey(account.pubkey);
    const mintPubkey = new PublicKey(account.mint);
    const amount = BigInt(account.amount);
    const programId = new PublicKey(account.programId);

    // Burn instruction
    const burnInstruction = createBurnInstruction(
      accountPubkey,
      mintPubkey,
      wallet.keypair.publicKey,
      amount,
      undefined, // multiSigners
      programId // Specify TOKEN or TOKEN_2022 program
    );
    transaction.add(burnInstruction);
    instructionCount++;

    // Close account instruction - rent goes to masterAddress
    const closeInstruction = createCloseAccountInstruction(
      accountPubkey,
      masterAddress, // Destination for rent refund
      wallet.keypair.publicKey,
      undefined, // multiSigners
      programId // Specify TOKEN or TOKEN_2022 program
    );
    transaction.add(closeInstruction);
    instructionCount++;

    if (instructionCount >= MAX_INSTRUCTIONS_PER_TX) break;
  }

  return transaction;
}

/**
 * Helper function to send transaction quickly without waiting for full confirmation
 */
async function sendTransactionFast(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[]
): Promise<string> {
  // Get fresh blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = signers[0].publicKey;

  // Sign transaction
  transaction.sign(...signers);

  // Send raw transaction (don't wait for confirmation)
  const rawTransaction = transaction.serialize();
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: true,
    maxRetries: 0,
  });

  console.log(`Transaction sent: ${signature}`);

  // Wait just a moment for it to land, but don't block
  await new Promise((resolve) => setTimeout(resolve, 800));

  return signature;
}

/**
 * Helper function to send and confirm transaction with timeout and retry logic
 */
async function sendAndConfirmTransactionWithTimeout(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  maxRetries = 3
): Promise<string> {
  const TIMEOUT_MS = 30000; // Reduced to 30 seconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Transaction attempt ${attempt + 1}/${maxRetries}`);

      // Get fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = signers[0].publicKey;

      console.log(`Got blockhash: ${blockhash.substring(0, 8)}...`);

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          console.log('Transaction timeout reached');
          reject(new Error('Transaction confirmation timeout'));
        }, TIMEOUT_MS);
      });

      // Race between confirmation and timeout
      const confirmPromise = sendAndConfirmTransaction(
        connection,
        transaction,
        signers,
        {
          commitment: 'confirmed',
          skipPreflight: true, // Skip preflight to reduce latency
          maxRetries: 0, // We handle retries ourselves
        }
      );

      const signature = await Promise.race([confirmPromise, timeoutPromise]);
      console.log(`Transaction confirmed: ${signature}`);
      return signature;
    } catch (error) {
      const errorMessage = (error as Error).message.toLowerCase();
      console.error(`Transaction attempt ${attempt + 1} failed:`, errorMessage);

      // Check if it's a blockhash expiration or timeout error
      if (
        errorMessage.includes('blockhash') ||
        errorMessage.includes('expired') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('not found')
      ) {
        console.log(`Retrying with fresh blockhash (attempt ${attempt + 1}/${maxRetries})...`);
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      // If it's the last retry or a different error, throw
      if (attempt === maxRetries - 1) {
        console.error('All retry attempts exhausted');
        throw error;
      }

      // Wait before retrying
      console.log('Waiting before retry...');
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  throw new Error('Transaction failed after maximum retries');
}

/**
 * Process a single wallet: close empty accounts and burn+close dust accounts
 */
export async function processWallet(
  wallet: WalletInfo,
  masterAddress: PublicKey,
  onProgress?: (status: string) => void
): Promise<BurnResult> {
  let accountsClosed = 0;
  let solReclaimed = 0;
  const signatures: string[] = [];

  try {
    // Check if wallet has enough SOL for transaction fees
    if (wallet.solBalance < 0.001) {
      return {
        success: false,
        error: 'Insufficient SOL for transaction fees',
        walletsProcessed: 0,
        accountsClosed: 0,
        solReclaimed: 0,
      };
    }

    // Process empty accounts first
    while (true) {
      const emptyAccounts = wallet.tokenAccounts.filter((acc) => acc.uiAmount === 0);
      if (emptyAccounts.length === 0) break;

      onProgress?.(`Closing ${emptyAccounts.length} empty accounts...`);

      const tx = await createCloseEmptyAccountsTx(wallet, masterAddress);
      if (!tx) break;

      try {
        const signature = await sendAndConfirmTransactionWithTimeout(
          connection,
          tx,
          [wallet.keypair],
          3
        );

        signatures.push(signature);
        const closedCount = Math.min(emptyAccounts.length, MAX_INSTRUCTIONS_PER_TX);
        accountsClosed += closedCount;
        solReclaimed += closedCount * RENT_EXEMPT_ACCOUNT;

        // Remove processed accounts
        wallet.tokenAccounts = wallet.tokenAccounts.filter(
          (acc) => !emptyAccounts.slice(0, closedCount).some((ea) => ea.pubkey === acc.pubkey)
        );

        // If we processed all empty accounts, break
        if (emptyAccounts.length <= MAX_INSTRUCTIONS_PER_TX) break;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to close empty accounts:', error);
        onProgress?.(`Error: ${(error as Error).message}`);
        break; // Exit loop on error instead of freezing
      }
    }

    // Process dust accounts
    while (true) {
      const dustAccounts = wallet.tokenAccounts.filter((acc) => acc.uiAmount > 0);
      if (dustAccounts.length === 0) break;

      onProgress?.(`Burning and closing ${dustAccounts.length} dust accounts...`);

      const tx = await createBurnAndCloseAccountsTx(wallet, masterAddress);
      if (!tx) break;

      try {
        const signature = await sendAndConfirmTransactionWithTimeout(
          connection,
          tx,
          [wallet.keypair],
          3
        );

        signatures.push(signature);
        const maxAccountsPerTx = Math.floor(MAX_INSTRUCTIONS_PER_TX / 2);
        const processedCount = Math.min(dustAccounts.length, maxAccountsPerTx);
        accountsClosed += processedCount;
        solReclaimed += processedCount * RENT_EXEMPT_ACCOUNT;

        // Remove processed accounts
        wallet.tokenAccounts = wallet.tokenAccounts.filter(
          (acc) => !dustAccounts.slice(0, processedCount).some((da) => da.pubkey === acc.pubkey)
        );

        // If we processed all dust accounts, break
        if (dustAccounts.length <= maxAccountsPerTx) break;

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to burn and close dust accounts:', error);
        onProgress?.(`Error: ${(error as Error).message}`);
        break; // Exit loop on error instead of freezing
      }
    }

    // Final step: Send ALL remaining SOL to master address
    try {
      onProgress?.('Sweeping remaining SOL to master...');

      // Get current balance
      const balance = await connection.getBalance(wallet.keypair.publicKey);
      const balanceSOL = balance / LAMPORTS_PER_SOL;

      // Only transfer if there's meaningful SOL left (more than tx fee)
      const TX_FEE = 0.000005; // 5000 lamports
      const MIN_TRANSFER = 0.00001; // Minimum 0.00001 SOL to bother transferring

      if (balanceSOL > MIN_TRANSFER) {
        // Transfer everything except the tx fee
        const amountToSend = balanceSOL - TX_FEE;

        const transferIx = SystemProgram.transfer({
          fromPubkey: wallet.keypair.publicKey,
          toPubkey: masterAddress,
          lamports: Math.floor(amountToSend * LAMPORTS_PER_SOL),
        });

        const tx = new Transaction().add(transferIx);

        const signature = await sendAndConfirmTransactionWithTimeout(
          connection,
          tx,
          [wallet.keypair],
          3
        );

        signatures.push(signature);
        solReclaimed += amountToSend;

        onProgress?.(`Swept ${formatSOL(amountToSend)} SOL to master`);
      }
    } catch (error) {
      console.error('Failed to sweep SOL to master:', error);
      onProgress?.(`Warning: Could not sweep SOL - ${(error as Error).message}`);
      // Don't fail the whole operation if final sweep fails
    }

    return {
      success: true,
      signature: signatures.join(', '),
      walletsProcessed: 1,
      accountsClosed,
      solReclaimed,
    };
  } catch (error) {
    console.error('Error processing wallet:', error);
    return {
      success: false,
      error: (error as Error).message,
      walletsProcessed: 0,
      accountsClosed,
      solReclaimed,
    };
  }
}

/**
 * Transfer SOL from one wallet to another
 */
export async function transferSOL(
  fromKeypair: Keypair,
  toAddress: PublicKey,
  amountSOL: number
): Promise<string> {
  const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

  const transferIx = SystemProgram.transfer({
    fromPubkey: fromKeypair.publicKey,
    toPubkey: toAddress,
    lamports,
  });

  const tx = new Transaction().add(transferIx);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromKeypair.publicKey;

  const signature = await sendAndConfirmTransaction(connection, tx, [fromKeypair], {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  return signature;
}

/**
 * Auto-fund wallets with insufficient SOL from wallets with excess SOL
 * Returns array of funding transactions and updated wallet balances
 */
export async function autoFundWallets(
  wallets: WalletInfo[],
  onProgress?: (status: string) => void
): Promise<{ fundedCount: number; totalSent: number; errors: string[] }> {
  const MIN_SOL_NEEDED = 0.003; // Amount to send to each underfunded wallet
  const MIN_SOL_TO_LEND = 0.01; // Wallets need at least this much to be lenders

  // Find wallets that need funding (have token accounts but < 0.001 SOL)
  const needFunding = wallets.filter(
    (w) =>
      (w.emptyTokenAccounts > 0 || w.dustTokenAccounts > 0) &&
      w.solBalance < 0.001
  );

  // Find wallets that can lend (have > MIN_SOL_TO_LEND)
  const canLend = wallets.filter((w) => w.solBalance >= MIN_SOL_TO_LEND);

  if (needFunding.length === 0) {
    return { fundedCount: 0, totalSent: 0, errors: [] };
  }

  if (canLend.length === 0) {
    return {
      fundedCount: 0,
      totalSent: 0,
      errors: ['No wallets with sufficient SOL to lend'],
    };
  }

  onProgress?.(
    `Found ${needFunding.length} wallets to fund from ${canLend.length} lenders...`
  );

  let fundedCount = 0;
  let totalSent = 0;
  const errors: string[] = [];
  let lenderIndex = 0;

  // Fund each wallet that needs it
  for (const wallet of needFunding) {
    try {
      // Round-robin through lenders
      const lender = canLend[lenderIndex % canLend.length];

      // Check if lender still has enough
      if (lender.solBalance < MIN_SOL_TO_LEND) {
        lenderIndex++;
        continue;
      }

      onProgress?.(
        `Funding ${truncateAddress(wallet.address)} from ${truncateAddress(
          lender.address
        )}...`
      );

      // Transfer SOL
      await transferSOL(lender.keypair, wallet.keypair.publicKey, MIN_SOL_NEEDED);

      // Update balances
      wallet.solBalance += MIN_SOL_NEEDED;
      lender.solBalance -= MIN_SOL_NEEDED + 0.000005; // Include tx fee

      fundedCount++;
      totalSent += MIN_SOL_NEEDED;

      // Move to next lender
      lenderIndex++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      errors.push(`Failed to fund ${truncateAddress(wallet.address)}: ${(error as Error).message}`);
    }
  }

  return { fundedCount, totalSent, errors };
}

/**
 * Sweep all SOL from wallets to master address
 */
export async function sweepAllSOL(
  wallets: WalletInfo[],
  masterAddress: PublicKey,
  onProgress?: (status: string) => void
): Promise<{ sweptCount: number; totalSwept: number; errors: string[] }> {
  const TX_FEE = 0.000005; // 5000 lamports
  const MIN_TRANSFER = 0.00001; // Minimum 0.00001 SOL to bother transferring

  let sweptCount = 0;
  let totalSwept = 0;
  const errors: string[] = [];

  for (const wallet of wallets) {
    try {
      onProgress?.(`Sweeping ${truncateAddress(wallet.address)}...`);
      console.log(`Starting sweep for ${wallet.address}`);

      // Get current balance with timeout
      let balance: number;
      try {
        const balancePromise = connection.getBalance(wallet.keypair.publicKey);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Balance check timeout')), 10000);
        });
        balance = await Promise.race([balancePromise, timeoutPromise]);
        console.log(`Balance for ${wallet.address}: ${balance / LAMPORTS_PER_SOL} SOL`);
      } catch (balanceError) {
        console.error(`Balance check failed for ${wallet.address}:`, balanceError);
        errors.push(`Failed to check balance for ${truncateAddress(wallet.address)}`);
        continue;
      }

      const balanceSOL = balance / LAMPORTS_PER_SOL;

      // Only transfer if there's meaningful SOL left (more than tx fee)
      if (balanceSOL > MIN_TRANSFER) {
        console.log(`Transferring ${balanceSOL - TX_FEE} SOL from ${wallet.address}`);

        // Transfer everything except the tx fee
        const amountToSend = balanceSOL - TX_FEE;

        const transferIx = SystemProgram.transfer({
          fromPubkey: wallet.keypair.publicKey,
          toPubkey: masterAddress,
          lamports: Math.floor(amountToSend * LAMPORTS_PER_SOL),
        });

        const tx = new Transaction().add(transferIx);

        try {
          // Use fast send - don't wait for full confirmation
          const signature = await sendTransactionFast(
            connection,
            tx,
            [wallet.keypair]
          );

          console.log(`✅ Transaction sent, signature: ${signature}`);
          sweptCount++;
          totalSwept += amountToSend;

          onProgress?.(`✅ Sent ${formatSOL(amountToSend)} from ${truncateAddress(wallet.address)}`);

          // Update wallet balance
          wallet.solBalance = TX_FEE;
        } catch (txError) {
          console.error(`Transaction failed for ${wallet.address}:`, txError);
          throw txError;
        }
      } else {
        console.log(`Skipping ${wallet.address}: balance ${balanceSOL} too low`);
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      errors.push(`${truncateAddress(wallet.address)}: ${errorMsg}`);
      console.error(`Error sweeping wallet ${wallet.address}:`, error);

      // Continue to next wallet instead of stopping
      onProgress?.(`⚠ Failed: ${truncateAddress(wallet.address)}`);
    }
  }

  return { sweptCount, totalSwept, errors };
}

/**
 * Claim unlocked tokens from Streamflow vesting contracts
 */
export async function claimUnlockedTokens(
  wallet: WalletInfo,
  onProgress?: (status: string) => void
): Promise<{
  success: boolean;
  claimedCount: number;
  totalClaimed: number;
  errors: string[];
  signatures: string[];
}> {
  let claimedCount = 0;
  let totalClaimed = 0;
  const errors: string[] = [];
  const signatures: string[] = [];

  try {
    // Get claimable streams
    const claimableStreams = getClaimableStreams(wallet.lockedTokens);

    if (claimableStreams.length === 0) {
      onProgress?.('No unlocked tokens to claim');
      return { success: true, claimedCount: 0, totalClaimed: 0, errors: [], signatures: [] };
    }

    onProgress?.(`Found ${claimableStreams.length} claimable vesting contracts...`);

    // Process each claimable stream
    for (const stream of claimableStreams) {
      try {
        onProgress?.(`Claiming from ${truncateAddress(stream.pubkey)}...`);

        // Get detailed stream info
        const streamInfo = await getStreamInfo(stream.pubkey);

        // Get withdraw instructions from Streamflow SDK
        const { SolanaStreamClient } = await import('@streamflow/stream');
        const client = new SolanaStreamClient(RPC_ENDPOINT, undefined, 'confirmed');

        const withdrawInstructions = await client.prepareWithdrawInstructions(
          {
            id: stream.pubkey,
          },
          {
            invoker: { publicKey: wallet.keypair.publicKey },
          }
        );

        // Build and send transaction
        const tx = new Transaction();
        withdrawInstructions.forEach((ix) => tx.add(ix));

        const signature = await sendAndConfirmTransactionWithTimeout(
          connection,
          tx,
          [wallet.keypair],
          3
        );

        signatures.push(signature);
        claimedCount++;
        totalClaimed += stream.uiAmount;

        onProgress?.(`✅ Claimed ${formatSOL(stream.uiAmount)} from ${truncateAddress(stream.pubkey)}`);

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMsg = `Failed to claim from ${truncateAddress(stream.pubkey)}: ${(error as Error).message}`;
        errors.push(errorMsg);
        onProgress?.(`⚠ ${errorMsg}`);
      }
    }

    return {
      success: claimedCount > 0,
      claimedCount,
      totalClaimed,
      errors,
      signatures,
    };
  } catch (error) {
    console.error('Error claiming unlocked tokens:', error);
    return {
      success: false,
      claimedCount,
      totalClaimed,
      errors: [(error as Error).message],
      signatures,
    };
  }
}

/**
 * Validate a Solana public key address
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format SOL amount for display
 */
export function formatSOL(amount: number): string {
  return amount.toFixed(6);
}
