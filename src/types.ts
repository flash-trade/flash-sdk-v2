import { BN } from "@coral-xyz/anchor";
import { Signer, TransactionInstruction } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Concrete account / nested type aliases, re-exported from the generated file
// (scripts/generateTypes.js → src/idl/generatedTypes.ts). These are plain
// interfaces, so they avoid the TS2589 ("type instantiation excessively deep")
// blow-up that anchor's generic IdlAccounts/IdlTypes hit on this ~1MB IDL.
//
// `Side` and `OraclePrice` exist in the IDL too, but we deliberately do NOT
// re-export those generated forms — `Side` is a runtime enum (below) and
// `OraclePrice` is the helper class in ./OraclePrice.
// ---------------------------------------------------------------------------

export type {
  // state accounts
  Pool,
  Custody,
  Market,
  FlpStake,
  TokenStake,
  Whitelist,
  // receipts
  SwapReceipt,
  StakingDepositReceipt,
  StakingWithdrawReceipt,
  CompoundingDepositReceipt,
  CompoundingWithdrawReceipt,
  CollectStakeRewardReceipt,
  CompoundFeesReceipt,
  MigrateStakeReceipt,
  MigrateFlpReceipt,
  // nested
  OracleParams,
  PricingParams,
  Permissions,
  MarketPermissions,
  Fees,
  BorrowRateParams,
  TokenRatios,
  InternalPrice,
  InternalEmaPrice,
  // trade / basket layer
  Basket,
  UserDepositLedger,
  TradeVault,
  TokenVault,
  Position,
  Order,
  WithdrawalEscrowReceipt,
  CustodySettlementReceipt,
  Referral,
  // decode metas used by the UI (basket position/order + deposit ledger entries)
  PositionMeta,
  OrderMeta,
  DepositEntry,
  // view-function return shapes (get_position_data / get_position_data_er)
  PositionData,
  PositionPnl,
} from "./idl/generatedTypes";

// ---------------------------------------------------------------------------
// Side helper — the on-chain program (and the magic-trade / flash-sdk clients)
// encode Side as an Anchor enum variant: { none|long|short: {} }. We expose the
// SAME object-variant form (not a string enum) so that values produced here are
// interchangeable with flash-sdk's `Side` and pass flash-sdk's `isVariant`
// (which is `variant in obj`). Same dual type+const pattern as `Privilege`.
// ---------------------------------------------------------------------------

export type Side =
  | { none: Record<string, never> }
  | { long: Record<string, never> }
  | { short: Record<string, never> };

export const Side = {
  None: { none: {} } as Side,
  Long: { long: {} } as Side,
  Short: { short: {} } as Side,
};

export enum OracleType {
  None = "None",
  Custom = "Custom",
  Pyth = "Pyth",
  MagicBlock = "MagicBlock",
}

/** Anchor enum-variant tag check, e.g. isVariant(side, "long"). */
export function isVariant(obj: unknown, variant: string): boolean {
  if (typeof obj === "string") return obj.toLowerCase() === variant.toLowerCase();
  return typeof obj === "object" && obj !== null && variant in obj;
}

/** Convert a Side enum to the on-chain side byte (Long=1, Short=2). */
export function sideToByte(side: Side): number {
  return isVariant(side, "long") ? 1 : 2;
}

/** Off-chain oracle price shape used by OraclePrice helpers AND by the trade
 *  instruction params (`price_with_slippage`, `limit_price`, etc.). */
export interface ContractOraclePrice {
  price: BN;
  exponent: number;
}

/** Privilege enum (None | Stake | Referral), anchor-encoded as { none: {} }. */
export type Privilege =
  | { none: Record<string, never> }
  | { stake: Record<string, never> }
  | { referral: Record<string, never> };

export const Privilege = {
  None: { none: {} } as Privilege,
  Stake: { stake: {} } as Privilege,
  Referral: { referral: {} } as Privilege,
};

/** Standard return shape of every instruction builder. */
export interface InstructionResult {
  instructions: TransactionInstruction[];
  additionalSigners: Signer[];
}
