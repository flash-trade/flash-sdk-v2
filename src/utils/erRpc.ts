import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  VersionedTransactionResponse,
} from "@solana/web3.js";

import {
  buildUnboundedLegacyTx,
  Ed25519Signer,
  nodeEd25519Signer,
} from "./erWire";

// =========================================================================
// MagicBlock ER send + poll
// =========================================================================
//
// Single canonical send path for any tx that targets the MagicBlock ER. See
// erWire.ts for the wire-format quirks this works around. Uses legacy txs
// because v0 + ALT is not supported by the ER today.

/** Default CU budget for ER ops. addLiquidityEr / removeLiquidityEr / etc.
 *  iterate every custody oracle + run ScheduleCommit CPIs and routinely
 *  consume 800k+ CU on Pool.0 mainnet. 1.4M is the protocol max. */
export const DEFAULT_ER_COMPUTE_UNIT_LIMIT = 1_400_000;

export interface SendErOpts {
  /** Wraps the ix list with ComputeBudgetProgram.setComputeUnitLimit.
   *  Pass `null` to opt out (caller already prepended a CU budget ix);
   *  omit to use DEFAULT_ER_COMPUTE_UNIT_LIMIT. */
  computeUnitLimit?: number | null;
  postSendTxCallback?: (args: { txid: string }) => void;
  /** Called after `getLatestBlockhash` returns, with the blockhash used. */
  preSignCallback?: (args: { blockhash: string; bytes: number }) => void;
  /** Override the ed25519 signer (e.g. tweetnacl in browsers). Defaults to
   *  Node's crypto.sign. */
  ed25519Signer?: Ed25519Signer;
  /** Skip the post-send poll. Returns immediately after sendRawTransaction. */
  skipConfirm?: boolean;
  /** Default 30_000. */
  pollTimeoutMs?: number;
  /** Default 2_000. */
  pollIntervalMs?: number;
}

export interface SendErResult {
  signature: string;
  status: VersionedTransactionResponse | null;
}

/**
 * Build, sign, and submit a legacy tx to the MagicBlock ER, then poll for
 * confirmation (unless `skipConfirm`). Throws on RPC error, on-chain error,
 * or poll timeout.
 *
 * `signers[0]` is the fee payer. Additional signers are looked up by pubkey
 * against the message's required-signature slots.
 */
export async function sendErTransactionLegacy(
  conn: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  opts: SendErOpts = {}
): Promise<SendErResult> {
  if (signers.length === 0) {
    throw new Error("sendErTransactionLegacy: signers must not be empty");
  }

  const cuLimit =
    opts.computeUnitLimit === undefined
      ? DEFAULT_ER_COMPUTE_UNIT_LIMIT
      : opts.computeUnitLimit;
  const finalIxs =
    cuLimit === null
      ? ixs
      : [
          ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
          ...ixs,
        ];

  const tx = new Transaction();
  finalIxs.forEach((ix) => tx.add(ix));
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;

  const rawTx = buildUnboundedLegacyTx(
    tx,
    signers,
    opts.ed25519Signer ?? nodeEd25519Signer
  );

  opts.preSignCallback?.({ blockhash, bytes: rawTx.length });

  const signature = await conn.sendRawTransaction(rawTx, {
    skipPreflight: true,
    maxRetries: 0,
  });
  opts.postSendTxCallback?.({ txid: signature });

  if (opts.skipConfirm) return { signature, status: null };

  const status = await pollErTransaction(conn, signature, {
    timeoutMs: opts.pollTimeoutMs,
    intervalMs: opts.pollIntervalMs,
  });

  if (status?.meta?.err) {
    const err = new Error(
      `ER transaction failed: ${JSON.stringify(status.meta.err)}`
    ) as Error & {
      signature: string;
      logs?: string[];
      isEr: true;
    };
    err.signature = signature;
    err.logs = status.meta.logMessages ?? undefined;
    err.isEr = true;
    throw err;
  }
  if (!status) {
    throw new Error(
      `ER tx did not land within ${opts.pollTimeoutMs ?? 30_000}ms (sig ${signature}).`
    );
  }

  return { signature, status };
}

/**
 * Poll the ER for a transaction's status. ER commits aren't immediate;
 * first lookup typically returns null. Returns null on timeout.
 */
export async function pollErTransaction(
  conn: Connection,
  sig: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<VersionedTransactionResponse | null> {
  const totalMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    const status = await conn
      .getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })
      .catch(() => null);
    if (status) return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}
