import { redisRateStores } from "./limits.js";
import { localDelivery, resendDelivery } from "./delivery.js";
import { groqProvider, openAiProvider } from "./ai.js";
import "dotenv/config";
import { runWorkflowBatch } from "./jobs.js";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { createApp } from "./app.js";
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    WEB_ORIGIN: z.url(),
    PORT: z.coerce.number().int().default(4000),
    AI_PROVIDER: z.enum(["groq", "openai"]).default("groq"),
    GROQ_API_KEY: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
    OPENAI_API_KEY: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    AI_MODEL: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().min(1).optional(),
    ),
    EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
    AI_INPUT_USD_PER_MILLION: z.coerce.number().nonnegative().optional(),
    AI_OUTPUT_USD_PER_MILLION: z.coerce.number().nonnegative().optional(),
    EMBEDDING_USD_PER_MILLION: z.coerce.number().nonnegative().optional(),
    REDIS_URL: z.url().optional(),
    WEBHOOK_SIGNING_SECRET: z.string().min(32).optional(),
    DELIVERY_MODE: z.enum(["disabled", "local", "resend"]).default("disabled"),
    LOCAL_OUTBOX_DIR: z.string().default("../../.local/outbox"),
    RESEND_WEBHOOK_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    DELIVERY_FROM: z.string().optional(),
    CRON_SECRET: z.string().min(32).optional(),
    NODE_ENV: z.string().default("development"),
  })
  .parse(process.env);
if (process.env.VERCEL && env.DELIVERY_MODE === "local")
  throw Error(
    "Local capture is not persistent on Vercel. Use resend or disabled.",
  );
if (
  env.DELIVERY_MODE === "resend" &&
  (!env.RESEND_API_KEY || !env.DELIVERY_FROM)
)
  throw Error("RESEND_API_KEY and DELIVERY_FROM required");
const delivery =
  env.DELIVERY_MODE === "local"
    ? localDelivery(env.LOCAL_OUTBOX_DIR)
    : env.DELIVERY_MODE === "resend"
      ? resendDelivery(env.RESEND_API_KEY!, env.DELIVERY_FROM!)
      : undefined;
const globalDb = globalThis as unknown as { resolveflowDb?: PrismaClient };
const db = globalDb.resolveflowDb ?? new PrismaClient();
globalDb.resolveflowDb = db;

export const app = createApp(db, {
  secret: env.JWT_SECRET,
  origin: env.WEB_ORIGIN,
  production: env.NODE_ENV === "production",
  rateStore: env.REDIS_URL ? redisRateStores(env.REDIS_URL) : undefined,
  aiPricing: {
    input: env.AI_INPUT_USD_PER_MILLION,
    output: env.AI_OUTPUT_USD_PER_MILLION,
    embedding: env.EMBEDDING_USD_PER_MILLION,
  },
  cronSecret: env.CRON_SECRET,
  resendWebhookSecret: env.RESEND_WEBHOOK_SECRET,
  runCron: env.REDIS_URL
    ? () => runWorkflowBatch(db, env.REDIS_URL!, delivery)
    : undefined,
  workflows: {
    delivery,
    redisConfigured: !!env.REDIS_URL,
    webhookSecret: env.WEBHOOK_SIGNING_SECRET,
    runJobs: env.REDIS_URL
      ? () => runWorkflowBatch(db, env.REDIS_URL!, delivery)
      : undefined,
  },
  ai:
    env.AI_PROVIDER === "groq"
      ? env.GROQ_API_KEY
        ? groqProvider(env.GROQ_API_KEY, env.GROQ_MODEL)
        : undefined
      : env.OPENAI_API_KEY && env.AI_MODEL
        ? openAiProvider(env.OPENAI_API_KEY, env.AI_MODEL, env.EMBEDDING_MODEL)
        : undefined,
});
