import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=dd091d8d-f7eb-4d3c-83fc-87cc3232f4f6';
const connection = new Connection(RPC, 'confirmed');

const STREAMFLOW_PROGRAM_IDS = [
  new PublicKey('strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUTNTqrvg'), // Streamflow v1
  new PublicKey('strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m'), // Streamflow v2 (Timelock)
];

const WALLET_TO_TEST = '6jKC5s2V9H88DGUK1U5rTDpxomUbznEbKJJcGmhtf7R7';

async function testDetection() {
  console.log('Testing locked token detection for:', WALLET_TO_TEST);
  console.log('');

  const walletPubkey = new PublicKey(WALLET_TO_TEST);
  let totalFound = 0;

  for (const programId of STREAMFLOW_PROGRAM_IDS) {
    console.log(`\nChecking Streamflow program: ${programId.toBase58()}`);

    const offsets = [49, 8, 113];

    for (const offset of offsets) {
      try {
        const accounts = await connection.getProgramAccounts(programId, {
          filters: [
            {
              memcmp: {
                offset,
                bytes: walletPubkey.toBase58(),
              },
            },
          ],
        });

        if (accounts.length > 0) {
          console.log(`  ✅ Found ${accounts.length} account(s) at offset ${offset}`);
          accounts.forEach(({ pubkey }) => {
            console.log(`     - ${pubkey.toBase58()}`);
            totalFound++;
          });
        } else {
          console.log(`  ⚪ No accounts at offset ${offset}`);
        }
      } catch (error) {
        console.log(`  ❌ Error at offset ${offset}:`, (error as Error).message);
      }
    }
  }

  console.log('');
  console.log(`\n🎯 TOTAL FOUND: ${totalFound} locked token account(s)`);

  if (totalFound > 0) {
    console.log('\n✅ SUCCESS! The detection is working!');
  } else {
    console.log('\n❌ No locked tokens found. There may be an issue.');
  }
}

testDetection();
