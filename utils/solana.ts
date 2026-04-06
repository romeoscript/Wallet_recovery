import {
  Connection,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  ParsedAccountData,
  SystemProgram,
} from '@solana/web3.js';
import {
  createCloseAccountInstruction,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { WalletInfo, TokenAccountInfo, BurnResult, LockedTokenInfo } from '@/types';
import {
  fetchStreamflowContracts,
  getClaimableStreams,
} from './streamflow';

// Wallet adapter signing type
export type SignTransaction = <T extends Transaction>(transaction: T) => Promise<T>;

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

      if (attempt === maxRetries) {
        break;
      }

      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Fetch all token accounts for a wallet (both TOKEN and TOKEN-2022 programs)
 */
export async function fetchTokenAccounts(
  walletAddress: PublicKey
): Promise<TokenAccountInfo[]> {
  try {
    const [tokenResponse, token2022Response] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(walletAddress, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(walletAddress, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

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

    return [...tokenAccounts, ...token2022Accounts];
  } catch (error) {
    console.error(`Error fetching token accounts for ${walletAddress.toBase58()}:`, error);
    return [];
  }
}

/**
 * Fetch locked tokens from Streamflow and Jupiter Lock programs
 */
export async function fetchLockedTokens(
  walletAddress: PublicKey
): Promise<LockedTokenInfo[]> {
  const lockedTokens: LockedTokenInfo[] = [];

  try {
    const streamflowContracts = await fetchStreamflowContracts(walletAddress);
    lockedTokens.push(...streamflowContracts);

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

          for (const { pubkey } of jupiterLockAccounts) {
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
export async function scanWallet(publicKey: PublicKey): Promise<WalletInfo> {
  const address = publicKey.toBase58();

  try {
    const balance = await retryWithBackoff(
      () => connection.getBalance(publicKey),
      2,
      500
    );
    const solBalance = balance / LAMPORTS_PER_SOL;

    const tokenAccounts = await retryWithBackoff(
      () => fetchTokenAccounts(publicKey),
      2,
      500
    );

    const lockedTokens = await retryWithBackoff(
      () => fetchLockedTokens(publicKey),
      2,
      500
    );

    console.log(`[DEBUG] Wallet ${address} - Found ${lockedTokens.length} locked tokens:`, lockedTokens);

    const emptyAccounts = tokenAccounts.filter((acc) => acc.uiAmount === 0);
    const dustAccounts = tokenAccounts.filter((acc) => acc.uiAmount > 0);

    return {
      address,
      solBalance,
      emptyTokenAccounts: emptyAccounts.length,
      dustTokenAccounts: dustAccounts.length,
      tokenAccounts,
      lockedTokens,
    };
  } catch (error) {
    return {
      address,
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
  ownerPubkey: PublicKey,
  destinationPubkey: PublicKey
): Promise<Transaction | null> {
  const emptyAccounts = wallet.tokenAccounts.filter((acc) => acc.uiAmount === 0);

  if (emptyAccounts.length === 0) return null;

  const transaction = new Transaction();
  const accountsToClose = emptyAccounts.slice(0, MAX_INSTRUCTIONS_PER_TX);

  for (const account of accountsToClose) {
    const accountPubkey = new PublicKey(account.pubkey);
    const programId = new PublicKey(account.programId);

    const closeInstruction = createCloseAccountInstruction(
      accountPubkey,
      destinationPubkey,
      ownerPubkey,
      undefined,
      programId
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
  ownerPubkey: PublicKey,
  destinationPubkey: PublicKey
): Promise<Transaction | null> {
  const dustAccounts = wallet.tokenAccounts.filter((acc) => acc.uiAmount > 0);

  if (dustAccounts.length === 0) return null;

  const transaction = new Transaction();
  let instructionCount = 0;

  const maxAccountsPerTx = Math.floor(MAX_INSTRUCTIONS_PER_TX / 2);
  const accountsToBurn = dustAccounts.slice(0, maxAccountsPerTx);

  for (const account of accountsToBurn) {
    const accountPubkey = new PublicKey(account.pubkey);
    const mintPubkey = new PublicKey(account.mint);
    const amount = BigInt(account.amount);
    const programId = new PublicKey(account.programId);

    const burnInstruction = createBurnInstruction(
      accountPubkey,
      mintPubkey,
      ownerPubkey,
      amount,
      undefined,
      programId
    );
    transaction.add(burnInstruction);
    instructionCount++;

    const closeInstruction = createCloseAccountInstruction(
      accountPubkey,
      destinationPubkey,
      ownerPubkey,
      undefined,
      programId
    );
    transaction.add(closeInstruction);
    instructionCount++;

    if (instructionCount >= MAX_INSTRUCTIONS_PER_TX) break;
  }

  return transaction;
}

/**
 * Helper to prepare, sign, and send a transaction via wallet adapter
 */
async function sendSignedTransaction(
  connection: Connection,
  transaction: Transaction,
  feePayer: PublicKey,
  signTransaction: SignTransaction,
  maxRetries = 3
): Promise<string> {
  const TIMEOUT_MS = 30000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Transaction attempt ${attempt + 1}/${maxRetries}`);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = feePayer;

      console.log(`Got blockhash: ${blockhash.substring(0, 8)}...`);

      const signed = await signTransaction(transaction);

      const rawTransaction = signed.serialize();
      const signature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 0,
      });

      console.log(`Transaction sent: ${signature}`);

      // Wait for confirmation with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Transaction confirmation timeout')), TIMEOUT_MS);
      });

      const confirmPromise = connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await Promise.race([confirmPromise, timeoutPromise]);
      console.log(`Transaction confirmed: ${signature}`);
      return signature;
    } catch (error) {
      const errorMessage = (error as Error).message.toLowerCase();
      console.error(`Transaction attempt ${attempt + 1} failed:`, errorMessage);

      if (
        errorMessage.includes('blockhash') ||
        errorMessage.includes('expired') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('not found')
      ) {
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
      }

      if (attempt === maxRetries - 1) {
        throw error;
      }

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
  ownerPubkey: PublicKey,
  signTransaction: SignTransaction,
  onProgress?: (status: string) => void
): Promise<BurnResult> {
  let accountsClosed = 0;
  let solReclaimed = 0;
  const signatures: string[] = [];

  try {
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

      const tx = await createCloseEmptyAccountsTx(wallet, ownerPubkey, ownerPubkey);
      if (!tx) break;

      try {
        const signature = await sendSignedTransaction(
          connection,
          tx,
          ownerPubkey,
          signTransaction,
          3
        );

        signatures.push(signature);
        const closedCount = Math.min(emptyAccounts.length, MAX_INSTRUCTIONS_PER_TX);
        accountsClosed += closedCount;
        solReclaimed += closedCount * RENT_EXEMPT_ACCOUNT;

        wallet.tokenAccounts = wallet.tokenAccounts.filter(
          (acc) => !emptyAccounts.slice(0, closedCount).some((ea) => ea.pubkey === acc.pubkey)
        );

        if (emptyAccounts.length <= MAX_INSTRUCTIONS_PER_TX) break;

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to close empty accounts:', error);
        onProgress?.(`Error: ${(error as Error).message}`);
        break;
      }
    }

    // Process dust accounts
    while (true) {
      const dustAccounts = wallet.tokenAccounts.filter((acc) => acc.uiAmount > 0);
      if (dustAccounts.length === 0) break;

      onProgress?.(`Burning and closing ${dustAccounts.length} dust accounts...`);

      const tx = await createBurnAndCloseAccountsTx(wallet, ownerPubkey, ownerPubkey);
      if (!tx) break;

      try {
        const signature = await sendSignedTransaction(
          connection,
          tx,
          ownerPubkey,
          signTransaction,
          3
        );

        signatures.push(signature);
        const maxAccountsPerTx = Math.floor(MAX_INSTRUCTIONS_PER_TX / 2);
        const processedCount = Math.min(dustAccounts.length, maxAccountsPerTx);
        accountsClosed += processedCount;
        solReclaimed += processedCount * RENT_EXEMPT_ACCOUNT;

        wallet.tokenAccounts = wallet.tokenAccounts.filter(
          (acc) => !dustAccounts.slice(0, processedCount).some((da) => da.pubkey === acc.pubkey)
        );

        if (dustAccounts.length <= maxAccountsPerTx) break;

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error('Failed to burn and close dust accounts:', error);
        onProgress?.(`Error: ${(error as Error).message}`);
        break;
      }
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
 * Claim unlocked tokens from Streamflow vesting contracts
 */
export async function claimUnlockedTokens(
  wallet: WalletInfo,
  ownerPubkey: PublicKey,
  signTransaction: SignTransaction,
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
    const claimableStreams = getClaimableStreams(wallet.lockedTokens);

    if (claimableStreams.length === 0) {
      onProgress?.('No unlocked tokens to claim');
      return { success: true, claimedCount: 0, totalClaimed: 0, errors: [], signatures: [] };
    }

    onProgress?.(`Found ${claimableStreams.length} claimable vesting contracts...`);

    for (const stream of claimableStreams) {
      try {
        onProgress?.(`Claiming from ${truncateAddress(stream.pubkey)}...`);

        const { SolanaStreamClient } = await import('@streamflow/stream');
        const client = new SolanaStreamClient(RPC_ENDPOINT, undefined, 'confirmed');

        const withdrawInstructions = await client.prepareWithdrawInstructions(
          {
            id: stream.pubkey,
          },
          {
            invoker: { publicKey: ownerPubkey },
          }
        );

        const tx = new Transaction();
        withdrawInstructions.forEach((ix) => tx.add(ix));

        const signature = await sendSignedTransaction(
          connection,
          tx,
          ownerPubkey,
          signTransaction,
          3
        );

        signatures.push(signature);
        claimedCount++;
        totalClaimed += stream.uiAmount;

        onProgress?.(`Claimed ${formatSOL(stream.uiAmount)} from ${truncateAddress(stream.pubkey)}`);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        const errorMsg = `Failed to claim from ${truncateAddress(stream.pubkey)}: ${(error as Error).message}`;
        errors.push(errorMsg);
        onProgress?.(errorMsg);
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
