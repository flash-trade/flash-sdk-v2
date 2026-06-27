import { AnchorProvider } from "@coral-xyz/anchor";
import {
  AddressLookupTableAccount,
  BlockhashWithExpiryBlockHeight,
  Commitment,
  ComputeBudgetProgram,
  MessageV0,
  Signer,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Base-layer (Solana) transaction sender. v0 + ALT supported here (unlike ER —
// see utils/erRpc.ts for the legacy-only ER path).
// ---------------------------------------------------------------------------

export interface SendTransactionOpts {
  postSendTxCallback?: (args: { txid: string }) => void;
  latestBlockhash?: BlockhashWithExpiryBlockHeight;
  preflightCommitment?: Commitment;
  prioritizationFee?: number;
  computeUnitLimit?: number;
  additionalSigners?: Signer[];
  alts?: AddressLookupTableAccount[];
  skipPreflight?: boolean;
}

export async function sendBaseTransaction(
  provider: AnchorProvider,
  ixs: TransactionInstruction[],
  opts: SendTransactionOpts = {},
): Promise<string> {
  const connection = provider.connection;
  const payer = provider.wallet.publicKey;

  const budgetIxs: TransactionInstruction[] = [];
  if (opts.computeUnitLimit) {
    budgetIxs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: opts.computeUnitLimit }));
  }
  if (opts.prioritizationFee) {
    budgetIxs.push(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.prioritizationFee }),
    );
  }

  const latestBlockhash =
    opts.latestBlockhash ??
    (await connection.getLatestBlockhash(opts.preflightCommitment ?? "confirmed"));

  const message = MessageV0.compile({
    payerKey: payer,
    instructions: [...budgetIxs, ...ixs],
    recentBlockhash: latestBlockhash.blockhash,
    addressLookupTableAccounts: opts.alts,
  });

  let vtx = new VersionedTransaction(message);
  if (opts.additionalSigners?.length) vtx.sign(opts.additionalSigners);
  vtx = await provider.wallet.signTransaction(vtx);

  const signature = await connection.sendTransaction(vtx, {
    skipPreflight: opts.skipPreflight ?? true,
    preflightCommitment: opts.preflightCommitment ?? "confirmed",
  });
  opts.postSendTxCallback?.({ txid: signature });
  return signature;
}

export async function confirmBaseTransaction(
  provider: AnchorProvider,
  signature: string,
  latestBlockhash?: BlockhashWithExpiryBlockHeight,
  commitment: Commitment = "confirmed",
): Promise<string> {
  const bh = latestBlockhash ?? (await provider.connection.getLatestBlockhash(commitment));
  const res = await provider.connection.confirmTransaction(
    {
      signature,
      blockhash: bh.blockhash,
      lastValidBlockHeight: bh.lastValidBlockHeight,
    },
    commitment,
  );
  if (res.value.err) {
    throw new Error(`Base tx failed: ${JSON.stringify(res.value.err)} (sig ${signature})`);
  }
  return signature;
}
