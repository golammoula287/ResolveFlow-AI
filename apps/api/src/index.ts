import { groqProvider, openAiProvider } from "./ai.js";
import "dotenv/config";
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
    NODE_ENV: z.string().default("development"),
  })
  .parse(process.env);
const db = new PrismaClient();
const server = createApp(db, {
  secret: env.JWT_SECRET,
  origin: env.WEB_ORIGIN,
  production: env.NODE_ENV === "production",
  ai:
    env.AI_PROVIDER === "groq"
      ? env.GROQ_API_KEY
        ? groqProvider(env.GROQ_API_KEY, env.GROQ_MODEL)
        : undefined
      : env.OPENAI_API_KEY && env.AI_MODEL
        ? openAiProvider(env.OPENAI_API_KEY, env.AI_MODEL, env.EMBEDDING_MODEL)
        : undefined,
}).listen(env.PORT, () =>
  console.log(`ResolveFlow API listening on ${env.PORT}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );
