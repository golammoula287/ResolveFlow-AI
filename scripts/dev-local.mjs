import { RedisMemoryServer } from "redis-memory-server";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
const env = dotenv.config({ path: "apps/api/.env", quiet: true }).parsed;
if (!env?.DATABASE_URL)
  throw Error(
    "Copy apps/api/.env.example to apps/api/.env and configure it first.",
  );
const url = new URL(env.DATABASE_URL);
const localDatabase = ["localhost", "127.0.0.1"].includes(url.hostname);
const connected = process.argv.includes("--connected");
if (!localDatabase && !connected)
  throw Error(
    "dev:local requires a localhost DATABASE_URL. Use npm run dev:connected for a configured hosted database.",
  );
const redisUrl = new URL(env.REDIS_URL || "redis://127.0.0.1:6380");
if (
  !connected &&
  (!["localhost", "127.0.0.1"].includes(redisUrl.hostname) ||
    redisUrl.protocol !== "redis:")
)
  throw Error(
    "dev:local requires a local plain-TCP Redis URL; use npm run dev for hosted services.",
  );
const directory = resolve(".local/postgres");
await mkdir(resolve(".local"), { recursive: true });
const pg = localDatabase
  ? new EmbeddedPostgres({
      databaseDir: directory,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      port: Number(url.port || 5432),
      authMethod: "scram-sha-256",
      persistent: true,
      postgresFlags: ["-h", "127.0.0.1", "-k", resolve(".local")],
      onLog: () => {},
      onError: (message) => console.error(message),
    })
  : undefined;
function run(args) {
  return new Promise((resolve, reject) => {
    const c = spawn("npm", args, { stdio: "inherit" });
    c.on("error", reject);
    c.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error("Command failed: npm " + args.join(" "))),
    );
  });
}
await mkdir(resolve(".local/redis"), { recursive: true });
const localRedis =
  ["localhost", "127.0.0.1"].includes(redisUrl.hostname) &&
  redisUrl.protocol === "redis:";
const redis = localRedis
  ? new RedisMemoryServer({
      binary: { version: "7.2.7" },
      instance: {
        ip: "127.0.0.1",
        port: Number(new URL(env.REDIS_URL || "redis://127.0.0.1:6380").port),
        args: [
          "--dir",
          resolve(".local/redis"),
          "--appendonly",
          "yes",
          "--maxmemory-policy",
          "noeviction",
        ],
      },
    })
  : undefined;
let child;
let stopped = false;
async function stop() {
  if (stopped) return;
  stopped = true;
  child?.kill("SIGTERM");
  await pg?.stop();
  await redis?.stop();
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stop().finally(() => process.exit(0));
  });
try {
  if (pg) {
    if (!existsSync(resolve(directory, "PG_VERSION"))) await pg.initialise();
    await pg.start();
    const client = pg.getPgClient();
    await client.connect();
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!/^[a-zA-Z0-9_]+$/.test(name))
      throw Error(
        "Local database name must contain letters, digits or underscores.",
      );
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [name],
    );
    if (!found.rowCount) await client.query(`CREATE DATABASE "${name}"`);
    await client.end();
  }
  await redis?.getPort();
  await run(["run", "db:generate"]);
  await run(["run", "db:migrate"]);
  console.log(
    (localDatabase ? "Local" : "Configured hosted") +
      " database ready. Open http://localhost:5173",
  );
  child = spawn("npm", ["run", "dev"], { stdio: "inherit" });
  child.on("exit", () => stop());
} catch (error) {
  await stop();
  throw error;
}
