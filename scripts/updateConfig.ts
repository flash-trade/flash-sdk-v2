import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { main, sendBase, sendEr, logSent, phase, note, ENV, validatorKey } from "./_lib";
import {
  setPoolConfigEr, setCustodyConfigEr, setMarketConfigEr,
  findPerpetualsAddress, findMultisigAddress, findEventAuthorityAddress,
  findPoolAddress, findCustodyAddress, findTokenVaultAddress, findReallocVaultAddress,
  findMagicFeeVaultAddress, Side,
} from "../src";

// =============================================================================
// FTV2 Pool.0 "global" config updater — the ER analogue of
// app/src/deploy/devnet/global.ts. UNCOMMENT exactly ONE block to run it; each
// block ends in `return`. Every block is READ-MODIFY: it fetches the current
// on-chain config and rewrites it unchanged EXCEPT the fields shown, so FTV2-
// specific values (oracle PDAs, mints, ratios) are never clobbered.
//
// Values below are pre-filled to MAINNET parity (current FTV2 value noted inline)
// from the parity audit. Flip only what you actually want aligned — some FTV2
// values (generous discounts, big max_aum) may be intentional for devnet.
//
// Perpetuals lives on BASE (sendBase); Pool/Custody/Market/TokenVault are
// DELEGATED → ER (sendEr, each consumes a sponsored commit; re-delegate if near
// the 10-cap). Multisig-gated (one admin sig; needs minSignatures==1).
// DRY-RUN by default; SEND=1 submits.
//   run:  SEND=1 npx ts-node scripts/updateConfig.ts
// =============================================================================

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

// mainnet borrow-rate slopes per symbol (ftv2 currently differs — see audit)
const MAINNET_BORROW: Record<string, { slope1: number; slope2: number }> = {
  USDC: { slope1: 22831, slope2: 17123 }, // ftv2: 31963 / 7991
  SOL: { slope1: 17123, slope2: 34247 },  // ftv2: 63927 / 55936
  BTC: { slope1: 11416, slope2: 17123 },  // ftv2: 34247 / 85616
  BNB: { slope1: 18265, slope2: 27397 },  // ftv2: same (cloned from mainnet Crypto.1)
  PUMP: { slope1: 159817, slope2: 125571 }, // ftv2: same (cloned from mainnet Community.1)
};
// mainnet max_payoff_bps per market key (ftv2 currently 10000 on the 3 below)
const MAINNET_MAX_PAYOFF: Record<string, number> = {
  "SOL.long": 10000, "SOL.short": 5000, "BTC.long": 5000, "BTC.short": 5000,
  "BNB.long": 12000, "BNB.short": 10000,   // ftv2: same (cloned from mainnet)
  "PUMP.long": 10000, "PUMP.short": 10000, // ftv2: same (cloned from mainnet)
};

main(async (ctx) => {
  const program = ctx.client.program;
  const erProgram = ctx.client.erProgram;
  if (!erProgram) throw new Error("ER not initialized — set ER_ENDPOINT");
  const wallet = ctx.wallet.publicKey;
  const VK = validatorKey();
  const [pool] = findPoolAddress(ENV.poolName, program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [multisig] = findMultisigAddress(program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);
  void VK; void sendBase; void setMarketConfigEr; void findCustodyAddress; void findTokenVaultAddress; void Side; void note;

  // ----------------------- SET PERPETUALS CONFIG (base) --------------------
  // Values are the CURRENT on-chain config (literals — no RPC read). Fields
  // flagged "mainnet:" are where FTV2 differs; swap to the mainnet value to
  // align (FTV2's higher discounts/rebates may be intentional for devnet).
  // {
  //   phase("set_perpetuals_config (base)");
  //   const params = {
  //     allowUngatedTrading: true,                          // on-chain: true
  //     tradingDiscount: [200_000_000, 250_000_000, 300_000_000, 350_000_000, 400_000_000, 450_000_000].map((n) => new BN(n)), // on-chain; mainnet: 25/35/50/70/95/120 e6
  //     referralRebate: [50_000_000, 100_000_000, 150_000_000, 250_000_000, 300_000_000, 350_000_000].map((n) => new BN(n)),  // on-chain; mainnet: 25/30/40/55/75/100 e6
  //     defaultRebate: new BN(50_000_000),                  // on-chain; mainnet: 20_000_000
  //     voltageMultiplier: { volume: new BN(100_000_000), rewards: new BN("100000000000"), rebates: new BN("400000000000") }, // on-chain (= mainnet)
  //     tradeLimit: 50,                                     // on-chain: 50
  //     triggerOrderLimit: 25,                              // on-chain: 25
  //     rebateLimitUsd: 1_000_000_000,                      // on-chain: 1e9
  //   };
  //   const ix = await program.methods.setPerpetualsConfig(params)
  //     .accountsPartial({ admin: wallet, multisig, perpetuals }).instruction();
  //   return logSent(await sendBase(ctx, { instructions: [ix] }));
  // }

  // ----------------------- SET POOL CONFIG (ER) ----------------------------
  // Values are the CURRENT on-chain config (literals — no RPC read).
  // {
  //   phase("set_pool_config_er (ER)");
  //   const ix = await setPoolConfigEr(program, ENV.poolName, {
  //     permissions: {
  //       allowSwap: true, allowAddLiquidity: true, allowRemoveLiquidity: true,
  //       allowOpenPosition: true, allowClosePosition: true, allowCollateralWithdrawal: true,
  //       allowSizeChange: true, allowLiquidation: true, allowLpStaking: true,
  //       allowFeeDistribution: true, allowUngatedTrading: true, // on-chain: true; mainnet: false
  //       allowFeeDiscounts: true, allowReferralRebates: true,
  //     },
  //     oracleAuthority: new PublicKey("6seFveZZenmrkU1FjGebrRzmsmu4m53r4MHGDUXLPYBR"), // on-chain
  //     maxAumUsd: new BN("1000000000000000"),    // on-chain: 1e15; mainnet: 15_000_000_000_000
  //     stakingFeeShareBps: new BN(7000),         // on-chain
  //     vpVolumeFactor: 0,                        // on-chain
  //     stakingFeeBoostBps: [0, 0, 0, 0, 0, 0].map((n) => new BN(n)), // on-chain
  //     minLpPriceUsd: new BN(500_000),           // on-chain: 500000; mainnet: 400000
  //     maxLpPriceUsd: new BN(2_000_000),         // on-chain
  //     thresholdUsd: new BN("1000000000000"),    // on-chain (= mainnet)
  //   }, wallet, VK);
  //   return logSent(await sendEr(ctx, { instructions: [ix] }, [ctx.wallet]));
  // }

  // ----------------------- SET CUSTODY CONFIG (ER) -------------------------
  // EXCEPTION: custody config is large (pricing/fees/borrow/oracle). The full
  // LITERAL per-symbol config lives in scripts/setCustodyConfig.ts — use that to
  // rewrite a custody with no RPC. This block is a focused read-modify that ONLY
  // overrides the borrow-rate slopes to mainnet for SYMBOL (default USDC),
  // preserving everything else from on-chain. SYMBOL=USDC|SOL|BTC|BNB|PUMP.
// {
//   const sym = (process.env.SYMBOL || "USDC").toUpperCase();
//   const bw = MAINNET_BORROW[sym];
//   if (!bw) throw new Error(`no mainnet borrow ref for ${sym}`);
//   const pcF = require("../src/PoolConfig.json");
//   const cc = pcF.pools.find((x: any) => x.poolName === ENV.poolName).custodies.find((c: any) => c.symbol === sym);
//   const mint = new PublicKey(cc.mintKey);
//   const [custody] = findCustodyAddress(pool, mint, program.programId);
//   phase(`set_custody_config_er (ER) ${sym} -> mainnet borrow slopes ${bw.slope1}/${bw.slope2}`);
//   const c: any = await (erProgram.account as any).custody.fetch(custody);
//   const p: any = await (erProgram.account as any).pool.fetch(pool);
//   const params = {
//     isVirtual: c.isVirtual, depegAdjustment: c.oracle.depegAdjustment, inversePrice: c.oracle.inversePrice,
//     token22: c.token22,
//     oracle: {
//       intOracleAccount: c.oracle.intOracleAccount, extOracleAccount: c.oracle.extOracleAccount,
//       oracleType: c.oracle.oracleType, maxDivergenceBps: c.oracle.maxDivergenceBps, maxConfBps: c.oracle.maxConfBps,
//       maxPriceAgeSec: c.oracle.maxPriceAgeSec, maxBackupAgeSec: c.oracle.maxBackupAgeSec,
//     },
//     pricing: c.pricing, permissions: c.permissions, fees: c.fees,
//     borrowRate: { ...c.borrowRate, slope1: new BN(bw.slope1), slope2: new BN(bw.slope2) },
//     ratios: p.ratios, minReserveUsd: c.minReserveUsd, limitPriceBufferBps: c.limitPriceBufferBps,
//   };
//   const ix = await setCustodyConfigEr(program, ENV.poolName, mint, params as any, c.oracle.intOracleAccount, wallet, VK);
//   return logSent(await sendEr(ctx, { instructions: [ix] }, [ctx.wallet]));
// }

  // ----------------------- SET MARKET CONFIG (ER) -------------------------
  // Aligns max_payoff_bps to mainnet for MARKET (default SOL.short). Set
  // MARKET=SOL.short|BTC.long|BTC.short|BNB.long|BNB.short|PUMP.long|PUMP.short
  // (SOL.long + the BNB/PUMP markets are already at parity — re-applying is a no-op).
  // {
  //   const key = (process.env.MARKET || "SOL.short").toUpperCase().replace("SHORT","short").replace("LONG","long");
  //   const [sym, sideStr] = key.split(".");
  //   const side = sideStr === "long" ? Side.Long : Side.Short;
  //   const payoff = MAINNET_MAX_PAYOFF[`${sym}.${sideStr}`];
  //   if (payoff === undefined) throw new Error(`no mainnet max_payoff ref for ${key}`);
  //   const pcF = require("../src/PoolConfig.json");
  //   const poolCfg = pcF.pools.find((x: any) => x.poolName === ENV.poolName);
  //   const mk = poolCfg.markets.find((m: any) => poolCfg.custodies[m.targetCustodyId].symbol === sym && m.side === sideStr);
  //   const targetCustody = new PublicKey(mk.targetCustody);
  //   const collateralCustody = new PublicKey(mk.collateralCustody);
  //   phase(`set_market_config_er (ER) ${key} -> max_payoff_bps ${payoff}`);
  //   // on-chain literals (no RPC): permissions all-true; correlation per market.
  //   const permissions = { allowOpenPosition: true, allowClosePosition: true, allowCollateralWithdrawal: true, allowSizeChange: true };
  //   const correlation = mk.marketCorrelation as boolean; // from PoolConfig (matches on-chain)
  //   const ix = await setMarketConfigEr(program, targetCustody, collateralCustody, side, new BN(payoff), permissions, correlation, wallet, VK);
  //   return logSent(await sendEr(ctx, { instructions: [ix] }, [ctx.wallet]));
  // }

  // ----------------------- SET TOKEN VAULT CONFIG (ER) --------------------
  // Values are the CURRENT on-chain config (literals — no RPC read).
  // (Dedicated script: scripts/setTokenVaultUnlockPeriod.ts.)
  // {
  //   const [tokenVault] = findTokenVaultAddress(program.programId);
  //   const [reallocVault] = findReallocVaultAddress(program.programId);
  //   const [magicFeeVault] = findMagicFeeVaultAddress(VK);
  //   phase("set_token_vault_config_er (ER)");
  //   const params = {
  //     tokenPermissions: { allowDeposits: true, allowWithdrawal: true, allowRewardWithdrawal: true }, // on-chain
  //     withdrawTimeLimit: new BN(5400),        // on-chain: 5400
  //     withdrawInstantFee: new BN(30_000_000), // on-chain: 30000000
  //     stakeLevel: [20_000_000_000, 40_000_000_000, 100_000_000_000, 200_000_000_000, 1_000_000_000_000, 2_000_000_000_000].map((n) => new BN(n)), // on-chain
  //     unlockPeriod: new BN(90 * 60),          // on-chain: 0; target: 5400 (90 min)
  //   };
  //   const ix = await program.methods.setTokenVaultConfigEr(params)
  //     .accountsPartial({ admin: wallet, multisig, tokenVault, reallocVault, magicFeeVault, eventAuthority, program: program.programId }).instruction();
  //   return logSent(await sendEr(ctx, { instructions: [ix] }, [ctx.wallet]));
  // }

  note("No block uncommented — open updateConfig.ts and uncomment exactly one section.");
  return { hint: "uncomment one block" };
});
