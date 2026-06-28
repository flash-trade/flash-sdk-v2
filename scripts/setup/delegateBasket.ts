import { main, ENV, sendBase, phase, note, ok, logSent } from "../_lib";
import { validatorKeyForCluster } from "../../src";

// ts-node scripts/setup/delegateBasket.ts          (dry-run)
// SEND=1 ts-node scripts/setup/delegateBasket.ts   (submit)
// ── CONFIG ──
const commitFrequency = Number(process.env.COMMIT_FREQUENCY || "30000");

main(async (ctx) => {
  const validatorKey = validatorKeyForCluster(ENV.cluster);
  phase("build + submit delegate_basket (base)");
  note(`validator=${validatorKey.toBase58()} commitFrequency=${commitFrequency}ms`);
  return logSent(
    await sendBase(
      ctx,
      await ctx.client.delegateBasket(ctx.wallet.publicKey, {
        commitFrequency,
        validatorKey,
      }),
    ),
  );
});
