import { AddressLookupTableAccount, Blockhash, ComputeBudgetProgram, Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage } from "@solana/web3.js";
import { TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { TimeoutStatus, TransactionWithRetryAndAbortResult, sendTransactionWithRetryAndAbort, simulateTransaction } from "./solanaCommon";
import { Wallet } from "@coral-xyz/anchor";


type TransactionBatchBuilderArgs = {
  payer: PublicKey;
  blockhash: Blockhash;
  lookupTables?: AddressLookupTableAccount[];
  computeUnits?: number;
  computePrice?: number;
}

export class TransactionBatchBuilder {
  static COMPUTE_UNITS = 1200000;
  static PRIORITY_NORMAL = 200000;
  private _payer: PublicKey;
  private _blockhash: Blockhash;
  private _lookupTables: AddressLookupTableAccount[] | undefined;
  private _transactions: VersionedTransaction[] = [];
  private _instructions: TransactionInstruction[] = [];
  private _fees: number = 0;
  private _computeUnits?: number;
  private _computePrice?: number;

  public constructor(options: TransactionBatchBuilderArgs) {
    this._payer = options.payer;
    this._blockhash = options.blockhash;
    this._lookupTables = options.lookupTables;
    this._computeUnits = options.computeUnits;
    this._computePrice = options.computePrice;
  }

  addInstructions(instructions: TransactionInstruction | TransactionInstruction[], fees?: number) {
    // normalise input
    let newInstructions: TransactionInstruction[] = [];
    if ("length" in instructions) {
      newInstructions.push(...instructions);
    } else {
      newInstructions.push(instructions);
    }
    if (typeof fees !== "undefined") {
      this._fees += fees;
    }
    // add instructions and/or create new transaction
    if (this._instructions.length === 0) {
      this._instructions.push(...newInstructions);
    } else {
      const tempInstructions = this._initInstructions();
      tempInstructions.push(...this._instructions);
      tempInstructions.push(...newInstructions);
      const tempMessage = new TransactionMessage({
        payerKey: this._payer,
        recentBlockhash: this._blockhash,
        instructions: tempInstructions
      }).compileToV0Message(this._lookupTables);
      const tempTransaction = new VersionedTransaction(tempMessage);
      let txLen: number = -1;
      try {
        txLen = tempTransaction.serialize().byteLength;
      } catch (error) { }
      // console.log(`Tx length: ${txLen}`);
      if (txLen === -1 || txLen > 1232) {
        if (typeof fees !== "undefined") {
          this._fees -= fees;
        }
        const instructions = this._initInstructions();
        instructions.push(...this._instructions);
        const newMessage = new TransactionMessage({
          payerKey: this._payer,
          recentBlockhash: this._blockhash,
          instructions: instructions
        }).compileToV0Message(this._lookupTables);
        const newTransaction = new VersionedTransaction(newMessage);
        this._transactions.push(newTransaction);
        this._instructions = newInstructions;
        if (typeof fees !== "undefined") {
          this._fees = fees;
        }
      } else {
        this._instructions.push(...newInstructions);
      }
    }
  }

  getTransactionsCount() {
    let count = this._transactions.length;
    if (this._instructions.length > 0) {
      count++;
    }
    return count;
  }

  getTransactions() {
    if (this._instructions.length > 0) {
      const instructions = this._initInstructions();
      instructions.push(...this._instructions);
      const newMessage = new TransactionMessage({
        payerKey: this._payer,
        recentBlockhash: this._blockhash,
        instructions: instructions
      }).compileToV0Message(this._lookupTables);
      const newTransaction = new VersionedTransaction(newMessage);
      this._transactions.push(newTransaction);
      this._instructions = [];
    }
    // console.log(`${this._transactions.length} transactions in batch`);
    return this._transactions;
  }

  _initInstructions() {
    const instructions: TransactionInstruction[] = [];
    // compute budget
    if (typeof this._computeUnits !== "undefined") {
      instructions.push(ComputeBudgetProgram.setComputeUnitLimit({
        units: this._computeUnits
      }));
    }
    // priority fee
    if (typeof this._computePrice !== "undefined") {
      instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: this._computePrice
      }));
    }
    // fees
    if (this._fees > 0) {
      instructions.push(SystemProgram.transfer({
        fromPubkey: this._payer,
        toPubkey: new PublicKey(process.env.NEXT_PUBLIC_RENTWALLET || ""),
        lamports: this._fees * LAMPORTS_PER_SOL,
      }));
    }
    return instructions;
  }
}

type TransactionBatchArgs = {
  connection: Connection;
  wallet: Wallet;
  blockhash?: Blockhash;
  lookupTables?: AddressLookupTableAccount[];
  computeUnits?: number;
  computePrice?: number;
}
export class TransactionBatch {
  private _connection: Connection;
  private _wallet: Wallet;
  private _builder: TransactionBatchBuilder;
  private _blockhash: string = "GmfDHdkQVGbaFCz5NMqiSBYjR5w347xJhhi2gGHw5sMt";
  private _blockhashTime: number = 0;
  public addInstructions;
  public getTransactionsCount;

  constructor({
    connection,
    wallet,
    blockhash,
    lookupTables,
    computeUnits,
    computePrice,
  }: TransactionBatchArgs) {
    this._connection = connection;
    this._wallet = wallet;
    if (typeof blockhash !== "undefined") {
      this._blockhash = blockhash;
      this._blockhashTime = Math.round(Date.now() / 1000);
    }
    this._builder = new TransactionBatchBuilder({
      payer: this._wallet.publicKey,
      blockhash: this._blockhash,
      lookupTables: lookupTables,
      computeUnits: computeUnits,
      computePrice: computePrice
    });
    this.addInstructions = this._builder.addInstructions.bind(this._builder);
    this.getTransactionsCount = this._builder.getTransactionsCount.bind(this._builder);
  }

  async signAndSend({
    abortOnFail = true,
    noRetry = true,
    confirmationTimeout = 60,
    simulateOnly = false,
    statusMessage,
    batchLimit = 10
  }: {
    abortOnFail?: boolean,
    noRetry?: boolean,
    confirmationTimeout?: number,
    simulateOnly?: boolean
    statusMessage?: (message: string, isError?: boolean) => void,
    batchLimit?: number;
  }) {
    // TODO: implement status message notification
    const transactions = this._builder.getTransactions();
    if (typeof statusMessage === "function") {
      statusMessage(`Processing ${transactions.length} transactions`);
    }
    // batch signing - split into chunks of 10 txs by default
    const limit = batchLimit;
    let offset = 0;
    let processed = 0;
    let success = true;
    do {
      try {
        await this._updateBlockhash();
        const unsignedTransactions = transactions.slice(offset, offset + limit);
        for (const tx of unsignedTransactions) {
          tx.message.recentBlockhash = this._blockhash;
        }
        // if (typeof statusMessage === "function") {
        //   statusMessage(`Signing transactions ${offset + 1}-${Math.min(offset + limit, transactions.length)} out of ${transactions.length}`);
        // }
        const signedTransactions = await this._wallet.signAllTransactions(unsignedTransactions);
        const promises: Promise<TransactionWithRetryAndAbortResult>[] = [];
        for (const tx of signedTransactions) {
          if (simulateOnly === true) {
            promises.push(simulateTransaction(this._connection, tx));
          } else {
            promises.push(sendTransactionWithRetryAndAbort(this._connection, tx, confirmationTimeout, noRetry));
          }
        }
        if (typeof statusMessage === "function") {
          statusMessage(`Sending transactions ${offset + 1}-${Math.min(offset + limit, transactions.length)} out of ${transactions.length}`);
        }
        const responses = await Promise.all(promises);
        let successfulTransactions = 0;
        let failedTransactions = 0;
        for (const response of responses) {
          if (response.result !== TimeoutStatus.SUCCESS) {
            failedTransactions++;
            success = false;
            if (typeof statusMessage === "function") {
              statusMessage(`Transaction failed with status ${response.result} and error ${JSON.stringify(response.error)}`, true);
            }
          } else {
            successfulTransactions++;
            processed++;
          }
        }

        if (failedTransactions > 0 && typeof statusMessage === "function") {
          statusMessage(`Confirmation for transactions ${offset + 1}-${Math.min(offset + limit, transactions.length)} failed ${failedTransactions} transactions`, true);
        }
      } catch (error: any) {
        console.error(error);
        success = false;
      }

      offset += limit;
    } while (offset < transactions.length && (abortOnFail === false || (abortOnFail === true && success === true)));

    if (success === false && typeof statusMessage === "function") {
      statusMessage(`Was only able to process ${processed} out of ${transactions.length} transactions`, true);
    }

    return success;
  }

  private async _updateBlockhash() {
    if (this._blockhashTime < Math.round(Date.now() / 1000) - 20) {
      const bh = await this._connection.getLatestBlockhash("finalized");
      this._blockhash = bh.blockhash;
      this._blockhashTime = Math.round(Date.now() / 1000)
    }
  }
}