import { main, sendBase, phase, note, ok, logSent } from "../_lib";

// ts-node scripts/setup/createSession.ts          (dry-run)
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/setup/createSession.ts   (submit)
// Both the owner wallet and the session key sign.
main(async (ctx) => {
  if (!ctx.session) throw new Error("set SESSION_KEY to a session keypair file");
  phase("build + submit create_session (base; owner + session sign)");
  note(`session=${ctx.session.publicKey.toBase58()}`);
  const res = await ctx.client.createSession(ctx.session.publicKey);
  return logSent(await sendBase(ctx, { ...res, additionalSigners: [ctx.session] }));
});
