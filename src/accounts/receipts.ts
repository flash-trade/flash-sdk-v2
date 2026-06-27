import { BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { Perpetuals } from "../idl/perpetuals";

// ---------------------------------------------------------------------------
// Receipt fetching + outcome polling.
//
// The ER user flows are program-driven: a single base-layer `*_with_action`
// tx delegates a receipt with the `_er` action queued; the validator then runs
// `_er` (ER) → `_settle` (base) automatically. `_settle` is the single finalizer
// for both outcomes (it pays out on success and refunds on failure — there is no
// separate `_revert` ix). There is no second SDK tx — the caller waits on the receipt:
//   processed === 0  → ER hasn't run yet
//   processed === 1  → ER ran; the slippage/output field tells the settle's
//                      success (payout) vs failure (refund) branch
//   account closed   → settle finished (terminal)
// ---------------------------------------------------------------------------

export type ReceiptOutcome =
  | { status: "settled"; outAmount: BN }
  | { status: "reverted" }
  | { status: "timeout" };

/** The field on each receipt that the ER zeroes to signal a revert. */
const OUT_FIELD: Record<string, string> = {
  swapReceipt: "amountOut",
  stakingDepositReceipt: "lpTokensToMint",
  stakingWithdrawReceipt: "tokenAmountToWithdraw",
  compoundingDepositReceipt: "compoundingToMint",
  compoundingWithdrawReceipt: "outTokenAmount",
  collectStakeRewardReceipt: "claimAmount",
  compoundFeesReceipt: "rewardLpToMint",
  migrateStakeReceipt: "compoundingAmountOut",
  migrateFlpReceipt: "lpAmountOut",
};

/**
 * Poll a receipt PDA until the validator-driven flow terminates.
 *
 * @param accountName camelCase anchor account name, e.g. "swapReceipt".
 */
export async function awaitReceiptOutcome(
  program: Program,
  accountName: keyof typeof OUT_FIELD,
  receipt: PublicKey,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ReceiptOutcome> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;
  const outField = OUT_FIELD[accountName];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountClient = (program.account as any)[accountName];
  let lastOut: BN | null = null;
  let sawProcessed = false;

  while (Date.now() < deadline) {
    const data = await accountClient.fetchNullable(receipt).catch(() => null);
    if (data) {
      if (data.processed === 1) {
        sawProcessed = true;
        lastOut = data[outField] as BN;
      }
    } else if (sawProcessed) {
      // closed after processing → terminal
      return lastOut && lastOut.gtn(0)
        ? { status: "settled", outAmount: lastOut }
        : { status: "reverted" };
    } else {
      // Closed before we ever observed processed=1. The single settle finalizer
      // closes both success and failure branches, so we cannot infer the outcome
      // here — a fast failure or transient RPC miss would otherwise be
      // misreported as "settled".
      // Return the uncertain terminal; callers needing certainty should decode
      // the *Er/*Settle event logs.
      return { status: "timeout" };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "timeout" };
}

/**
 * Wait until a PDA is closed on-chain. Used for the trade withdrawal /
 * custody-settlement flows whose escrow/receipt has no `processed` field —
 * the final validator-driven `execute_*_base_chain` step closes the account,
 * so closure (account == null) signals completion.
 */
export async function awaitClosed(
  connection: Connection,
  pda: PublicKey,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<"closed" | "timeout"> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;
  let seen = false;
  while (Date.now() < deadline) {
    const info = await connection.getAccountInfo(pda, "confirmed").catch(() => null);
    if (info) seen = true;
    else if (seen) return "closed"; // existed, now gone → executed
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "timeout";
}
