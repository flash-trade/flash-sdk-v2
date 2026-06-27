import { main, ENV, note } from "../_lib";
import { findCollectRebateReceiptAddress } from "@flash_trade/flash-sdk-v2";
import { driveAutoErFlow, ownerAta, readTokenAccountMint } from "./_token";

// collectRewards — collect_rebate: claim the staker's accrued trading rebate into
// the owner's ATA of the rebate mint.
//
// The rebate payout mint is whatever the pool's `rebateTokenAccount` holds (read
// on-chain). Auto-`_er` flow: base collect_rebate_with_action delegates the
// receipt + queues collect_rebate_er (auto-run) → base settle; we send the base
// tx and poll the receipt closed. `RESUME=1` recovers a stuck receipt. If no
// rebate is owed, settle pays 0 and just closes the receipt.
//
// RUN (from client-v2/):
//   npx ts-node scripts/token/collectRewards.ts                 # dry-run
//   SEND=1 npx ts-node scripts/token/collectRewards.ts          # claim rebate
//   SEND=1 RESUME=1 npx ts-node scripts/token/collectRewards.ts # recovery for a stuck receipt

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;
  const { mint, token22 } = await readTokenAccountMint(
    ctx,
    ctx.poolConfig.rebateTokenAccount,
  );
  note(`rebate mint=${mint.toBase58()} token22=${token22}`);
  const { ata, createIx } = ownerAta(ctx, mint, token22);
  const [receipt] = findCollectRebateReceiptAddress(owner, ctx.client.programId);

  return driveAutoErFlow(ctx, {
    label: "collect_rebate",
    receipt,
    prependIxs: [createIx],
    buildBase: () =>
      ctx.client.collectRebateWithAction({
        rebateTokenMint: mint,
        receivingTokenAccount: ata,
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
});
