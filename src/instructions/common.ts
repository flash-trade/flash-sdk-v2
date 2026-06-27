import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { PoolConfig } from "../PoolConfig";

/** Resolve a custody's account + oracle account from its token symbol. */
export function resolveCustody(pc: PoolConfig, symbol: string, useExtOracle?: boolean) {
  const c = pc.custodies.find((x) => x.mintKey.equals(pc.getTokenFromSymbol(symbol).mintKey))!;
  return {
    account: c.custodyAccount,
    oracle: useExtOracle ? c.extOracleAccount : c.intOracleAccount,
    mint: c.mintKey,
    tokenAccount: c.tokenAccount,
  };
}

export interface SessionArgs {
  /** Position/basket owner (basket PDA seed). Defaults to the wallet. */
  owner?: PublicKey;
  /** Actual signer — the owner or a session key. Defaults to owner. */
  signer?: PublicKey;
  /** Session token account; omit/null for direct owner signing. */
  sessionToken?: PublicKey | null;
  useExtOracle?: boolean;
}

/** Resolve owner/signer/sessionToken. The session_token account is optional
 *  on-chain; pass the program id as the "None" sentinel when unused. */
export function resolveSession(program: Program, a: SessionArgs) {
  const owner = a.owner ?? program.provider.publicKey!;
  return {
    owner,
    signer: a.signer ?? owner,
    sessionToken: a.sessionToken ?? program.programId,
  };
}
