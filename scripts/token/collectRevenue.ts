import { main, ENV, note, validatorKey } from "../_lib";
import { findCollectRevenueReceiptAddress } from "../../src";
import { driveAutoErFlow, ownerAta, readTokenAccountMint } from "./_token";

// collectRevenue — collect_revenue: claim the staker's share of protocol revenue
// into the owner's ATA of the revenue mint.
//
// The revenue payout mint is whatever the pool's `revenueTokenAccount` holds
// (read on-chain). Auto-`_er` flow: base collect_revenue_with_action delegates
// the receipt + queues collect_revenue_er (auto-run) → base settle; we send the
// base tx and poll the receipt closed. `RESUME=1` recovers a stuck receipt. If no
// revenue is owed, settle pays 0 and just closes the receipt.
//
// RUN (from client-v2/):
//   npx ts-node scripts/token/collectRevenue.ts                 # dry-run
//   SEND=1 npx ts-node scripts/token/collectRevenue.ts          # claim revenue
//   SEND=1 RESUME=1 npx ts-node scripts/token/collectRevenue.ts # recovery for a stuck receipt

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;
  const { mint, token22 } = await readTokenAccountMint(
    ctx,
    ctx.poolConfig.revenueTokenAccount,
  );
  note(`revenue mint=${mint.toBase58()} token22=${token22}`);
  const { ata, createIx } = ownerAta(ctx, mint, token22);
  const [receipt] = findCollectRevenueReceiptAddress(owner, ctx.client.programId);

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
});
