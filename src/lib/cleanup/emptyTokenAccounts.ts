import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { LoggerInterface } from "../types/logger";
import { TransactionBatch, TransactionBatchBuilder } from "../solana/batchInstructions";
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction } from "@solana/spl-token";
import { Wallet } from "@coral-xyz/anchor";

export async function closeEmptyTokenAccounts(
  connection: Connection,
  keypair: Keypair,
  logger: LoggerInterface,
  parallelTransactions: number,
  simulateOnly: boolean = true,
): Promise<boolean> {
  const emptyAccounts: string[] = [];
  let emptyRent: number = 0;

  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { programId: TOKEN_PROGRAM_ID });
    for (const account of accounts.value) {
      if (account.account.data && "parsed" in account.account.data && "info" in account.account.data.parsed && account.account.data.parsed.type === "account") {
        const info = account.account.data.parsed.info;
        if (info.tokenAmount.uiAmount === 0) {
          emptyAccounts.push(account.pubkey.toBase58());
          emptyRent += account.account.lamports;
        }
      }
    }
  } catch (error) {
    logger.error(`Was unable to fetch empty accounts`);
    logger.debug(error);
    return false;
  }

  logger.info(`Found ${emptyAccounts.length} empty accounts, total rent to recover ${Math.round((emptyRent / LAMPORTS_PER_SOL * 1000 ) / 1000)} SOL`);

  if (emptyAccounts.length > 0) {
    try {
      const wallet = new Wallet(keypair);
      const batch = new TransactionBatch({
        connection,
        wallet,
        // computeUnits: TransactionBatchBuilder.COMPUTE_UNITS
        computePrice: emptyAccounts.length > 50 ? TransactionBatchBuilder.PRIORITY_NORMAL : undefined
      });

      for (const account of emptyAccounts) {
        const closeIx = createCloseAccountInstruction(new PublicKey(account), keypair.publicKey, keypair.publicKey);
        batch.addInstructions(closeIx);
      }

      const success = await batch.signAndSend({
        abortOnFail: false,
        confirmationTimeout: 90,
        noRetry: false,
        batchLimit: parallelTransactions,
        simulateOnly: simulateOnly,
        statusMessage(message, isError) {
          if (isError === true) {
            logger.error(message);
          } else {
            logger.info(message);
          }
        },
      });

      if (success === true) {
        logger.info(`All empty accounts were closed`);
      } else {
        logger.warn(`Not all empty accounts were closed, wait a minute and retry`);
      }

    } catch (error) {
      logger.error(`Was unable to close empty accounts`);

    }
  }

  return true;
}