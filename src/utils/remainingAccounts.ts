import { AccountMeta, PublicKey } from "@solana/web3.js";
import type { PoolConfig } from "../PoolConfig";

export const ro = (pubkey: PublicKey): AccountMeta => ({
  pubkey,
  isSigner: false,
  isWritable: false,
});
export const rw = (pubkey: PublicKey): AccountMeta => ({
  pubkey,
  isSigner: false,
  isWritable: true,
});

/**
 * Build the AUM remaining-account tail the ER flows forward to their `_er`
 * handler. The on-chain handler reads custodies + oracles (and optionally
 * markets) to recompute pool AUM, then (for swap/LP) reads an optional/mandatory
 * whitelist as the LAST account.
 *
 * Per-op contract (confirmed against the *_er.rs sources):
 *   - swap:        [custodies, oracles] + whitelist (MANDATORY last). NO markets.
 *   - liquidity*:  [custodies, oracles, markets] + whitelist (OPTIONAL last).
 *   - compound_fees / migrate_*: [custodies, oracles, markets]. No whitelist.
 *   - collect_stake_reward: [] (optional token_stake handled by the builder).
 */
export function buildAumRemainingAccounts(
  poolConfig: PoolConfig,
  opts: {
    includeMarkets: boolean;
    useExtOracle?: boolean;
    whitelist?: PublicKey | null; // appended last if provided
  },
): AccountMeta[] {
  const metas: AccountMeta[] = [];
  for (const c of poolConfig.custodies) metas.push(ro(c.custodyAccount));
  for (const c of poolConfig.custodies)
    metas.push(ro(opts.useExtOracle ? c.extOracleAccount : c.intOracleAccount));
  if (opts.includeMarkets) {
    for (const m of poolConfig.markets) metas.push(ro(m.marketAccount));
  }
  if (opts.whitelist) metas.push(ro(opts.whitelist));
  return metas;
}
