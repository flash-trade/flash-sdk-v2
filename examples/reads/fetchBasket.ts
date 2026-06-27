import { main } from "../_lib";

// ts-node scripts/reads/fetchBasket.ts   (reads the ER basket where positions live)
main(({ client, wallet }) => client.erAccounts!.fetchBasket(wallet.publicKey));
