import { main, ENV } from "../_lib";

// ts-node scripts/reads/fetchAllCustodies.ts
main(({ client }) => client.accounts.fetchAllCustodies(ENV.poolName));
