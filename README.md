# NullSet Solana Wallet Recovery

**Reclaim your lost SOL and manage multiple wallets with ease.**

Built by [@NullSetDev](https://x.com/NullSetDev)

---

## What Does This Tool Do?

This dashboard helps you recover lost value from your Solana wallets by:

### 💰 Reclaim Old Rent Accounts
Like [@solincinerator](https://x.com/solincinerator), this tool automatically finds and closes empty token accounts across all your wallets, sending the rent (SOL) back to your main wallet. Each empty account returns ~0.002 SOL.

### 🎯 Claim Pumpfun Creator Rewards
Automatically detect and claim any pending creator rewards from [@Pumpfun](https://x.com/pumpfun) tokens you've created. Never leave money on the table.

### 🔒 View & Track Locked Tokens
See all your locked/vested tokens across wallets with real-time tracking of:
- Unlock schedules
- Vesting progress
- Total locked value
- When tokens become available

### 🧹 Clean Up Dust Tokens
Burn worthless dust tokens and reclaim the account rent to clean up your wallet.

---

## Key Features

- **Multi-Wallet Management**: Manage 100+ wallets from a single seed phrase or private key list
- **Automatic Scanning**: Finds all reclaimable rent across your entire wallet portfolio
- **Batch Processing**: Process multiple wallets at once to save time
- **Real-Time Tracking**: Live updates on your reclaimable SOL and locked tokens
- **Clean Interface**: Modern, easy-to-use dashboard
- **Privacy First**: Everything runs locally on your machine - your keys never leave your computer

---

## Quick Start Guide

### Prerequisites
- Node.js 18+ installed on your computer
- A Solana wallet (seed phrase or private keys)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/notsmithdev/nullset-solana-wallet-recovery.git
cd nullset-solana-wallet-recovery
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the application**
```bash
npm run dev
```

4. **Open your browser**
Navigate to: `http://localhost:3500`

---

## How to Use

### Step 1: Connect Your Wallets

Choose one of two methods:

**Option A: Seed Phrase**
1. Enter your 12 or 24-word seed phrase
2. Specify how many accounts to derive (e.g., 100)
3. Click "Initialize Scanner"

**Option B: Private Keys**
1. Click "Use Secret Keys Instead"
2. Paste your private keys (as JSON array)
3. Click "Initialize Scanner"

### Step 2: Enter Destination Address

Enter the wallet address where you want to receive all reclaimed SOL. This is where your rent refunds will be sent.

### Step 3: Scan Your Wallets

The tool will automatically scan all your wallets to find:
- Empty token accounts (rent to reclaim)
- Dust token accounts (burn & reclaim)
- Locked/vested tokens
- Pumpfun creator rewards

### Step 4: Review Results

The dashboard shows:
- **Total Reclaimable SOL**: How much rent you can recover
- **Empty Accounts**: Token accounts with 0 balance
- **Dust Tokens**: Low-value tokens you can burn
- **Locked Tokens**: View your vesting schedules
- **Creator Rewards**: Pending Pumpfun earnings

### Step 5: Process Wallets

- Click individual wallets to process them one at a time
- Or click **"Process All"** to clean everything at once

---

## What Happens During Processing?

### Closing Empty Accounts
1. Creates transactions to close each empty token account
2. Rent refund (0.002 SOL per account) goes to your destination wallet
3. Automatically batches up to 8 closures per transaction

### Burning Dust Tokens
1. Burns the small token balance to 0
2. Closes the now-empty account
3. Sends rent refund to your destination wallet
4. Batches up to 4 burn+close operations per transaction

### Claiming Creator Rewards
1. Detects any unclaimed Pumpfun creator fees
2. Creates claim transaction
3. Sends rewards to your destination wallet

---

## RPC Configuration (Optional)

For better performance and no rate limits, use a private RPC endpoint:

1. Create a `.env` file in the project root
2. Add your RPC endpoint:

```bash
NEXT_PUBLIC_RPC_ENDPOINT=https://your-rpc-endpoint.com
```

### Recommended RPC Providers:
- **Helius** - Free tier: 100 req/sec
- **QuickNode** - Free tier available
- **Alchemy** - Free tier available

*The tool works with the public RPC, but a private endpoint is faster and more reliable.*

---

## Security & Privacy

⚠️ **IMPORTANT SECURITY NOTICE**

- This application handles your private keys **locally only**
- Your keys **never leave your computer**
- No data is sent to any external servers
- Run on a secure, private computer
- Never share your seed phrase or private keys
- Always verify transactions before signing

**Best Practices:**
- Use on a secure, offline machine for maximum safety
- Double-check the destination address before processing
- Start with a small test wallet if you're unsure
- Keep your seed phrase backed up securely

---

## Technical Details

### Stack
- **Framework**: Next.js 14 (React App Router)
- **Blockchain**: @solana/web3.js, @solana/spl-token
- **Vesting**: @streamflow/stream
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Rate Limiting**: p-limit

### Transaction Safety
- All transactions require your approval
- Uses priority fees for faster confirmation
- Automatic retry logic for failed transactions
- Conservative batching to avoid compute limits

### Supported Features
- BIP39 seed phrase derivation (m/44'/501'/x'/0')
- Base58 and Uint8Array private key formats
- SPL Token account management
- Streamflow vesting contract detection
- Pumpfun creator reward detection

---

## Troubleshooting

**"RPC Rate Limited" errors:**
- Use a private RPC endpoint (see RPC Configuration above)
- Reduce the number of concurrent scans

**"Transaction failed" errors:**
- Network congestion - try again in a few seconds
- Increase priority fees in the settings
- Check your SOL balance for transaction fees

**"No empty accounts found":**
- Your wallets may already be clean
- Try scanning more derived accounts

**Locked tokens not showing:**
- Ensure you're connected to Solana mainnet
- Some vesting contracts may not be supported yet

---

## FAQ

**Q: Is this safe to use?**
A: Yes. Everything runs locally on your computer. Your private keys never leave your machine.

**Q: How much SOL can I reclaim?**
A: Each empty token account returns ~0.002 SOL. If you have 100 empty accounts, that's ~0.2 SOL.

**Q: Does this work with hardware wallets?**
A: Currently, only seed phrases and private keys are supported.

**Q: Can I use this with Phantom or Solflare?**
A: This tool is designed for bulk wallet management. For single wallets, use your browser wallet.

**Q: What about my locked tokens?**
A: The tool shows you vesting schedules but doesn't unlock them early. Locks are enforced by smart contracts.

---

## Support & Community

- **Twitter**: [@NullSetDev](https://x.com/NullSetDev)
- **Issues**: [GitHub Issues](https://github.com/notsmithdev/nullset-solana-wallet-recovery/issues)

---

## License

This is open-source software. Use at your own risk. Always verify transactions before signing.

**Built with ❤️ by the NullSet team**
