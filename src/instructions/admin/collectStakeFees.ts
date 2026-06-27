import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  findCustodyAddress,
  findCustodyTokenAccountAddress,
  findEventAuthorityAddress,
  findFlpStakeAddress,
  findPerpetualsAddress,
  findPoolAddress,
  findTransferAuthorityAddress,
} from "../../utils";

// collect_stake_fees: an FLP staker collects accrued fee-share rewards (in the
// pool's fee custody token) into their receiving token account.
export async function collectStakeFees(
  program: Program,
  poolName: string,
  feeMint: PublicKey,
  receivingMint: PublicKey,
  receivingTokenAccount: PublicKey,
  owner?: PublicKey,
  opts: { token22?: boolean } = {},
) {
  const ownerKey = owner ?? program.provider.publicKey!;
  const [transferAuthority] = findTransferAuthorityAddress(program.programId);
  const [perpetuals] = findPerpetualsAddress(program.programId);
  const [pool] = findPoolAddress(poolName, program.programId);
  const [feeCustody] = findCustodyAddress(pool, feeMint, program.programId);
  const [feeCustodyTokenAccount] = findCustodyTokenAccountAddress(pool, feeMint, program.programId);
  const [flpStakeAccount] = findFlpStakeAddress(ownerKey, pool, program.programId);
  const [eventAuthority] = findEventAuthorityAddress(program.programId);

  return program.methods
    .collectStakeFees({})
    .accountsPartial({
      owner: ownerKey,
      receivingTokenAccount,
      transferAuthority,
      perpetuals,
      pool,
      feeCustody,
      flpStakeAccount,
      feeCustodyTokenAccount,
      systemProgram: SystemProgram.programId,
      tokenProgram: opts.token22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      eventAuthority,
      program: program.programId,
      ixSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      receivingMint,
    })
    .instruction();
}
