import { getAssociatedTokenAddressSync } from "@solana/spl-token";
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
  phase,
  note,
  ok,
  logSent,
  withBalances,
} from "../_lib";
import { findStakingWithdrawReceiptAddress } from "@flash_trade/flash-sdk-v2";
import { finalizeReceipt, receiptState } from "./_finalize";

// Unstake + remove liquidity (burn FLP, receive `outSymbol`).
//
// Drives the full ER flow client-side (like the compounding scripts) — does NOT
// rely on a keeper. flp_stake is already delegated (passed plain); only the
// staking_withdraw receipt is delegated here.
//   1. base tx (queueErAction:false): stage redeem + delegate withdraw receipt
//   2. poll the receipt onto the ER
//   3. ER `remove_liquidity_er` commit, signed by a throwaway payer
//   4. finalize: settle closes the receipt; out==0 is the no-op branch — driven
//      directly if the ER-queued action didn't run (e.g. the dust 0-out edge).
//
// ts-node scripts/lp/removeLiquidity.ts                  (dry-run)
// SEND=1 OUT_SYMBOL=USDC UNSTAKE_AMOUNT=1000000 ts-node scripts/lp/removeLiquidity.ts
// RESUME a stuck receipt: SEND=1 UNSTAKE_AMOUNT=0 OUT_SYMBOL=USDC ts-node scripts/lp/removeLiquidity.ts
// ── CONFIG ──
const outSymbol = process.env.OUT_SYMBOL || ENV.collateralSymbol;
const rewardSymbol = process.env.REWARD_SYMBOL || undefined; // default USDC
const unstakeAmount = amount("UNSTAKE_AMOUNT", "1000000");
const minAmountOut = new BN(process.env.MIN_AMOUNT_OUT || "0");

main((ctx) => {
  const outCustody = custodyBySymbol(ctx.poolConfig, outSymbol);
  const owner = ctx.wallet.publicKey;
  const receivingAccount = getAssociatedTokenAddressSync(outCustody.mintKey, owner);
  const [receipt] = findStakingWithdrawReceiptAddress(
    owner,
    outCustody.mintKey,
    ctx.client.programId,
  );
  const isResume = unstakeAmount.isZero();

  const finalizeCfg = {
    receipt,
    accountNamespace: "stakingWithdrawReceipt",
    decisionField: "tokenAmountToWithdraw", // >0 → pay out, ==0 → no-op close
    settle: () =>
      ctx.client.removeLiquiditySettle(ctx.poolConfig, { outSymbol, receivingAccount }),
  };

  return withBalances(
    ctx,
    [{ label: `${outSymbol} (out)`, mint: outCustody.mintKey, token2022: ctx.poolConfig.getTokenFromSymbol(outSymbol).isToken2022 }],
    async () => {
      const out: Record<string, unknown> = { receipt: receipt.toBase58(), resume: isResume };

      if (isResume) {
        phase("RESUME — inspect receipt state to choose the path");
        const state = await receiptState(ctx, receipt, "stakingWithdrawReceipt");
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
        phase("base withdraw: stage redeem + delegate withdraw receipt");
        note(`out=${outSymbol} unstake=${unstakeAmount.toString()} receipt=${receipt.toBase58()}`);
        const res = await ctx.client.removeLiquidityWithAction(ctx.poolConfig, {
          outSymbol,
          receivingAccount,
          unstakeAmount,
          minAmountOut,
          rewardSymbol,
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
      phase("ER commit: remove_liquidity_er (ephemeral payer)");
      note(`payer=${erPayer.publicKey.toBase58()}`);
      const erRes = await ctx.client.removeLiquidityEr(ctx.poolConfig, {
        outSymbol,
        receivingAccount,
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
