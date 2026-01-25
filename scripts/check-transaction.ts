import { Connection } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=dd091d8d-f7eb-4d3c-83fc-87cc3232f4f6';
const connection = new Connection(RPC, 'confirmed');

// One of the successful transaction signatures
const TX_SIGNATURE = '4K7FWQJB5VnxoAqNQsFws8yL9Eagi2BWwZpuaCgm1uMGXqF4bgYABKBqt4nqHyFdYebUCqn749tdVJjAegKD1T6';

async function checkTransaction() {
  console.log('Checking transaction:', TX_SIGNATURE);
  console.log('');

  try {
    const tx = await connection.getTransaction(TX_SIGNATURE, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) {
      console.log('❌ Transaction not found or has no metadata');
      return;
    }

    console.log('✅ Transaction found!');
    console.log('Slot:', tx.slot);
    console.log('Success:', tx.meta.err === null);
    console.log('');

    // Get pre and post balances
    const preBalances = tx.meta.preBalances;
    const postBalances = tx.meta.postBalances;
    const message = tx.transaction.message as any;
    const accountKeys = message.staticAccountKeys || message.accountKeys;

    console.log('Balance Changes:');
    console.log('');

    accountKeys.forEach((key: any, index: number) => {
      const preSol = preBalances[index] / 1e9;
      const postSol = postBalances[index] / 1e9;
      const change = postSol - preSol;

      if (change !== 0) {
        console.log(`${key.toBase58()}`);
        console.log(`  Before: ${preSol.toFixed(6)} SOL`);
        console.log(`  After:  ${postSol.toFixed(6)} SOL`);
        console.log(`  Change: ${change > 0 ? '+' : ''}${change.toFixed(6)} SOL`);
        console.log('');
      }
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkTransaction();
