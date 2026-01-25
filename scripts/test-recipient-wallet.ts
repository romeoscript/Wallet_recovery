import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=dd091d8d-f7eb-4d3c-83fc-87cc3232f4f6';
const connection = new Connection(RPC, 'confirmed');

const STREAMFLOW_PROGRAM_IDS = [
  new PublicKey('strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUTNTqrvg'), // Streamflow v1
  new PublicKey('strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m'), // Streamflow v2 (Timelock)
];

// The RECIPIENT wallet from the screenshot
const RECIPIENT_WALLET = 'HxbkzYxS6JZ5boSWecwEqg5PsHWLMJV3Gz8DaxV3ZL3R';

async function testRecipient() {
  console.log('Testing with RECIPIENT wallet:', RECIPIENT_WALLET);
  console.log('');

  const walletPubkey = new PublicKey(RECIPIENT_WALLET);
  let totalFound = 0;

  for (const programId of STREAMFLOW_PROGRAM_IDS) {
    console.log(`Checking Streamflow program: ${programId.toBase58()}`);

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
            if (pubkey.toBase58() === 'HM1YPEwd4jHPQ2cycYWbS2nS5Sci168Ac1qqrhPJYDkj') {
              console.log(`       🎯 THIS IS THE CONTRACT FROM THE SCREENSHOT!`);
            }
            totalFound++;
          });
        }
      } catch (error) {
        // Silent
      }
    }
  }

  console.log('');
  console.log(`🎯 TOTAL FOUND: ${totalFound} locked token account(s)`);

  if (totalFound > 0) {
    console.log('✅ SUCCESS! Found contracts for recipient wallet!');
  }
}

testRecipient();
