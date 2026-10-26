import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { localDelivery, resendDelivery } from "./delivery.js";
import { startWorkflows } from "./jobs.js";
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.url(),
    DELIVERY_MODE: z.enum(["disabled", "local", "resend"]).default("disabled"),
    LOCAL_OUTBOX_DIR: z.string().default("../../.local/outbox"),
    RESEND_API_KEY: z.string().optional(),
    DELIVERY_FROM: z.string().optional(),
  })
  .parse(process.env);
if (
  env.DELIVERY_MODE === "resend" &&
  (!env.RESEND_API_KEY || !env.DELIVERY_FROM)
)
  throw Error(
    "RESEND_API_KEY and DELIVERY_FROM are required for email delivery",
  );
const provider =
  env.DELIVERY_MODE === "local"
    ? localDelivery(env.LOCAL_OUTBOX_DIR)
    : env.DELIVERY_MODE === "resend"
      ? resendDelivery(env.RESEND_API_KEY!, env.DELIVERY_FROM!)
      : undefined;
const db = new PrismaClient();
const service = startWorkflows(db, env.REDIS_URL, provider);
console.log(
  JSON.stringify({
    level: "info",
    event: "worker.started",
    delivery: env.DELIVERY_MODE,
  }),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(
    signal,
    () =>
      void service
        .close()
        .then(() => db.$disconnect())
        .then(() => process.exit(0)),
  );
