import { PublicKey, Keypair } from "@solana/web3.js";
import {
  main,
  ENV,
  amount,
  sendBase,
  sendEr,
  validatorKey,
  logSent,
  format,
} from "../_lib";
import type { Ctx } from "../_lib";
import {
  DELEGATION_PROGRAM_ID,
  findTokenStakeAddress,
  findTokenStakeDepositReceiptAddress,
  findWithdrawTokenReceiptAddress,
  findCollectTokenRewardReceiptAddress,
  findCollectRevenueReceiptAddress,
  findCollectRebateReceiptAddress,
} from "../../src";
import {
  TOKEN22,
  ownerFafAta,
  ownerAta,
  readTokenAccountMint,
  readLockStatuses,
  pickWithdrawRequestId,
  driveAutoErFlow,
} from "./_token";

// ===========================================================================
// Full FAF token-stake lifecycle, chained in serial (the token-side analogue of
// master.ts). Reads → stake → collect (FAF reward / revenue / rebate) → unstake
// → withdraw. Each step is recorded PASS/FAIL/SKIP and a summary prints at the
// end; the chain continues on failure unless STOP_ON_FAIL=1.
//
//   npx ts-node scripts/token/masterToken.ts            # DRY-RUN: reads + builds, no writes
//   SEND=1 npx ts-node scripts/token/masterToken.ts     # full e2e on devnet
//
// Knobs: STAKE_AMOUNT, UNSTAKE_AMOUNT, WITHDRAW_REQUEST_ID, TOKEN22=1,
// COMMIT_FREQUENCY, VALIDATOR_KEY, STOP_ON_FAIL, SKIP_STAKE=1 (use an existing
// stake), SKIP_UNSTAKE=1, SKIP_WITHDRAW=1.
//
// Notes baked into the flow: deposit is skipped if the token_stake is already
// delegated (you can only delegate it once); a freshly-created unstake request
// does NOT mature until the vault unlock_period elapses, so the withdraw in the
// same run typically settles 0 (the no-op revert path) unless a prior matured
// request exists — that still exercises the full delegate → _er → settle path.
// ===========================================================================

const stakeAmount = amount("STAKE_AMOUNT", "1000000");
const unstakeAmount = amount("UNSTAKE_AMOUNT", "500000");

// --- mini PASS/FAIL/SKIP harness (mirrors master.ts) -----------------------
type Status = "PASS" | "FAIL" | "SKIP";
const results: { name: string; status: Status; ms: number; detail?: string }[] = [];
const SKIP = (reason: string) => ({ __skip: reason });
const banner = (s: string, why: string) =>
  console.log(`\n${"═".repeat(72)}\n▌ ${s}\n│ ${why}\n${"═".repeat(72)}`);

async function step(
  name: string,
  fn: () => Promise<unknown>,
  opts: { optional?: boolean } = {},
): Promise<unknown> {
  console.log(`\n▶ ${name}`);
  const t0 = Date.now();
  try {
    const r = await fn();
    if (r && typeof r === "object" && "__skip" in (r as any)) {
      const reason = (r as any).__skip as string;
      results.push({ name, status: "SKIP", ms: 0, detail: reason });
      console.log(`  ⊘ SKIP — ${reason}`);
      return undefined;
    }
    results.push({ name, status: "PASS", ms: Date.now() - t0 });
    console.log(`  ✓ PASS (${Date.now() - t0}ms)`);
    return r;
  } catch (e: any) {
    const detail = String(e?.message ?? e).slice(0, 160);
    results.push({ name, status: "FAIL", ms: Date.now() - t0, detail });
    console.log(`  ✗ FAIL — ${detail}`);
    if (e?.signature) console.log(`    sig: ${e.signature}`);
    if (!opts.optional && process.env.STOP_ON_FAIL === "1") throw e;
    return undefined;
  }
}

async function view(name: string, fn: () => Promise<unknown>) {
  await step(
    name,
    async () => {
      const r = await fn();
      const s = JSON.stringify(format(r));
      console.log(`  → ${s.length > 240 ? s.slice(0, 240) + "…" : s}`);
      return r;
    },
    { optional: true },
  );
}

/** True if a base account is delegated (owned by the delegation program). */
async function isDelegated(ctx: Ctx, pk: PublicKey): Promise<boolean> {
  const info = await ctx.client.provider.connection.getAccountInfo(pk).catch(() => null);
  return !!info && info.owner.equals(DELEGATION_PROGRAM_ID);
}
const exists = async (ctx: Ctx, pk: PublicKey) =>
  !!(await ctx.client.provider.connection.getAccountInfo(pk).catch(() => null));

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;
  const pid = ctx.client.programId;
  const tokenStake = findTokenStakeAddress(owner, pid)[0];

  banner(
    "0 · reads",
    "snapshot the FAF vault + this wallet's token_stake before any mutation",
  );
  await view("fetchTokenVault", () => ctx.client.accounts.fetchTokenVault());
  await view("read lock table", () => readLockStatuses(ctx, owner));

  // ── 1 · STAKE ───────────────────────────────────────────────────────────
  banner("1 · stake", "deposit FAF + delegate the token_stake (auto _er → settle)");
  await step(
    "depositTokenStake",
    async () => {
      if (process.env.SKIP_STAKE === "1") return SKIP("SKIP_STAKE=1");
      if (await isDelegated(ctx, tokenStake))
        return SKIP("token_stake already delegated — staking against existing stake");
      const { ata, createIx, mint } = ownerFafAta(ctx);
      const [receipt] = findTokenStakeDepositReceiptAddress(owner, pid);
      return driveAutoErFlow(ctx, {
        label: "deposit_token_stake",
        receipt,
        prependIxs: [createIx],
        buildBase: () =>
          ctx.client.depositTokenStakeWithAction({
            tokenMint: mint,
            fundingAccount: ata,
            depositAmount: stakeAmount,
            commitFrequencyMs: ENV.commitFrequencyMs,
            validator: validatorKey(),
            token22: TOKEN22,
          }),
        buildEr: (payer) =>
          ctx.client.depositTokenStakeEr({
            tokenMint: mint,
            payer,
            receivingAccount: ata,
            token22: TOKEN22,
          }),
      });
    },
    { optional: true },
  );

  // ── 2 · COLLECT (FAF reward / revenue / rebate) ──────────────────────────
  banner("2 · collect", "claim FAF staking reward, protocol revenue, trading rebate");

  await step("collectFAF (collect_token_reward)", async () => {
    const { ata, createIx, mint } = ownerFafAta(ctx);
    const [receipt] = findCollectTokenRewardReceiptAddress(owner, pid);
    return driveAutoErFlow(ctx, {
      label: "collect_token_reward",
      receipt,
      prependIxs: [createIx],
      buildBase: () =>
        ctx.client.collectTokenRewardWithAction({
          tokenMint: mint,
          receivingTokenAccount: ata,
          commitFrequencyMs: ENV.commitFrequencyMs,
          validator: validatorKey(),
          token22: TOKEN22,
        }),
      buildEr: (payer) =>
        ctx.client.collectTokenRewardEr({
          tokenMint: mint,
          receivingTokenAccount: ata,
          payer,
          token22: TOKEN22,
        }),
    });
  }, { optional: true });

  await step("collectRevenue (collect_revenue)", async () => {
    const { mint, token22 } = await readTokenAccountMint(ctx, ctx.poolConfig.revenueTokenAccount);
    const { ata, createIx } = ownerAta(ctx, mint, token22);
    const [receipt] = findCollectRevenueReceiptAddress(owner, pid);
    return driveAutoErFlow(ctx, {
      label: "collect_revenue",
      receipt,
      prependIxs: [createIx],
      buildBase: () =>
        ctx.client.collectRevenueWithAction({
          revenueTokenMint: mint,
          receivingRevenueAccount: ata,
          commitFrequencyMs: ENV.commitFrequencyMs,
          validator: validatorKey(),
          token22,
        }),
      buildEr: (payer) =>
        ctx.client.collectRevenueEr({
          revenueTokenMint: mint,
          receivingRevenueAccount: ata,
          payer,
          token22,
        }),
    });
  }, { optional: true });

  await step("collectRewards (collect_rebate)", async () => {
    const { mint, token22 } = await readTokenAccountMint(ctx, ctx.poolConfig.rebateTokenAccount);
    const { ata, createIx } = ownerAta(ctx, mint, token22);
    const [receipt] = findCollectRebateReceiptAddress(owner, pid);
    return driveAutoErFlow(ctx, {
      label: "collect_rebate",
      receipt,
      prependIxs: [createIx],
      buildBase: () =>
        ctx.client.collectRebateWithAction({
          rebateTokenMint: mint,
          receivingTokenAccount: ata,
          commitFrequencyMs: ENV.commitFrequencyMs,
          validator: validatorKey(),
          token22,
        }),
      buildEr: (payer) =>
        ctx.client.collectRebateEr({
          rebateTokenMint: mint,
          receivingTokenAccount: ata,
          payer,
          token22,
        }),
    });
  }, { optional: true });

  // ── 3 · UNSTAKE ──────────────────────────────────────────────────────────
  banner("3 · unstake", "begin an unlock (direct-ER) — matures after unlock_period");
  await step(
    "unstakeTokenRequest",
    async () => {
      if (process.env.SKIP_UNSTAKE === "1") return SKIP("SKIP_UNSTAKE=1");
      if (!(await isDelegated(ctx, tokenStake)))
        return SKIP("token_stake not delegated on ER — stake first");
      const ix = await ctx.client.unstakeTokenRequestEr(unstakeAmount, owner);
      const sent = logSent(await sendEr(ctx, { instructions: [ix] }, [ctx.wallet]));
      if (!("signature" in sent)) return SKIP("dry-run");
      return { unstakeAmount: unstakeAmount.toString(), sent };
    },
    { optional: true },
  );

  await view("read lock table (post-unstake)", () => readLockStatuses(ctx, owner));

  // ── 4 · WITHDRAW ─────────────────────────────────────────────────────────
  banner("4 · withdraw", "settle a matured unstake → FAF back to the wallet (auto _er → settle)");
  await step(
    "withdrawTokenWithAction",
    async () => {
      if (process.env.SKIP_WITHDRAW === "1") return SKIP("SKIP_WITHDRAW=1");
      const { ata, createIx, mint } = ownerFafAta(ctx);
      const [receipt] = findWithdrawTokenReceiptAddress(owner, pid);
      const statuses = await readLockStatuses(ctx, owner);
      const withdrawRequestId = pickWithdrawRequestId(statuses);
      return driveAutoErFlow(ctx, {
        label: "withdraw_token",
        receipt,
        prependIxs: [createIx],
        buildBase: () =>
          ctx.client.withdrawTokenWithAction({
            tokenMint: mint,
            receivingTokenAccount: ata,
            withdrawRequestId,
            commitFrequencyMs: ENV.commitFrequencyMs,
            validator: validatorKey(),
            token22: TOKEN22,
          }),
        buildEr: (payer) =>
          ctx.client.withdrawTokenEr({
            tokenMint: mint,
            receivingTokenAccount: ata,
            payer,
            token22: TOKEN22,
          }),
      });
    },
    { optional: true },
  );

  await view("read lock table (final)", () => readLockStatuses(ctx, owner));

  // ── summary ──────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(72)}\n▌ summary\n${"═".repeat(72)}`);
  for (const r of results) {
    const mark = r.status === "PASS" ? "✓" : r.status === "SKIP" ? "⊘" : "✗";
    console.log(
      `  ${mark} ${r.status.padEnd(4)} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`,
    );
  }
  const n = (s: Status) => results.filter((r) => r.status === s).length;
  console.log(
    `\n  ${n("PASS")} passed · ${n("SKIP")} skipped · ${n("FAIL")} failed` +
      `${process.env.SEND === "1" ? "" : "  (DRY-RUN — set SEND=1 to execute)"}`,
  );
  return undefined;
});
