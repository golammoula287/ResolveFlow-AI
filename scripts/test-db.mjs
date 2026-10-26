import { RedisMemoryServer } from "redis-memory-server";
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
const directory = await mkdtemp(join(tmpdir(), "resolveflow-test-"));
const password = randomBytes(24).toString("hex");
const port = Number(process.env.TEST_PG_PORT || 55433);
const pg = new EmbeddedPostgres({
  databaseDir: join(directory, "db"),
  user: "resolveflow",
  password,
  port,
  persistent: false,
  postgresFlags: ["-h", "127.0.0.1", "-k", directory],
  onLog: () => {},
  onError: (message) => console.error(message),
});
const redis = new RedisMemoryServer({
  binary: { version: "7.2.7" },
  instance: { ip: "127.0.0.1" },
});
const redisPort = await redis.getPort();
const env = {
  ...process.env,
  NODE_ENV: "test",
  CAPTURE_DEMO: process.argv.includes("--capture") ? "1" : "0",
  REDIS_URL: `redis://127.0.0.1:${redisPort}`,
  DELIVERY_MODE: "local",
  LOCAL_OUTBOX_DIR: join(directory, "outbox"),
  WEBHOOK_SIGNING_SECRET: randomBytes(32).toString("hex"),
  DATABASE_URL: `postgresql://resolveflow:${password}@127.0.0.1:${port}/resolveflow_test`,
  TEST_DATABASE_URL: `postgresql://resolveflow:${password}@127.0.0.1:${port}/resolveflow_test`,
};
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error(`npm ${args.join(" ")} exited ${code}`)),
    );
  });
}
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("resolveflow_test");
  await run(["run", "db:migrate"]);
  await run(
    process.argv.includes("--capture")
      ? ["exec", "playwright", "test", "tests/delivery.spec.ts"]
      : process.argv.includes("--eval")
        ? ["exec", "tsx", "scripts/evaluate.ts"]
        : process.argv.includes("--browser")
          ? ["exec", "playwright", "test"]
          : ["test"],
  );
} finally {
  await pg.stop().catch(() => {});
  await redis.stop();
  await rm(directory, { recursive: true, force: true });
}
