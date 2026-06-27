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
import { findStakingDepositReceiptAddress } from "@flash_trade/flash-sdk-v2";
import { finalizeReceipt, receiptState } from "./_finalize";

// Add liquidity AND stake the minted FLP (the staked-LP path).
//
// Drives the full ER flow client-side (like the compounding scripts) — does NOT
// rely on a keeper:
//   1. base tx (queueErAction:false): stage tokens + delegate flp_stake + receipt
//   2. poll the receipt onto the ER
//   3. ER `add_liquidity_and_stake_er` commit, signed by a throwaway payer
//   4. finalize: settle closes the receipt; the handler refunds on lp_to_mint==0 —
//      driven directly if the ER-queued action didn't run.
//
// ts-node scripts/lp/addLiquidityAndStake.ts                  (dry-run)
// SEND=1 IN_SYMBOL=USDC AMOUNT_IN=1000000 ts-node scripts/lp/addLiquidityAndStake.ts
// RESUME a stuck receipt: SEND=1 AMOUNT_IN=0 IN_SYMBOL=USDC ts-node scripts/lp/addLiquidityAndStake.ts
// ── CONFIG ──
const inSymbol = process.env.IN_SYMBOL || ENV.collateralSymbol;
const amountIn = amount("AMOUNT_IN", "1000000");
const minLpAmountOut = new BN(process.env.MIN_LP_AMOUNT_OUT || "0");

main((ctx) => {
  const inCustody = custodyBySymbol(ctx.poolConfig, inSymbol);
  const owner = ctx.wallet.publicKey;
  const fundingAccount = getAssociatedTokenAddressSync(inCustody.mintKey, owner);
  const [receipt] = findStakingDepositReceiptAddress(
    owner,
    inCustody.mintKey,
    ctx.client.programId,
  );
  const isResume = amountIn.isZero();

  const finalizeCfg = {
    receipt,
    accountNamespace: "stakingDepositReceipt",
    decisionField: "lpTokensToMint", // >0 → mint+stake, ==0 → refund
    settle: () => ctx.client.addLiquidityAndStakeSettle(ctx.poolConfig, { symbol: inSymbol }),
  };

  return withBalances(
    ctx,
    [{ label: `${inSymbol} (in)`, mint: inCustody.mintKey, token2022: ctx.poolConfig.getTokenFromSymbol(inSymbol).isToken2022 }],
    async () => {
      const out: Record<string, unknown> = { receipt: receipt.toBase58(), resume: isResume };

      if (isResume) {
        phase("RESUME — inspect receipt state to choose the path");
        const state = await receiptState(ctx, receipt, "stakingDepositReceipt");
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
        phase("base deposit: stage tokens + delegate flp_stake + receipt");
        note(`in=${inSymbol} amount=${amountIn.toString()} receipt=${receipt.toBase58()}`);
        const res = await ctx.client.addLiquidityAndStakeWithAction(ctx.poolConfig, {
          inSymbol,
          fundingAccount,
          amountIn,
          minLpAmountOut,
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
      phase("ER commit: add_liquidity_and_stake_er (ephemeral payer)");
      note(`payer=${erPayer.publicKey.toBase58()}`);
      const erRes = await ctx.client.addLiquidityAndStakeEr(ctx.poolConfig, {
        inSymbol,
        fundingAccount,
        payer: erPayer.publicKey,
      });
      out.phase3 = logSent(await sendEr(ctx, erRes, [erPayer]));
      if (!("signature" in (out.phase3 as any))) return out; // dry-run

      out.finalize = await finalizeReceipt(ctx, finalizeCfg);
      return out;
    },
  );
});
