import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { main, ENV, custodyBySymbol, sendBase, phase, note, ok, logSent } from "../_lib";
import { findWithdrawalEscrowReceiptAddress, validatorKeyForCluster } from "../../src";

// ts-node scripts/setup/requestWithdrawal.ts                       (dry-run)
// SEND=1 ts-node scripts/setup/requestWithdrawal.ts                (submit; auto fee payer)
// SEND=1 ts-node scripts/setup/requestWithdrawal.ts 50000          (amount as a CLI arg)
// SYMBOL=SOL WITHDRAW_AMOUNT=50000 SEND=1 ts-node scripts/setup/requestWithdrawal.ts
// SEND=1 SESSION_KEY=~/session.json ts-node scripts/setup/requestWithdrawal.ts   (bring your own payer)
//
// Withdraws from the deposit ledger back to the wallet's token account.
//
// FEE PAYER: the withdrawal escrow is a DELEGATED PDA and the delegation program
// rejects owner == fee_payer, so a fee payer DISTINCT from the owner is required.
// It does NOT have to be a "session key" — any keypair with a little SOL works:
//   • SESSION_KEY set → use it (you fund it).
//   • otherwise       → auto-generate an ephemeral payer, fund it from the owner
//     in the same tx, and reclaim the leftover after settlement. Escrow rent is
//     refunded to the owner on settle (the escrow closes `= owner`).
// ── CONFIG ──
const symbol = process.env.SYMBOL || ENV.collateralSymbol;
// Amount precedence: positional CLI arg → WITHDRAW_AMOUNT env → default.
const withdrawAmount = new BN(process.argv[2] || process.env.WITHDRAW_AMOUNT || "1000000");
const commitFrequency = Number(process.env.COMMIT_FREQUENCY || "30000");
// SOL used to seed the auto-generated fee payer (escrow + delegation rent).
const feePayerFunding = Math.floor(
  Number(process.env.FEE_PAYER_FUNDING_SOL || "0.02") * LAMPORTS_PER_SOL,
);

main(async (ctx) => {
  const payer = ctx.session ?? Keypair.generate();
  const autoPayer = !ctx.session;

  phase("resolve mint + owner token account + fee payer");
  const mint = custodyBySymbol(ctx.poolConfig, symbol).mintKey;
  const ownerTokenAccount = getAssociatedTokenAddressSync(mint, ctx.wallet.publicKey);
  note(`${symbol} mint=${mint.toBase58()} amount=${withdrawAmount.toString()}`);
  note(
    `feePayer=${payer.publicKey.toBase58()} ` +
      (autoPayer ? `(auto-generated, funded ${feePayerFunding} lamports)` : `(SESSION_KEY)`),
  );
  ok();

  phase("build + submit request_withdrawal_with_action (base)");
  const res = await ctx.client.withdrawalWithAction(
    mint,
    ownerTokenAccount,
    withdrawAmount,
    { commitFrequency, validatorKey: validatorKeyForCluster(ENV.cluster) },
    payer.publicKey,
  );
  // Auto payer: prepend an owner→payer transfer so the payer can cover the escrow
  // rent within the same tx (the owner is the tx fee payer and signs the transfer).
  const instructions = autoPayer
    ? [
        SystemProgram.transfer({
          fromPubkey: ctx.wallet.publicKey,
          toPubkey: payer.publicKey,
          lamports: feePayerFunding,
        }),
        ...res.instructions,
      ]
    : res.instructions;
  const sent = await sendBase(ctx, { ...res, instructions, additionalSigners: [payer] });
  logSent(sent);
  if (!("signature" in sent)) return sent;

  // The validator runs withdrawal_er → settlement; the escrow PDA closes
  // (rent → owner) when the tokens land in ownerTokenAccount.
  phase("await settlement (escrow PDA closes when tokens land)");
  const [escrow] = findWithdrawalEscrowReceiptAddress(ctx.wallet.publicKey, mint, ctx.client.programId);
  note(`escrow=${escrow.toBase58()}`);
  await ctx.client.awaitClosed(escrow);
  const balance = await ctx.client.provider.connection.getTokenAccountBalance(ownerTokenAccount);
  ok(`settled — walletTokenBalance=${balance.value.amount}`);

  // Reclaim whatever's left in the throwaway payer back to the owner.
  let reclaimed = 0;
  if (autoPayer) {
    const conn = ctx.client.provider.connection;
    const bal = await conn.getBalance(payer.publicKey).catch(() => 0);
    if (bal > 0) {
      phase("reclaim leftover from the auto fee payer → owner");
      await sendBase(ctx, {
        instructions: [
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: ctx.wallet.publicKey,
            lamports: bal,
          }),
        ],
        additionalSigners: [payer],
      });
      reclaimed = bal;
      ok(`reclaimed ${bal} lamports`);
    }
  }

  return { ...sent, settled: true, walletTokenBalance: balance.value.amount, reclaimedLamports: reclaimed };
});
