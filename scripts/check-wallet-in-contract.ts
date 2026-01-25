import { Connection, PublicKey } from '@solana/web3.js';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=dd091d8d-f7eb-4d3c-83fc-87cc3232f4f6';
const connection = new Connection(RPC, 'confirmed');

const CONTRACT_ID = 'HM1YPEwd4jHPQ2cycYWbS2nS5Sci168Ac1qqrhPJYDkj';
const WALLET_TO_FIND = '6jKC5s2V9H88DGUK1U5rTDpxomUbznEbKJJcGmhtf7R7';

async function checkContract() {
  console.log('Checking if wallet appears in contract data');
  console.log('Contract:', CONTRACT_ID);
  console.log('Wallet to find:', WALLET_TO_FIND);
  console.log('');

  try {
    const contractPubkey = new PublicKey(CONTRACT_ID);
    const accountInfo = await connection.getAccountInfo(contractPubkey);

    if (!accountInfo) {
      console.log('❌ Contract account not found');
      return;
    }

    console.log('✅ Contract found');
    console.log('Owner program:', accountInfo.owner.toBase58());
    console.log('Data length:', accountInfo.data.length);
    console.log('');

    // Check if wallet appears in the data
    const walletPubkey = new PublicKey(WALLET_TO_FIND);
    const walletBytes = walletPubkey.toBytes();

    console.log('Searching for wallet in contract data...');
    let found = false;

    for (let i = 0; i < accountInfo.data.length - 32; i++) {
      if (accountInfo.data.slice(i, i + 32).equals(Buffer.from(walletBytes))) {
        console.log(`✅ FOUND wallet at offset ${i}`);
        found = true;
      }
    }

    if (!found) {
      console.log('❌ Wallet NOT found in contract data');
      console.log('');
      console.log('This means:');
      console.log('- The wallet might not be the direct recipient');
      console.log('- The contract might be derived/associated with the wallet');
      console.log('- We need a different approach to find these contracts');
      console.log('');

      // Let's check if the contract is a PDA derived from the wallet
      console.log('Checking if contract is a PDA (Program Derived Address)...');

      const programId = accountInfo.owner;

      // Try common PDA seeds
      const seeds = [
        ['metadata'],
        ['vesting'],
        ['stream'],
        ['lock'],
        [walletPubkey.toBuffer()],
      ];

      for (const seed of seeds) {
        try {
          const [pda] = PublicKey.findProgramAddressSync(
            seed as Buffer[],
            programId
          );

          if (pda.toBase58() === CONTRACT_ID) {
            console.log(`✅ Contract IS a PDA with seed: ${JSON.stringify(seed)}`);
          }
        } catch (e) {
          // Silent fail
        }
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkContract();
