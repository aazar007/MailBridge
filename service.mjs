// @ts-check
import nextjs from "@prisma/composer/nextjs";
import { compute } from "@prisma/composer-prisma-cloud";
import { postgres, dataContract } from "@prisma/composer-prisma-cloud/orm";
import emailSenderWebContractJson from "./src/prisma/contract.json" with { type: "json" };

export default compute({
  name: "email-sender-web",
  deps: { db: postgres(dataContract(emailSenderWebContractJson)) },
  build: nextjs({ module: import.meta.url, appDir: "." }),
});
