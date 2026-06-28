import { main, ENV, validatorKey } from "../_lib";
import { findCollectTokenRewardReceiptAddress } from "../../src";
import { TOKEN22, ownerFafAta, driveAutoErFlow } from "./_token";

// collectFAF — collect_token_reward: claim accrued FAF staking rewards into the
// owner's FAF ATA.
//
// Auto-`_er` flow (like withdraw): the base collect_token_reward_with_action
// delegates the reward receipt AND queues collect_token_reward_er, which the
// validator runs automatically, then queues the base settle. So we just send the
// base tx and poll the receipt closed. `RESUME=1` is recovery for a stuck receipt.
// If no rewards are accrued, settle pays 0 and just closes the receipt.
//
// RUN (from client-v2/):
//   npx ts-node scripts/token/collectFAF.ts                 # dry-run
//   SEND=1 npx ts-node scripts/token/collectFAF.ts          # claim FAF rewards
//   SEND=1 RESUME=1 npx ts-node scripts/token/collectFAF.ts # recovery for a stuck receipt

main(async (ctx) => {
  const owner = ctx.wallet.publicKey;
  const { ata, createIx, mint } = ownerFafAta(ctx); // reward mint == FAF mint
  const [receipt] = findCollectTokenRewardReceiptAddress(owner, ctx.client.programId);

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
});
