// @ts-check
import { module } from "@prisma/composer";
import { postgres, dataContract } from "@prisma/composer-prisma-cloud/orm";
import emailSenderWebContractJson from "./generated/prisma8/contract.json" with { type: "json" };
import emailSenderWebService from "./service.mjs";

export default module("mailbridge", ({ provision }) => {
  const database = provision(postgres({ name: "database", contract: dataContract(emailSenderWebContractJson), config: "./prisma.config.ts" }));
  provision(emailSenderWebService, { id: "emailsenderweb", deps: { db: database } });
});
