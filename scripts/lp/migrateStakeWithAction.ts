import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
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
import { findMigrateStakeReceiptAddress } from "../../src";
import { finalizeReceipt, receiptState } from "./_finalize";

// Migrate staked LP (FLP) → compounding sFLP — the migrate_stake ER flow.
// The reverse of migrateFLPwithAction: unstakes `amount` of the user's staked
// FLP and converts it to auto-compounding sFLP.
//
// The base tx delegates flp_stake + the (pool-scoped) migrate receipt. The `_er`
// commit redeems the staked LP and credits sFLP, gated by a lp_price slippage
// check. It queues migrate_stake_settle, whose amount-gated ops close both
// success and failure receipts. `finalizeReceipt` waits for that action and, if
// it didn't run, drives settle directly — so the receipt always ends closed.
//
//   1. base tx (queueErAction:false): create sFLP ATA + delegate flp_stake + receipt
//   2. poll the receipt onto the ER
//   3. ER `migrate_stake_er` commit, signed by a throwaway payer
//   4. finalize: settle closes the receipt (auto, else driven here)
//
// ts-node scripts/lp/migrateStakeWithAction.ts                  (dry-run)
// SEND=1 MIGRATE_AMOUNT=1000000 ts-node scripts/lp/migrateStakeWithAction.ts
// RESUME a stuck receipt: SEND=1 MIGRATE_AMOUNT=0 ts-node scripts/lp/migrateStakeWithAction.ts
// ── CONFIG ──
const rewardSymbol = process.env.REWARD_SYMBOL || undefined; // default USDC
const migrateAmount = amount("MIGRATE_AMOUNT", "1000000"); // staked LP to migrate

main((ctx) => {
  const owner = ctx.wallet.publicKey;
  const compoundingTokenAccount = getAssociatedTokenAddressSync(
    ctx.poolConfig.compoundingTokenMint,
    owner,
  );
  const [receipt] = findMigrateStakeReceiptAddress(
    owner,
    ctx.poolConfig.poolAddress,
    ctx.client.programId,
  );
  const isResume = migrateAmount.isZero();

  const finalizeCfg = {
    receipt,
    accountNamespace: "migrateStakeReceipt",
    decisionField: "compoundingAmountOut", // >0 → mint sFLP, ==0 → reward-only close
    settle: () => ctx.client.migrateStakeSettle(ctx.poolConfig, { owner }),
  };

  // sFLP is the destination of the minted compounding tokens on settle.
  return withBalances(
    ctx,
    [{ label: "sFLP", mint: ctx.poolConfig.compoundingTokenMint }],
    async () => {
      const out: Record<string, unknown> = { receipt: receipt.toBase58(), resume: isResume };

      if (isResume) {
        phase("RESUME — inspect receipt state to choose the path");
        const state = await receiptState(ctx, receipt, "migrateStakeReceipt");
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
        ok("receipt delegated on ER — driving _er");
      } else {
        phase("base migrate: create sFLP ATA + delegate flp_stake + receipt");
        note(`stakedLp=${migrateAmount.toString()} receipt=${receipt.toBase58()}`);
        const res = await ctx.client.migrateStakeWithAction(ctx.poolConfig, {
          compoundingTokenAccount,
          amount: migrateAmount,
          rewardSymbol,
          commitFrequencyMs: ENV.commitFrequencyMs,
          validator: validatorKey(),
          queueErAction: false,
        });
        // Ensure the sFLP ATA exists before settle mints into it.
        const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
          owner,
          compoundingTokenAccount,
          owner,
          ctx.poolConfig.compoundingTokenMint,
        );
        const sent = logSent(
          await sendBase(ctx, { ...res, instructions: [createAtaIx, ...res.instructions] }),
        );
        out.phase1 = sent;
        if (!("signature" in sent)) return out; // dry-run: stop here
      }

      phase("poll: wait for the receipt to appear on the ER (≤30s)");
      await pollVisibleOnEr(ctx, receipt);
      ok("receipt visible on ER");

      const erPayer = Keypair.generate();
      phase("ER commit: migrate_stake_er (ephemeral payer)");
      note(`payer=${erPayer.publicKey.toBase58()}`);
      const erRes = await ctx.client.migrateStakeEr(ctx.poolConfig, {
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
