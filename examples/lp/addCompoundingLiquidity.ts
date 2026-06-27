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
  phase,
  note,
  ok,
  logSent,
  withBalances,
} from "../_lib";
import { findCompDepositReceiptAddress } from "@flash_trade/flash-sdk-v2";
import { finalizeReceipt, receiptState } from "./_finalize";

// Add compounding liquidity — mints auto-compounding (sFLP) tokens.
//
// Drives the full ER flow client-side (like flash-magic-ui/useLiquidityER) — does
// NOT rely on a keeper:
//   1. base tx (queueErAction:false): create sFLP ATA + stage tokens + delegate receipt
//   2. poll the receipt onto the ER
//   3. ER `add_compounding_liquidity_er` commit, signed by a throwaway payer
//   4. finalize: settle closes the receipt; it refunds when output is zero —
//      driven directly if the ER-queued action didn't run.
//
// ts-node scripts/lp/addCompoundingLiquidity.ts                  (dry-run)
// SEND=1 IN_SYMBOL=USDC AMOUNT_IN=1000000 ts-node scripts/lp/addCompoundingLiquidity.ts
// RESUME a stuck receipt: SEND=1 AMOUNT_IN=0 IN_SYMBOL=USDC ts-node scripts/lp/addCompoundingLiquidity.ts
// ── CONFIG ──
const inSymbol = process.env.IN_SYMBOL || ENV.collateralSymbol;
const rewardSymbol = process.env.REWARD_SYMBOL || undefined; // default USDC
const amountIn = amount("AMOUNT_IN", "1000000");
const minCompoundingAmountOut = new BN(process.env.MIN_COMPOUNDING_AMOUNT_OUT || "0");

main((ctx) => {
  const inCustody = custodyBySymbol(ctx.poolConfig, inSymbol);
  const owner = ctx.wallet.publicKey;
  const fundingAccount = getAssociatedTokenAddressSync(inCustody.mintKey, owner);
  const compoundingTokenAccount = getAssociatedTokenAddressSync(
    ctx.poolConfig.compoundingTokenMint,
    owner,
  );
  const [receipt] = findCompDepositReceiptAddress(
    owner,
    inCustody.mintKey,
    ctx.client.programId,
  );
  const isResume = amountIn.isZero();

  const finalizeCfg = {
    receipt,
    accountNamespace: "compoundingDepositReceipt",
    decisionField: "userLpToMint", // >0 → mint sFLP, ==0 → refund deposit
    altDecisionField: "compoundingToMint",
    settle: () => ctx.client.addCompoundingLiquiditySettle(ctx.poolConfig, { symbol: inSymbol }),
  };

  return withBalances(
    ctx,
    [
      { label: `${inSymbol} (in)`, mint: inCustody.mintKey, token2022: ctx.poolConfig.getTokenFromSymbol(inSymbol).isToken2022 },
      { label: "sFLP", mint: ctx.poolConfig.compoundingTokenMint },
    ],
    async () => {
      const out: Record<string, unknown> = { receipt: receipt.toBase58(), resume: isResume };

      if (isResume) {
        phase("RESUME — inspect receipt state to choose the path");
        const state = await receiptState(ctx, receipt, "compoundingDepositReceipt");
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
        phase("base deposit: create sFLP ATA + stage tokens + delegate receipt");
        note(`in=${inSymbol} amount=${amountIn.toString()} receipt=${receipt.toBase58()}`);
        const res = await ctx.client.addCompoundingLiquidityWithAction(ctx.poolConfig, {
          inSymbol,
          fundingAccount,
          compoundingTokenAccount,
          amountIn,
          minCompoundingAmountOut,
          rewardSymbol,
          queueErAction: false,
        });
        // Ensure the sFLP ATA exists before the deposit mints into it.
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
      phase("ER commit: add_compounding_liquidity_er (ephemeral payer)");
      note(`payer=${erPayer.publicKey.toBase58()}`);
      const erRes = await ctx.client.addCompoundingLiquidityEr(ctx.poolConfig, {
        inSymbol,
        fundingAccount,
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
