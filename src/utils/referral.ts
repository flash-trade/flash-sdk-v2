import { AccountMeta, PublicKey } from "@solana/web3.js";
import { isVariant, Privilege } from "../types";

export function getReferralAccounts(
  tokenStakeAccount: PublicKey,
  userReferralAccount: PublicKey,
  privilege: Privilege,
): AccountMeta[] {
  if (isVariant(privilege, "none")) return [];
  if (tokenStakeAccount.equals(PublicKey.default) || userReferralAccount.equals(PublicKey.default)) {
    return [];
  }
  return [
    { pubkey: userReferralAccount, isSigner: false, isWritable: false },
    { pubkey: tokenStakeAccount, isSigner: false, isWritable: true },
  ];
}

export interface ReferralArgs {
  /** Defaults to None — no benefits, no remaining-account tail. */
  privilege?: Privilege;
  /** Token stake account: trader's own for Stake; the referrer's for Referral.
   *  Omit when the user has no token stake (the tail is then skipped). */
  tokenStakeAccount?: PublicKey;
  /** Referral account (["referral", owner]). Omit when there is no referral. */
  referralAccount?: PublicKey;
}

/**
 * Build the referral/benefits remaining-account tail for a trade owner.
 *
 * v1 semantics: the tail is appended ONLY for a non-None privilege AND when the
 * relevant account(s) are supplied. If the user has no referral / no token
 * stake, omit those args (or use Privilege.None) and no tail is added — the
 * trade runs at full fee. Passing a non-existent account would not revert (the
 * program returns a benefit-status and charges full fee), but we avoid sending
 * phantom accounts entirely.
 */
export function buildReferralTail(
  _owner: PublicKey,
  args: ReferralArgs,
): AccountMeta[] {
  const privilege = args.privilege ?? Privilege.None;
  if (isVariant(privilege, "none")) return [];
  // Benefits need both slots ([referral, tokenStake]); if either is absent,
  // send no remaining accounts at all (full fee).
  if (!args.referralAccount || !args.tokenStakeAccount) return [];
  return [
    { pubkey: args.referralAccount, isSigner: false, isWritable: false },
    { pubkey: args.tokenStakeAccount, isSigner: false, isWritable: true },
  ];
}
