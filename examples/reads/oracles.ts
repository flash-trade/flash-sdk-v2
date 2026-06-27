import { PublicKey } from "@solana/web3.js";
import { setup, ENV, format } from "../_lib";

// ---------------------------------------------------------------------------
// Dump every internal (custom) oracle for the configured pool, from BOTH the
// base chain and the ER. For each custody it prints the price/expo, the
// on-chain publish_time, and how stale that is vs. now — the fastest way to see
// which oracles are tripping StaleOraclePrice (6007) in the priced views.
//   run:  npx ts-node scripts/reads/oracles.ts
// ---------------------------------------------------------------------------

async function fetchOracle(program: any, pk: PublicKey) {
  return (await (program.account as any).customOracle.fetch(pk)) as {
    price: any;
    expo: number;
    conf: any;
    ema: any;
    publishTime: any;
  };
}

async function run() {
  const ctx = setup();
  const pc = ctx.poolConfig;
  console.log(`[${ENV.cluster}] pool=${ENV.poolName} — internal (custom) oracles\n`);

  const nowSec = Math.floor(Date.now() / 1000);
  const baseProgram = ctx.client.program;
  const erProgram = ctx.client.erProgram ?? null;

  for (const cu of pc.custodies) {
    const intPk = new PublicKey((cu as any).intOracleAddress);
    console.log(`${"═".repeat(72)}`);
    console.log(`${cu.symbol}  (custody ${cu.custodyAccount.toBase58()})`);
    console.log(`  intOracle: ${intPk.toBase58()}`);
    console.log(`  extOracle: ${(cu as any).extOracleAddress}`);

    for (const [layer, program] of [
      ["base", baseProgram],
      ["ER", erProgram],
    ] as const) {
      if (!program) {
        console.log(`  ${layer.padEnd(4)}: (no ER program — set ER_ENDPOINT)`);
        continue;
      }
      try {
        const o = await fetchOracle(program, intPk);
        const pub = Number(o.publishTime?.toString?.() ?? o.publishTime);
        const age = Number.isFinite(pub) ? nowSec - pub : NaN;
        const price = Number(o.price?.toString?.() ?? o.price);
        const human = price * Math.pow(10, o.expo);
        console.log(
          `  ${layer.padEnd(4)}: price=${o.price?.toString?.()} expo=${o.expo} ` +
            `(~$${human.toLocaleString(undefined, { maximumFractionDigits: 6 })}) ` +
            `publishTime=${pub} age=${age}s`,
        );
        console.log(`        ${JSON.stringify(format(o))}`);
      } catch (e: any) {
        console.log(`  ${layer.padEnd(4)}: ERROR — ${e?.message ?? e}`);
      }
    }
  }
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error("FATAL:", e?.message ?? e);
    process.exit(1);
  },
);
