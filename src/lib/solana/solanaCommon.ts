import { Connection, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import delay from "delay";

export enum TimeoutStatus {
  NONE,
  ABORTED,
  BLOCKTIMEOUT,
  DURATIONTIMEOUT,
  CONFIRMATIONERROR,
  SUCCESS,
}

export type TransactionWithRetryAndAbortResult = {
  result: TimeoutStatus;
  error?: any;
}

export type TransactionInstructionError = number | { Custom: number };

export type TransactionInstructionErrorContainer = {
  InstructionError: TransactionInstructionError[]
}

export async function sendTransactionWithRetryAndAbort(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  timeout?: number,
  noRetry: boolean = false
): Promise<TransactionWithRetryAndAbortResult> {
  let ready = false;
  let error: any;
  if (typeof timeout === "undefined") {
    timeout = 120;
  }

  const serializedTransaction = transaction.serialize();

  try {
    const signature = await connection.sendRawTransaction(serializedTransaction, { skipPreflight: true, preflightCommitment: "confirmed" });
  
    // retry
    if (noRetry === false) {
      (async () => {
        let count = 0;
        while (!ready) {
          count++;
          await delay(Math.min(count * 500, 2000));
          if (!ready) {
            try {
              await connection.sendRawTransaction(serializedTransaction, { skipPreflight: true });
            } catch (error) {
              // console.error(error);
            }
          }
        }
      })();
    }
  
    const timeoutPromises: Promise<TimeoutStatus>[] = [];
  
    // blockHeight timeout
    if (!('version' in transaction) && typeof transaction.lastValidBlockHeight !== "undefined") {
      const lastValidBlockHeight = transaction.lastValidBlockHeight;
      const blockTimeout = new Promise<TimeoutStatus>(async (resolve) => {
        let currentBlockHeight: number = 0;
        do {
          if (ready) return;
          currentBlockHeight = await connection.getBlockHeight("confirmed");
          if (ready) return;
          await delay(2000);
          if (ready) return;
        } while (currentBlockHeight < lastValidBlockHeight);
        // block over limit
        ready = true;
        resolve(TimeoutStatus.BLOCKTIMEOUT);
      });
      timeoutPromises.push(blockTimeout);
    }
  
    // regular timeout
    if (typeof timeout === "number" && timeout > 0) {
      const durationTimeout = new Promise<TimeoutStatus>(async (resolve) => {
        if (typeof timeout !== "undefined") {
          setTimeout(() => {
            if (!ready) {
              ready = true;
              resolve(TimeoutStatus.DURATIONTIMEOUT);
            }
          }, timeout * 1000);
        }
      });
      timeoutPromises.push(durationTimeout);
    }
  
    const confirmationPollTimeout = new Promise<TimeoutStatus>(async (resolve) => {
      await delay(2000);
      do {
        if (!ready) {
          try {
            const status = await connection.getSignatureStatus(signature);
            if (status !== null && status.value !== null) {
              if (status.value.confirmationStatus === "confirmed" || status.value.confirmationStatus === "finalized") {
                ready = true;
                if (status.value.err && status.value.err !== null) {
                  error = status.value.err;
                  resolve(TimeoutStatus.CONFIRMATIONERROR);
                } else {
                  resolve(TimeoutStatus.SUCCESS);
                }
              }
            }
          } catch (error) {
            console.error(error);
          }
        }
        if (!ready) await delay(1000);
      } while (!ready);
    });
    timeoutPromises.push(confirmationPollTimeout);
  
    const result = await Promise.race(timeoutPromises);
  
    return {
      result,
      error
    }
  } catch (error) {
    return {
      result: TimeoutStatus.CONFIRMATIONERROR,
      error: "RPC Error"
    }
  }
}

export async function simulateTransaction(
  connection: Connection,
  transaction: VersionedTransaction,
): Promise<TransactionWithRetryAndAbortResult> {
  const simulateResult = await connection.simulateTransaction(transaction, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed"
  });

  if (simulateResult.value.err === null) {
    return {
      result: TimeoutStatus.SUCCESS
    }
  } else {
    return {
      result: TimeoutStatus.CONFIRMATIONERROR,
      error: simulateResult.value
    }
  }
}