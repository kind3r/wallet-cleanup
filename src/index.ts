import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadCliOptions, options } from "./cli";
import { ERROR_PRIVATE_KEY, ERROR_RPC } from "./errors";
import { logger } from "./logger";
import { closeEmptyTokenAccounts } from "./lib/cleanup/emptyTokenAccounts";

async function init() {
  // load cli options
  await loadCliOptions();

  // check wallet pk
  if (typeof options.keypair === "undefined") {
    logger.error("No private key");
    process.exit(ERROR_PRIVATE_KEY);
  }

  // create connection object and check RPC
  const connection = new Connection(options.rpc, {
    commitment: "confirmed"
  });
  try {
    const bh = await connection.getLatestBlockhash();
    const balance = await connection.getBalance(options.keypair.publicKey);
    logger.info(`Loaded wallet ${options.keypair.publicKey.toBase58()} with balance ${Math.round(balance / LAMPORTS_PER_SOL * 1000) / 1000} SOL`);
  } catch (error) {
    logger.error("Invalid RPC");
    process.exit(ERROR_RPC);
  }
  
  await closeEmptyTokenAccounts(connection, options.keypair, logger, options.parallelTransactions, options.simulateOnly);

  process.exit(0);
}

init();