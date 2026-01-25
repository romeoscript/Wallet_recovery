import { SolanaStreamClient, StreamType, StreamDirection } from '@streamflow/stream';
import { Connection, PublicKey } from '@solana/web3.js';
import { LockedTokenInfo } from '@/types';
import { RPC_ENDPOINT } from './solana';
import { enrichLockedTokenInfo } from './tokenMetadata';
import pLimit from 'p-limit';

// Rate limiting for Streamflow SDK (Helius dev tier: 50 RPS)
const streamflowQueue = pLimit(2); // Max 2 concurrent Streamflow operations

/**
 * Get Streamflow client instance with rate limiting for Helius Dev tier (50 RPS)
 */
function getStreamflowClient() {
  // Use sendRate to throttle SDK's internal RPC calls to ~10 req/sec per client
  return new SolanaStreamClient(RPC_ENDPOINT, undefined, 'confirmed', undefined, 10);
}

/**
 * Fetch all Streamflow vesting contracts for a wallet address
 * Uses the official Streamflow SDK for accurate deserialization
 */
export async function fetchStreamflowContracts(
  walletAddress: PublicKey
): Promise<LockedTokenInfo[]> {
  // Use queue to limit concurrent Streamflow SDK calls
  return streamflowQueue(async () => {
    const lockedTokens: LockedTokenInfo[] = [];

    try {
      const client = getStreamflowClient();

      console.log(`[STREAMFLOW] Fetching contracts for ${walletAddress.toBase58()}...`);

      // Small delay before each Streamflow call to spread out RPC requests
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get all streams where the wallet is a recipient or sender
      const streams = await client.get({
        address: walletAddress.toBase58(),
        type: StreamType.All,
        direction: StreamDirection.All,
      });

      console.log(`[STREAMFLOW] Found ${streams.length} streams for ${walletAddress.toBase58()}`);

    // Process each stream (get returns an array of [id, stream] tuples)
    for (const [streamId, stream] of streams) {
      try {
        const currentTime = Math.floor(Date.now() / 1000);

        // Calculate unlocked amount using Streamflow's built-in methods
        const unlockedAmount = stream.unlocked(currentTime);
        const withdrawableAmount = unlockedAmount.sub(stream.withdrawnAmount);

        // Determine if fully unlocked
        const isUnlocked = currentTime >= stream.end;
        const canClaim = withdrawableAmount.gtn(0);

        // Convert BN amounts to number with proper decimals
        const decimals = 9; // SOL decimals, may need to get from token mint
        const totalAmount = Number(stream.depositedAmount.toString()) / Math.pow(10, decimals);
        const withdrawnAmount = Number(stream.withdrawnAmount.toString()) / Math.pow(10, decimals);
        const uiAmount = Number(withdrawableAmount.toString()) / Math.pow(10, decimals);

        const lockedToken: LockedTokenInfo = {
          pubkey: streamId,
          protocol: 'streamflow',
          mint: stream.mint,
          amount: stream.depositedAmount.toString(),
          decimals,
          uiAmount,
          startTime: stream.start,
          endTime: stream.end,
          cliffTime: stream.cliff,
          isUnlocked,
          canClaim,
          recipient: stream.recipient,
        };

        // Enrich with token metadata and pricing
        const enriched = await enrichLockedTokenInfo(lockedToken);
        lockedTokens.push(enriched);
      } catch (streamError) {
        console.error(`Error processing stream ${streamId}:`, streamError);
        // Continue processing other streams
      }
    }
  } catch (error) {
    console.error(`Error fetching Streamflow contracts for ${walletAddress.toBase58()}:`, error);
  }

    return lockedTokens;
  });
}

/**
 * Get withdraw instructions for a Streamflow vesting contract
 * Note: This returns instructions that need to be included in a transaction
 */
export async function getWithdrawInstructions(
  streamId: string,
  recipientWallet: PublicKey,
  amount?: number
) {
  try {
    const client = getStreamflowClient();

    const withdrawInstructions = await client.prepareWithdrawInstructions(
      {
        id: streamId,
        amount,
      },
      {
        invoker: { publicKey: recipientWallet },
      }
    );

    return withdrawInstructions;
  } catch (error) {
    console.error(`Error preparing withdraw instructions for stream ${streamId}:`, error);
    throw error;
  }
}

/**
 * Get detailed information about a specific stream
 */
export async function getStreamInfo(streamId: string) {
  try {
    const client = getStreamflowClient();
    const stream = await client.getOne({ id: streamId });

    const currentTime = Math.floor(Date.now() / 1000);
    const unlockedAmount = stream.unlocked(currentTime);
    const withdrawableAmount = unlockedAmount.sub(stream.withdrawnAmount);

    return {
      stream,
      withdrawableAmount,
      isUnlocked: currentTime >= stream.end,
      canWithdraw: withdrawableAmount.gtn(0),
    };
  } catch (error) {
    console.error(`Error getting stream info for ${streamId}:`, error);
    throw error;
  }
}

/**
 * Calculate total locked value across all streams
 */
export function calculateTotalLockedValue(streams: LockedTokenInfo[]): number {
  return streams.reduce((total, stream) => total + stream.uiAmount, 0);
}

/**
 * Calculate total withdrawable value across all streams
 */
export function calculateTotalWithdrawable(streams: LockedTokenInfo[]): number {
  return streams
    .filter((stream) => stream.canClaim)
    .reduce((total, stream) => total + stream.uiAmount, 0);
}

/**
 * Get streams that are ready to claim
 */
export function getClaimableStreams(streams: LockedTokenInfo[]): LockedTokenInfo[] {
  return streams.filter((stream) => stream.canClaim);
}

/**
 * Get streams that are still locked
 */
export function getLockedStreams(streams: LockedTokenInfo[]): LockedTokenInfo[] {
  return streams.filter((stream) => !stream.isUnlocked);
}

/**
 * Format time remaining for a stream
 */
export function formatTimeRemaining(endTime?: number): string {
  if (!endTime) return 'Unknown';

  const now = Math.floor(Date.now() / 1000);
  if (now >= endTime) return 'Unlocked';

  const secondsRemaining = endTime - now;
  const days = Math.floor(secondsRemaining / 86400);
  const hours = Math.floor((secondsRemaining % 86400) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Check if a stream has reached cliff time
 */
export function hasReachedCliff(stream: LockedTokenInfo): boolean {
  if (!stream.cliffTime) return true;
  const now = Math.floor(Date.now() / 1000);
  return now >= stream.cliffTime;
}
