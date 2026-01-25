import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=dd091d8d-f7eb-4d3c-83fc-87cc3232f4f6';
const connection = new Connection(RPC, 'confirmed');

const TX_SIGNATURE = '53yMusiBTRnZjcNBaAFdjCyZNRQCeiyKgfpM7dtekDK2bVczUdVynizxAL4CWJGxTpnt6zBAvcRr6gXJZDZPh2Ki';

async function analyzeTx() {
  console.log('Analyzing transaction:', TX_SIGNATURE);
  console.log('');

  try {
    const tx = await connection.getTransaction(TX_SIGNATURE, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      console.log('❌ Transaction not found');
      return;
    }

    console.log('✅ Transaction found!');
    console.log('Slot:', tx.slot);
    console.log('Block time:', tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : 'Unknown');
    console.log('');

    // Get account keys - handle both legacy and versioned transactions
    let accountKeys;
    try {
      const message = tx.transaction.message as any;
      if ('getAccountKeys' in message) {
        // Try to load lookup tables for versioned transactions
        if ('addressTableLookups' in message && message.addressTableLookups?.length > 0) {
          console.log('⚠️ Transaction uses address lookup tables (versioned tx)');
          console.log('');
        }
        accountKeys = message.staticAccountKeys;
      } else {
        accountKeys = message.accountKeys;
      }
    } catch (e) {
      console.log('Using legacy account keys');
      accountKeys = (tx.transaction.message as any).accountKeys;
    }

    console.log('Accounts involved in transaction:');
    accountKeys.forEach((key: PublicKey, index: number) => {
      console.log(`  [${index}] ${key.toBase58()}`);
    });

    console.log('');

    // Find the program invoked
    const instructions = tx.transaction.message.compiledInstructions;
    console.log('Instructions:');
    instructions.forEach((ix, index) => {
      const programId = accountKeys[ix.programIdIndex];
      console.log(`  Instruction ${index}: Program ${programId.toBase58()}`);
      console.log(`    Account indexes: ${ix.accountKeyIndexes.join(', ')}`);
    });

    console.log('');

    // Check for our known programs
    const STREAMFLOW_V2 = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m';
    const STREAMFLOW_V1 = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUTNTqrvg';

    const involvedPrograms = instructions.map(ix =>
      accountKeys[ix.programIdIndex].toBase58()
    );

    console.log('Programs involved:', involvedPrograms);
    console.log('');

    if (involvedPrograms.includes(STREAMFLOW_V2)) {
      console.log('🎯 This transaction involves Streamflow v2!');

      // Find which account is the vesting contract
      const streamflowIx = instructions.find(ix =>
        accountKeys[ix.programIdIndex].toBase58() === STREAMFLOW_V2
      );

      if (streamflowIx) {
        console.log('');
        console.log('Streamflow instruction account indexes:', streamflowIx.accountKeyIndexes);
        console.log('Streamflow contract accounts:');
        streamflowIx.accountKeyIndexes.forEach((keyIndex, i) => {
          if (keyIndex < accountKeys.length) {
            const account = accountKeys[keyIndex];
            console.log(`  Account ${i} (index ${keyIndex}): ${account.toBase58()}`);
          }
        });
      }
    } else if (involvedPrograms.includes(STREAMFLOW_V1)) {
      console.log('🎯 This transaction involves Streamflow v1!');
    }

    // Get the fee payer / signer
    const feePayer = accountKeys[0];
    console.log('');
    console.log('Fee payer / Signer:', feePayer.toBase58());
    console.log('');
    console.log('Looking for wallet 6jKC5s2V9H88DGUK1U5rTDpxomUbznEbKJJcGmhtf7R7...');

    const targetWallet = '6jKC5s2V9H88DGUK1U5rTDpxomUbznEbKJJcGmhtf7R7';
    const found = accountKeys.some((key: any) => key.toBase58() === targetWallet);

    if (found) {
      const index = accountKeys.findIndex((key: any) => key.toBase58() === targetWallet);
      console.log(`✅ FOUND wallet at account index ${index}`);
    } else {
      console.log('❌ Wallet not found in transaction accounts');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

analyzeTx();
