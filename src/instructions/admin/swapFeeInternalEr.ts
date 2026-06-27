import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  findPerpetualsAddress,
  findPoolAddress,
  findCustodyAddress,
  findReallocVaultAddress,
  findMagicFeeVaultAddress,
  findEventAuthorityAddress,
} from "../../utils";
import { validatorKeyForProgramId } from "../../constants";

/** swap_fee_internal_er — ER variant of swap_fee_internal. Settles the pool's
 *  `fees_obligation_usd` against the delegated reward custody on the ER (pure
 *  accounting) and commits the mutated pool + reward_custody back to mainnet.
 *  Resolve `rewardCustodyMint` (= the mint of `pool.reward_custody`) and its
 *  oracle account from the pool at the call site. Permissionless crank — signed
 *  by `payer`. */
export async function swapFeeInternalEr(
  program: Program,
  poolName: string,
  rewardCustodyMint: PublicKey,
  rewardCustodyOracleAccount: PublicKey,
  payer?: PublicKey,
) {
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [rewardCustody] = findCustodyAddress(pool, rewardCustodyMint, program.programId);
  const [reallocVault] = findReallocVaultAddress(program.programId);
  const [magicFeeVault] = findMagicFeeVaultAddress(validatorKeyForProgramId(program.programId));
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .swapFeeInternalEr({})
    .accountsPartial({
      payer: payer ?? program.provider.publicKey!,
      perpetuals,
      pool,
      rewardCustody,
      rewardCustodyOracleAccount,
      reallocVault,
      magicFeeVault,
      eventAuthority,
      program: program.programId,
    })
    .instruction();
}
