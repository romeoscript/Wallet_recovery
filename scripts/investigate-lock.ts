import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=dd091d8d-f7eb-4d3c-83fc-87cc3232f4f6';
const connection = new Connection(RPC, 'confirmed');

const CONTRACT_ID = 'HM1YPEwd4jHPQ2cycYWbS2nS5Sci168Ac1qqrhPJYDkj';
const RECIPIENT = 'HxbkzYxS6JZ5boSWecwEqg5PsHWLMJV3Gz8DaxV3ZL3R';

async function investigate() {
  console.log('Investigating contract:', CONTRACT_ID);
  console.log('Recipient:', RECIPIENT);
  console.log('');

  try {
    // Fetch account info
    const contractPubkey = new PublicKey(CONTRACT_ID);
    const accountInfo = await connection.getAccountInfo(contractPubkey);

    if (!accountInfo) {
      console.log('❌ Account not found');
      return;
    }

    console.log('✅ Account found!');
    console.log('Owner (Program ID):', accountInfo.owner.toBase58());
    console.log('Data length:', accountInfo.data.length);
    console.log('Lamports:', accountInfo.lamports);
    console.log('Executable:', accountInfo.executable);
    console.log('');

    // Check if it's one of the known programs
    const STREAMFLOW = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUTNTqrvg';
    const JUPITER_LOCK = 'LocpQqnNQu2b5vFZG5U5cTacdXhFuVLZHSxHVvhk7VM';

    if (accountInfo.owner.toBase58() === STREAMFLOW) {
      console.log('🎯 This is a STREAMFLOW vesting contract!');
    } else if (accountInfo.owner.toBase58() === JUPITER_LOCK) {
      console.log('🎯 This is a JUPITER LOCK contract!');
    } else {
      console.log('🔍 This is a DIFFERENT protocol:');
      console.log('   Program:', accountInfo.owner.toBase58());
    }

    console.log('');
    console.log('Raw data (first 100 bytes):');
    console.log(accountInfo.data.slice(0, 100));
    console.log('');

    // Try to find where the recipient address might be stored
    const recipientPubkey = new PublicKey(RECIPIENT);
    const recipientBytes = recipientPubkey.toBytes();

    console.log('Looking for recipient address in account data...');
    for (let i = 0; i < accountInfo.data.length - 32; i++) {
      if (accountInfo.data.slice(i, i + 32).equals(Buffer.from(recipientBytes))) {
        console.log(`✅ Found recipient address at offset ${i}`);
      }
    }

    // Check for wallet being searched
    const walletToSearch = new PublicKey('6jKC5s2V9H88DGUK1U5rTDpxomUbznEbKJJcGmhtf7R7');
    const walletBytes = walletToSearch.toBytes();

    console.log('');
    console.log('Looking for wallet 6jKC5s2V9H88DGUK1U5rTDpxomUbznEbKJJcGmhtf7R7 in data...');
    for (let i = 0; i < accountInfo.data.length - 32; i++) {
      if (accountInfo.data.slice(i, i + 32).equals(Buffer.from(walletBytes))) {
        console.log(`✅ Found wallet address at offset ${i}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

investigate();
