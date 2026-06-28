import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import {
  main,
  ENV,
  amount,
  sendBase,
  sendEr,
  pollVisibleOnEr,
  validatorKey,
  phase,
  note,
  ok,
  logSent,
  withBalances,
} from "../_lib";
import { findMigrateFlpReceiptAddress } from "../../src";
import { finalizeReceipt, receiptState } from "./_finalize";

// Migrate compounding sFLP → staked LP (FLP) — the migrate_flp ER flow.
//
// The base tx burns the user's sFLP UPFRONT (the burn needs the owner's
// signature, so it can't be deferred), lazily inits + delegates flp_stake, and
// delegates the migrate receipt. The `_er` commit then redeems the burnt sFLP
// for LP and stakes it, gated by a lp_price slippage check. It queues
// migrate_flp_settle, which either moves LP to the staked vault or re-mints the
// burnt sFLP on failure. `finalizeReceipt` waits for that queued action and, if
// it didn't run, drives settle directly (see _finalize.ts) — so the script always
// ends with the receipt closed, never stuck processed-but-open.
//
//   1. base tx (queueErAction:false): burn sFLP + delegate flp_stake + receipt
//   2. poll the receipt onto the ER
//   3. ER `migrate_flp_er` commit, signed by a throwaway payer
//   4. finalize: settle closes the receipt (auto, else driven here)
//
// The migrate receipt is POOL-scoped (one in-flight migration per owner+pool).
//
// ts-node scripts/lp/migrateFLPwithAction.ts                  (dry-run)
// SEND=1 COMPOUNDING_AMOUNT=1000000 ts-node scripts/lp/migrateFLPwithAction.ts
// RESUME a stuck receipt: SEND=1 COMPOUNDING_AMOUNT=0 ts-node scripts/lp/migrateFLPwithAction.ts
// ── CONFIG ──
const rewardSymbol = process.env.REWARD_SYMBOL || undefined; // default USDC
const compoundingTokenAmount = amount("COMPOUNDING_AMOUNT", "1000000");

main((ctx) => {
  const owner = ctx.wallet.publicKey;
  const compoundingTokenAccount = getAssociatedTokenAddressSync(
    ctx.poolConfig.compoundingTokenMint,
    owner,
  );
  const [receipt] = findMigrateFlpReceiptAddress(
    owner,
    ctx.poolConfig.poolAddress,
    ctx.client.programId,
  );
  const isResume = compoundingTokenAmount.isZero();

  const finalizeCfg = {
    receipt,
    accountNamespace: "migrateFlpReceipt",
    decisionField: "lpAmountOut", // >0 → stake LP, ==0 → re-mint sFLP
    settle: () => ctx.client.migrateFlpSettle(ctx.poolConfig, { owner }),
  };

  // sFLP is both the burn source (entry) and the failure re-mint destination.
  return withBalances(
    ctx,
    [{ label: "sFLP", mint: ctx.poolConfig.compoundingTokenMint }],
    async () => {
      const out: Record<string, unknown> = { receipt: receipt.toBase58(), resume: isResume };

      if (isResume) {
        phase("RESUME — inspect receipt state to choose the path");
        const state = await receiptState(ctx, receipt, "migrateFlpReceipt");
        note(`receipt=${receipt.toBase58()} state=${state}`);
        if (state === "absent") {
          ok("receipt not found — already closed, nothing to resume");
          out.alreadyClosed = true;
          return out;
        }
        if (state === "processed") {
          out.finalize = await finalizeReceipt(ctx, finalizeCfg);
          return out;
        }
        // "delegated" → _er hasn't run; fall through to drive it.
        ok("receipt delegated on ER — driving _er");
      } else {
        phase("base migrate: burn sFLP + delegate flp_stake + receipt");
        note(`sFLP=${compoundingTokenAmount.toString()} receipt=${receipt.toBase58()}`);
        const res = await ctx.client.migrateFlpWithAction(ctx.poolConfig, {
          compoundingTokenAccount,
          compoundingTokenAmount,
          rewardSymbol,
          commitFrequencyMs: ENV.commitFrequencyMs,
          validator: validatorKey(),
          queueErAction: false,
        });
        const sent = logSent(await sendBase(ctx, res));
        out.phase1 = sent;
        if (!("signature" in sent)) return out; // dry-run: stop here
      }

      phase("poll: wait for the receipt to appear on the ER (≤30s)");
      await pollVisibleOnEr(ctx, receipt);
      ok("receipt visible on ER");

      const erPayer = Keypair.generate();
      phase("ER commit: migrate_flp_er (ephemeral payer)");
      note(`payer=${erPayer.publicKey.toBase58()}`);
      const erRes = await ctx.client.migrateFlpEr(ctx.poolConfig, {
        compoundingTokenAccount,
        payer: erPayer.publicKey,
        rewardSymbol,
      });
      out.phase3 = logSent(await sendEr(ctx, erRes, [erPayer]));
      if (!("signature" in (out.phase3 as any))) return out; // dry-run

      out.finalize = await finalizeReceipt(ctx, finalizeCfg);
      return out;
    },
  );
});
