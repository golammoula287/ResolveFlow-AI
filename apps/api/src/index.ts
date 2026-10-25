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
    NODE_ENV: z.string().default("development"),
  })
  .parse(process.env);
const db = new PrismaClient();
const server = createApp(db, {
  secret: env.JWT_SECRET,
  origin: env.WEB_ORIGIN,
  production: env.NODE_ENV === "production",
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
