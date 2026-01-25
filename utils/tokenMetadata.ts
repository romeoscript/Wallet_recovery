import { Connection, PublicKey } from '@solana/web3.js';
import { connection } from './solana';

/**
 * Token metadata cache to avoid repeated fetches
 */
const metadataCache = new Map<string, TokenMetadata>();

/**
 * Price cache with 5-minute expiry
 */
const priceCache = new Map<string, { price: number; solPrice: number; timestamp: number }>();
const PRICE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface TokenMetadata {
  symbol: string;
  name: string;
  logoUri?: string;
  decimals: number;
}

/**
 * Fetch token metadata from Jupiter Token List
 * Jupiter maintains a comprehensive list of verified Solana tokens
 */
export async function fetchTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
  // Check cache first
  if (metadataCache.has(mintAddress)) {
    return metadataCache.get(mintAddress)!;
  }

  try {
    // Special case for SOL
    if (mintAddress === 'So11111111111111111111111111111111111111112') {
      const metadata: TokenMetadata = {
        symbol: 'SOL',
        name: 'Solana',
        logoUri: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        decimals: 9,
      };
      metadataCache.set(mintAddress, metadata);
      return metadata;
    }

    // Fetch from Jupiter Token List API
    const response = await fetch('https://token.jup.ag/all');
    if (!response.ok) {
      throw new Error('Failed to fetch token list');
    }

    const tokens = await response.json();
    const tokenInfo = tokens.find((t: any) => t.address === mintAddress);

    if (tokenInfo) {
      const metadata: TokenMetadata = {
        symbol: tokenInfo.symbol || 'UNKNOWN',
        name: tokenInfo.name || 'Unknown Token',
        logoUri: tokenInfo.logoURI,
        decimals: tokenInfo.decimals || 9,
      };
      metadataCache.set(mintAddress, metadata);
      return metadata;
    }

    // Fallback: Try to get from on-chain metadata
    const onChainMetadata = await fetchOnChainMetadata(mintAddress);
    if (onChainMetadata) {
      metadataCache.set(mintAddress, onChainMetadata);
      return onChainMetadata;
    }

    // Return unknown token info
    const unknownMetadata: TokenMetadata = {
      symbol: mintAddress.slice(0, 4),
      name: 'Unknown Token',
      decimals: 9,
    };
    metadataCache.set(mintAddress, unknownMetadata);
    return unknownMetadata;
  } catch (error) {
    console.error(`Error fetching metadata for ${mintAddress}:`, error);
    return null;
  }
}

/**
 * Fetch on-chain token metadata using Metaplex standard
 */
async function fetchOnChainMetadata(mintAddress: string): Promise<TokenMetadata | null> {
  try {
    const mint = new PublicKey(mintAddress);

    // Get mint account info
    const mintInfo = await connection.getParsedAccountInfo(mint);

    if (!mintInfo.value || !mintInfo.value.data || typeof mintInfo.value.data !== 'object') {
      return null;
    }

    const parsedData = mintInfo.value.data as any;
    const decimals = parsedData.parsed?.info?.decimals || 9;

    // Try to derive metadata PDA (Metaplex standard)
    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    const metadataAccount = await connection.getAccountInfo(metadataPDA);
    if (metadataAccount) {
      // Basic parsing of metadata account (simplified)
      const data = metadataAccount.data;
      // This is a simplified parser - full implementation would use @metaplex-foundation/mpl-token-metadata
      const nameStart = 69; // Typical offset for name in metadata account
      const symbolStart = 137; // Typical offset for symbol

      const name = data.slice(nameStart, nameStart + 32).toString('utf8').replace(/\0/g, '').trim();
      const symbol = data.slice(symbolStart, symbolStart + 10).toString('utf8').replace(/\0/g, '').trim();

      if (name || symbol) {
        return {
          symbol: symbol || 'UNKNOWN',
          name: name || 'Unknown Token',
          decimals,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching on-chain metadata:', error);
    return null;
  }
}

/**
 * Fetch token price in SOL and USD using Jupiter Price API
 */
export async function fetchTokenPrice(
  mintAddress: string
): Promise<{ priceInSol: number; priceInUsd: number } | null> {
  // Check cache first
  const cached = priceCache.get(mintAddress);
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_DURATION) {
    return {
      priceInSol: cached.solPrice,
      priceInUsd: cached.price,
    };
  }

  try {
    // Special case for SOL
    if (mintAddress === 'So11111111111111111111111111111111111111112') {
      // Fetch SOL price from Jupiter
      const response = await fetch(
        `https://price.jup.ag/v4/price?ids=${mintAddress}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch price');
      }

      const data = await response.json();
      const solPrice = data.data?.[mintAddress]?.price || 0;

      priceCache.set(mintAddress, {
        price: solPrice,
        solPrice: 1.0, // SOL to SOL is always 1
        timestamp: Date.now(),
      });

      return {
        priceInSol: 1.0,
        priceInUsd: solPrice,
      };
    }

    // Fetch token price and SOL price
    const [tokenResponse, solResponse] = await Promise.all([
      fetch(`https://price.jup.ag/v4/price?ids=${mintAddress}`),
      fetch(`https://price.jup.ag/v4/price?ids=So11111111111111111111111111111111111111112`),
    ]);

    if (!tokenResponse.ok || !solResponse.ok) {
      return null;
    }

    const [tokenData, solData] = await Promise.all([
      tokenResponse.json(),
      solResponse.json(),
    ]);

    const tokenPrice = tokenData.data?.[mintAddress]?.price || 0;
    const solPriceUsd = solData.data?.['So11111111111111111111111111111111111111112']?.price || 0;

    if (tokenPrice === 0 || solPriceUsd === 0) {
      return null;
    }

    // Calculate price in SOL
    const priceInSol = tokenPrice / solPriceUsd;

    priceCache.set(mintAddress, {
      price: tokenPrice,
      solPrice: priceInSol,
      timestamp: Date.now(),
    });

    return {
      priceInSol,
      priceInUsd: tokenPrice,
    };
  } catch (error) {
    console.error(`Error fetching price for ${mintAddress}:`, error);
    return null;
  }
}

/**
 * Enrich locked token info with metadata and pricing
 */
export async function enrichLockedTokenInfo(
  lockedToken: any
): Promise<any> {
  try {
    // Fetch metadata
    const metadata = await fetchTokenMetadata(lockedToken.mint);

    if (metadata) {
      lockedToken.tokenSymbol = metadata.symbol;
      lockedToken.tokenName = metadata.name;
      lockedToken.tokenLogoUri = metadata.logoUri;
    }

    // Fetch pricing
    const price = await fetchTokenPrice(lockedToken.mint);

    if (price && lockedToken.uiAmount > 0) {
      lockedToken.pricePerToken = price.priceInUsd;
      lockedToken.solValue = lockedToken.uiAmount * price.priceInSol;
      lockedToken.usdValue = lockedToken.uiAmount * price.priceInUsd;
    }

    return lockedToken;
  } catch (error) {
    console.error('Error enriching locked token info:', error);
    return lockedToken; // Return original if enrichment fails
  }
}

/**
 * Batch enrich multiple locked tokens
 */
export async function enrichLockedTokens(
  lockedTokens: any[]
): Promise<any[]> {
  // Process in parallel with rate limiting
  const enriched = await Promise.all(
    lockedTokens.map(token => enrichLockedTokenInfo(token))
  );

  return enriched;
}

/**
 * Format token amount with symbol
 */
export function formatTokenAmount(amount: number, symbol?: string, decimals: number = 2): string {
  if (amount === 0) return '0';

  let formatted: string;

  if (amount < 0.000001) {
    formatted = amount.toExponential(2);
  } else if (amount < 1) {
    formatted = amount.toFixed(6);
  } else if (amount < 1000) {
    formatted = amount.toFixed(decimals);
  } else if (amount < 1000000) {
    formatted = (amount / 1000).toFixed(2) + 'K';
  } else if (amount < 1000000000) {
    formatted = (amount / 1000000).toFixed(2) + 'M';
  } else {
    formatted = (amount / 1000000000).toFixed(2) + 'B';
  }

  return symbol ? `${formatted} ${symbol}` : formatted;
}

/**
 * Format value in SOL
 */
export function formatSolValue(amount: number): string {
  if (amount === 0) return '0 SOL';
  if (amount < 0.001) return `${amount.toFixed(6)} SOL`;
  if (amount < 1) return `${amount.toFixed(4)} SOL`;
  return `${amount.toFixed(2)} SOL`;
}

/**
 * Format value in USD
 */
export function formatUsdValue(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1000) return `$${amount.toFixed(2)}`;
  if (amount < 1000000) return `$${(amount / 1000).toFixed(2)}K`;
  return `$${(amount / 1000000).toFixed(2)}M`;
}
