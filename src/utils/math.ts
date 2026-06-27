import BN from "bn.js";
import BigNumber from "bignumber.js";
import { Connection, PublicKey } from "@solana/web3.js";
import { BN_ONE, BN_ZERO } from "../constants";

// ---------------------------------------------------------------------------
// Fixed-point decimal math, ported from flash-sdk v1. Mirrors the on-chain
// `math.rs` helpers so off-chain quotes match settlement.
// ---------------------------------------------------------------------------

export const getUnixTs = () => new Date().getTime() / 1000;

export async function checkIfAccountExists(
  account: PublicKey,
  connection: Connection,
): Promise<boolean> {
  return (await connection.getBalance(account)) > 0;
}

export const scaleToExponent = (arg: BN, exponent: BN, targetExponent: BN): BN => {
  if (targetExponent.eq(exponent)) return arg;
  const delta = targetExponent.sub(exponent);
  if (delta.gt(BN_ZERO)) return arg.div(new BN(10).pow(delta));
  return arg.mul(new BN(10).pow(delta.muln(-1)));
};

// ceil(a/b) = ((a + b - 1) / b), for a >= 0
export const checkedCeilDiv = (arg1: BN, arg2: BN): BN => {
  if (arg1.gt(BN_ZERO)) {
    if (arg1.eq(arg2) && !arg2.isZero()) return BN_ONE;
    return arg1.sub(BN_ONE).div(arg2).add(BN_ONE);
  }
  return arg1.div(arg2);
};

export const checkedDecimalMul = (
  c1: BN,
  e1: BN,
  c2: BN,
  e2: BN,
  targetExponent: BN,
): BN => {
  if (c1.isZero() || c2.isZero()) return BN_ZERO;
  const targetPower = e1.add(e2).sub(targetExponent);
  if (targetPower.gt(BN_ZERO)) return c1.mul(c2).mul(new BN(10).pow(targetPower));
  return c1.mul(c2).div(new BN(10).pow(targetPower.muln(-1)));
};

export const checkedDecimalCeilMul = (
  c1: BN,
  e1: BN,
  c2: BN,
  e2: BN,
  targetExponent: BN,
): BN => {
  if (c1.isZero() || c2.isZero()) return BN_ZERO;
  const targetPower = e1.add(e2).sub(targetExponent);
  if (targetPower.gt(BN_ZERO)) return c1.mul(c2).mul(new BN(10).pow(targetPower));
  return checkedCeilDiv(c1.mul(c2), new BN(10).pow(targetPower.muln(-1)));
};

export const checkedDecimalDiv = (
  c1: BN,
  e1: BN,
  c2: BN,
  e2: BN,
  targetExponent: BN,
): BN => {
  if (c2.isZero()) throw new Error(`Overflow in ${c1} / ${c2}`);
  if (c1.isZero()) return BN_ZERO;
  let scaleFactor = BN_ZERO;
  let targetPower = e1.sub(e2).sub(targetExponent);
  if (e1.gt(BN_ZERO)) scaleFactor = scaleFactor.add(e1);
  if (e2.lt(BN_ZERO)) {
    scaleFactor = scaleFactor.sub(e2);
    targetPower = targetPower.add(e2);
  }
  if (targetExponent.lt(BN_ZERO)) {
    scaleFactor = scaleFactor.sub(targetExponent);
    targetPower = targetPower.add(targetExponent);
  }
  const scaledCoeff1 = scaleFactor.gt(BN_ZERO)
    ? c1.mul(new BN(10).pow(scaleFactor))
    : c1;
  if (targetPower.gte(BN_ZERO)) {
    return scaledCoeff1.div(c2).mul(new BN(10).pow(targetPower));
  }
  return scaledCoeff1.div(c2).div(new BN(10).pow(targetPower.muln(-1)));
};

function isValidDecimalString(s: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(s);
}

// Ported exactly from flash-sdk v1 (`validateNumberString`). Used by the UI
// token page for input validation before BN conversion.
export const validateNumberString = (str: string): boolean => {
  if (typeof str === "undefined") {
    return false;
  }
  if (str.trim() === "") {
    return false;
  }
  if (isNaN(Number(str))) {
    return false;
  }
  return true;
};

// Ported exactly from flash-sdk v1 (`uiDecimalsToNative`). Converts a UI
// decimal string to a native BN, truncating fractional digits beyond
// `decimals` (ROUND_DOWN).
export const uiDecimalsToNative = (amountUi: string, decimals: number): BN => {
  const valueBigNumber = new BigNumber(amountUi).multipliedBy(
    new BigNumber(10 ** decimals),
  );
  return new BN(valueBigNumber.toFixed(0, BigNumber.ROUND_DOWN));
};

export function nativeToUiDecimals(
  nativeAmount: BN | number | string | BigNumber,
  decimals: number,
  precision?: number,
  commaSeperated?: boolean,
): string {
  if (precision === undefined) precision = decimals;
  if (!isValidDecimalString(nativeAmount.toString())) {
    throw new Error(`nativeToUiDecimals error: ${nativeAmount} not valid`);
  }
  const denominator = new BigNumber(10).pow(decimals);
  const r = new BigNumber(nativeAmount.toString())
    .div(denominator)
    .toFixed(precision, BigNumber.ROUND_DOWN);
  if (commaSeperated) {
    return Number(r).toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  }
  return r;
}
