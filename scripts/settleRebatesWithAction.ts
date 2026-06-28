import { Keypair, PublicKey } from "@solana/web3.js";
import {
  main, sendBase, sendEr, logSent, phase, note, ENV, validatorKey,
  pollVisibleOnEr, pollClosedOnBase,
} from "./_lib";
import {
  findPoolAddress, findSettleRebatesReceiptAddress,
  buildSettleRebatesWithAction, buildSettleRebatesEr,
} from "../src";

// -----------------------------------------------------------------------------
// settle_rebates_with_action — the ER-bridged keeper flow that sweeps the pool's
// referral rebate from its reward_custody into the rebate vault, on the DELEGATED
// Pool.0 (FTV2 / MagicBlock ER). The base `settle_rebates` can't run while the
// pool + reward custody are delegated, so it's split into the with_action / er /
// settle triplet, driven here via the flash-sdk builders.
//
// Flow (keeper = admin wallet signs base; throwaway payer signs the ER tx):
//   settle_rebates_with_action (base) → delegates the settle_rebates receipt
//        ↓  pollVisibleOnEr(receipt)
//   settle_rebates_er          (ER)   → commit
//        ↓  pollClosedOnBase(receipt) → base-layer settle closes the receipt
//
// The receipt PDA is ["settle_rebates_receipt", keeper, pool]. reward_custody
// (+ its mint / oracle / token account / token-2022 flag) is read from the pool
// on the ER, so this works whatever custody the pool designates as reward.
//
// DRY-RUN by default; SEND=1 submits. Keeper op (not multisig-gated).
//   run:  SEND=1 npx ts-node scripts/settleRebatesWithAction.ts
// -----------------------------------------------------------------------------

const RPC_URL =
  "https://flashtr-flash-885f.devnet.rpcpool.com/e0f3d11e-6673-4e02-b3f8-361d596ee7fe";
const ER_ENDPOINT = "https://devnet-as.magicblock.app";
const WALLET_PATH = "/Users/rehanmohammed/Documents/Github/Beta-Hcik.json";

ENV.cluster = (process.env.CLUSTER as typeof ENV.cluster) || "devnet";
ENV.poolName = process.env.POOL || "Pool.0";
ENV.rpcUrl = process.env.RPC_URL || RPC_URL;
ENV.erEndpoint = process.env.ER_ENDPOINT || ER_ENDPOINT;
ENV.walletPath =
  process.env.WALLET || process.env.KEYPAIR_PATH || process.env.KEYPAIR_PATH_FTDEVNET || WALLET_PATH;

main(async (ctx) => {
  const program = ctx.client.program;
  const erProgram = ctx.client.erProgram;
  if (!erProgram) throw new Error("ER not initialized — set ER_ENDPOINT (the pool is delegated)");
  const keeper = ctx.wallet.publicKey;
  const VK = validatorKey();
  const CF = ENV.commitFrequencyMs;
  const [pool] = findPoolAddress(ENV.poolName, program.programId);

  // --- resolve the pool's reward custody (mint / oracle / token acct / t22) ---
  phase("resolve reward custody from pool (ER)");
  const poolAcct: any = await (erProgram.account as any).pool.fetch(pool);
  const rewardCustody: PublicKey = poolAcct.rewardCustody;
  const custAcct: any = await (erProgram.account as any).custody.fetch(rewardCustody);
  const custody = {
    pool,
    rewardCustody,
    rewardCustodyOracleAccount: custAcct.oracle.extOracleAccount as PublicKey,
    rewardCustodyTokenAccount: custAcct.tokenAccount as PublicKey,
    tokenMint: custAcct.mint as PublicKey,
    token22: custAcct.token22 as boolean,
  };
  const [receipt] = findSettleRebatesReceiptAddress(keeper, pool, program.programId);
  note(`rewardCustody=${rewardCustody.toBase58()} mint=${custody.tokenMint.toBase58()} token22=${custody.token22}`);

  // Build both ixs up front (no chain access) so a DRY-RUN proves both resolve.
  const payer = Keypair.generate();
  const waRes = await buildSettleRebatesWithAction(program, {
    ...custody, keeper, commitFrequencyMs: CF, validator: VK,
  });
  const erRes = await buildSettleRebatesEr(program, {
    ...custody, keeper, payer: payer.publicKey, validator: VK,
  });
  note("built settle_rebates_with_action + settle_rebates_er via SDK builders");

  // ---- 1. settle_rebates_with_action (base) — delegate the receipt ----------
  phase(`settle_rebates_with_action (base) commitFrequencyMs=${CF} validator=${VK.toBase58()}`);
  const sent = logSent(await sendBase(ctx, waRes));
  if (!("signature" in sent)) return { dryRun: true, receipt: receipt.toBase58() };

  // ---- 2. wait for the receipt on the ER ------------------------------------
  phase("pollVisibleOnEr(receipt)");
  await pollVisibleOnEr(ctx, receipt);

  // ---- 3. settle_rebates_er (ER) — commit, signed by the throwaway payer ------
  phase("settle_rebates_er (ER)");
  logSent(await sendEr(ctx, erRes, [payer]));

  // ---- 4. wait for the base-layer settle to close the receipt ---------------
  phase("pollClosedOnBase(receipt)");
  await pollClosedOnBase(ctx, receipt);

  return { settled: true, receipt: receipt.toBase58(), rewardCustody: rewardCustody.toBase58() };
});
