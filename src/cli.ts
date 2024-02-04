import { Keypair } from "@solana/web3.js";
import { program, Option } from "commander";
import pkg from "../package.json";
import { logger } from "./logger";
import fs from "fs/promises";
import { bytes } from "@coral-xyz/anchor/dist/cjs/utils";

type Options = {
  rpc: string;
  keypair?: Keypair;
  simulateOnly: boolean;
  parallelTransactions: number;
}

program.name("wallet-cleanup")
  .description("Solana wallet cleanup tool")
  .version(pkg.version)
  .addOption(new Option("-r, --rpc <string>", "RPC to use").default("https://api.mainnet-beta.solana.com").env("WC_RPC"))
  .addOption(new Option("-k, --private-key <string>", "Wallet private key (file or json or bs58 encoded)").default("wallet.json").env("WC_PRIVATE_KEY").makeOptionMandatory(true))
  .addOption(new Option("-s --simulate-only", "Don't actually send transactions, just simulate them").default(false).env("WC_SIMULATE"))
  .addOption(new Option("-p --parallel-transactions <number>", "Number of parallel transactions to send when batching instructions").default(5).argParser(parseInt).env("WC_PARALLEL_TX"))

export var options: Options = Object.assign({});

export async function loadCliOptions() {
  program.parse();

  const args = program.opts();

  const cliOptions: Partial<Options> = {};

  if (typeof args.rpc !== "undefined") {
    cliOptions.rpc = args.rpc;
  }

  if (typeof args.privateKey !== "undefined") {
    // check if it's a file
    let isFile = false;
    try {
      await fs.access(args.privateKey, fs.constants.F_OK);
      isFile = true;
    } catch (error) {
      // not a file
      logger.error(error);
    }
    if (isFile) {
      const inputFile = await fs.readFile(args.privateKey);
      try {
        const inputTxt = inputFile.toString("utf8");
        const inputObj = JSON.parse(inputTxt);
        const inputBuffer = Uint8Array.from(inputObj);
        cliOptions.keypair = Keypair.fromSecretKey(inputBuffer);
      } catch (error) {
        logger.error(`Unable to load private key input file ${args.privateKey}`);
        logger.error(error);
      }
    } else {
      try {
        const inputObj = JSON.parse(args.privateKey);
        const inputBuffer = Uint8Array.from(inputObj);
        cliOptions.keypair = Keypair.fromSecretKey(inputBuffer);
      } catch (error) {
        try {
          const inputBuffer = bytes.bs58.decode(args.privateKey);
          cliOptions.keypair = Keypair.fromSecretKey(inputBuffer);
        } catch (error) {
          logger.error(`Unable to load private key ${args.privateKey}`);
        }
      }
    }
  }

  if (args.simulateOnly === true) {
    cliOptions.simulateOnly = true;
  } else {
    cliOptions.simulateOnly = false;
  }
  cliOptions.parallelTransactions = args.parallelTransactions;

  options = Object.assign({}, cliOptions as Options);
}