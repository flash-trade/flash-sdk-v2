import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { TokenStake } from "./types";
import { WithdrawRequest } from "./idl/generatedTypes";

export interface LockRequestStatus {
  requestId: number;
  lockedAmount: BN;
  withdrawableAmount: BN;
  timeRemaining: BN;
  totalAmount: BN;
}

export class TokenStakeAccount implements TokenStake {
  publicKey: PublicKey;

  owner!: PublicKey;
  isInitialized!: boolean;
  bump!: number;
  level!: number;
  withdrawRequestCount!: number;
  withdrawRequest!: WithdrawRequest[];
  rebateRate!: BN;
  activeStakeAmount!: BN;
  updateTimestamp!: BN;
  tradeTimestamp!: BN;
  tradeCounter!: number;
  lastRewardEpochCount!: number;
  rewardTokens!: BN;
  unclaimedRevenueAmount!: BN;
  revenueSnapshot!: BN;
  claimableRebateUsd!: BN;
  rebateUsdSnapshot!: BN;
  rebateDayTimestamp!: BN;
  maxRebateUsd!: BN;
  padding!: BN[];

  constructor(publicKey: PublicKey, parseData: TokenStake) {
    this.publicKey = publicKey;
    Object.assign(this, parseData);
  }

  static from(publicKey: PublicKey, parseData: TokenStake): TokenStakeAccount {
    return new TokenStakeAccount(publicKey, parseData);
  }

  updateData(parseData: TokenStake) {
    Object.assign(this, parseData);
  }

  /** Total locked amount across all active withdraw requests. */
  getLockedAmount(): BN {
    let total = new BN(0);
    for (let i = 0; i < this.withdrawRequestCount; i++) {
      total = total.add(this.withdrawRequest[i].lockedAmount);
    }
    return total;
  }

  /** Total withdrawable (vested) amount across all active withdraw requests. */
  getWithdrawableAmount(): BN {
    let total = new BN(0);
    for (let i = 0; i < this.withdrawRequestCount; i++) {
      total = total.add(this.withdrawRequest[i].withdrawableAmount);
    }
    return total;
  }

  /** Revenue-eligible amount: active stake + locked tokens. */
  getRevenueEligibleAmount(): BN {
    return this.activeStakeAmount.add(this.getLockedAmount());
  }

  /** Per-request lock status with amounts and time remaining. */
  getLockStatus(): LockRequestStatus[] {
    const statuses: LockRequestStatus[] = [];
    for (let i = 0; i < this.withdrawRequestCount; i++) {
      const req = this.withdrawRequest[i];
      statuses.push({
        requestId: i,
        lockedAmount: req.lockedAmount,
        withdrawableAmount: req.withdrawableAmount,
        timeRemaining: req.timeRemaining,
        totalAmount: req.lockedAmount.add(req.withdrawableAmount),
      });
    }
    return statuses;
  }
}
