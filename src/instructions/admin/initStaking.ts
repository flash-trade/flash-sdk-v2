import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findMultisigAddress,
  findTransferAuthorityAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findCustodyAddress,
  findStakedLpVaultAddress,
} from "../../utils";

export interface InitStakingParams {
  stakingFeeShareBps: BN;
}

/** init_staking — one-time setup of a pool's FLP staking (creates the staked-LP
 *  vault). `custodyTokenMint` selects the pool's reward custody. */
export async function initStaking(
  program: Program,
  poolName: string,
  custodyTokenMint: PublicKey,
  params: InitStakingParams,
  admin?: PublicKey,
  opts: { token22?: boolean } = {},
) {
  const [multisig] = findMultisigAddress(program.programId);
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [custody] = findCustodyAddress(pool, custodyTokenMint, program.programId);
  const [lpTokenMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("lp_token_mint"), pool.toBuffer()],
    program.programId,
  );
  const [stakedLpTokenAccount] = findStakedLpVaultAddress(pool, lpTokenMint, program.programId);

  return program.methods
    .initStaking(params)
    .accountsPartial({
      admin: admin ?? program.provider.publicKey!,
      multisig,
      transferAuthority,
      perpetuals,
      pool,
      custody,
      lpTokenMint,
      stakedLpTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: opts.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .instruction();
}
