import { main } from "../_lib";

// ts-node scripts/views/getCompoundingTokenData.ts
main(({ client, poolConfig }) => client.views.getCompoundingTokenData(poolConfig));
