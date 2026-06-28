import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import {
  main,
  ENV,
  amount,
  custodyBySymbol,
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
import { findCompWithdrawReceiptAddress } from "../../src";
import { finalizeReceipt, receiptState } from "./_finalize";

// Remove compounding liquidity — burns auto-compounding (sFLP) tokens, receive `outSymbol`.
//
// Drives the full ER flow client-side (like flash-magic-ui/useLiquidityER):
//   1. base tx (queueErAction:false): create out ATA + stage redeem + delegate receipt
//   2. poll the receipt onto the ER
//   3. ER `remove_compounding_liquidity_er` commit, signed by a throwaway payer
//   4. finalize: settle closes the receipt; it re-mints sFLP when output is zero —
//      driven directly if the ER-queued action didn't run.
//
// ts-node scripts/lp/removeCompoundingLiquidity.ts                  (dry-run)
// SEND=1 OUT_SYMBOL=USDC COMPOUNDING_AMOUNT_IN=1000000 ts-node scripts/lp/removeCompoundingLiquidity.ts
// RESUME a stuck receipt: SEND=1 COMPOUNDING_AMOUNT_IN=0 OUT_SYMBOL=USDC ts-node scripts/lp/removeCompoundingLiquidity.ts
// ── CONFIG ──
const outSymbol = process.env.OUT_SYMBOL || ENV.collateralSymbol;
const rewardSymbol = process.env.REWARD_SYMBOL || undefined; // default USDC
const compoundingAmountIn = amount("COMPOUNDING_AMOUNT_IN", "1000000");
const minAmountOut = new BN(process.env.MIN_AMOUNT_OUT || "0");

main((ctx) => {
  const outCustody = custodyBySymbol(ctx.poolConfig, outSymbol);
  const owner = ctx.wallet.publicKey;
  const receivingAccount = getAssociatedTokenAddressSync(outCustody.mintKey, owner);
  const compoundingTokenAccount = getAssociatedTokenAddressSync(
    ctx.poolConfig.compoundingTokenMint,
    owner,
  );
  const [receipt] = findCompWithdrawReceiptAddress(
    owner,
    outCustody.mintKey,
    ctx.client.programId,
  );
  const isResume = compoundingAmountIn.isZero();

  const finalizeCfg = {
    receipt,
    accountNamespace: "compoundingWithdrawReceipt",
    decisionField: "outTokenAmount", // >0 → pay out, ==0 → re-mint sFLP
    settle: () => ctx.client.removeCompoundingLiquiditySettle(ctx.poolConfig, { symbol: outSymbol }),
  };

  return withBalances(
    ctx,
    [
      { label: `${outSymbol} (out)`, mint: outCustody.mintKey, token2022: ctx.poolConfig.getTokenFromSymbol(outSymbol).isToken2022 },
      { label: "sFLP", mint: ctx.poolConfig.compoundingTokenMint },
    ],
    async () => {
      const out: Record<string, unknown> = { receipt: receipt.toBase58(), resume: isResume };

      if (isResume) {
        phase("RESUME — inspect receipt state to choose the path");
        const state = await receiptState(ctx, receipt, "compoundingWithdrawReceipt");
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
        phase("base withdraw: create out ATA + stage redeem + delegate receipt");
        note(`out=${outSymbol} compoundingIn=${compoundingAmountIn.toString()} receipt=${receipt.toBase58()}`);
        const res = await ctx.client.removeCompoundingLiquidityWithAction(ctx.poolConfig, {
          outSymbol,
          receivingAccount,
          compoundingTokenAccount,
          compoundingAmountIn,
          minAmountOut,
          rewardSymbol,
          commitFrequencyMs: ENV.commitFrequencyMs,
          validator: validatorKey(),
          queueErAction: false,
        });
        // Ensure the out-token ATA exists before settle returns tokens to it.
        const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
          owner,
          receivingAccount,
          owner,
          outCustody.mintKey,
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
      phase("ER commit: remove_compounding_liquidity_er (ephemeral payer)");
      note(`payer=${erPayer.publicKey.toBase58()}`);
      const erRes = await ctx.client.removeCompoundingLiquidityEr(ctx.poolConfig, {
        outSymbol,
        receivingAccount,
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
