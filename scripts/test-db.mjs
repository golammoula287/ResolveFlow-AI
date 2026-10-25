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
const env = {
  ...process.env,
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
    process.argv.includes("--browser")
      ? ["exec", "playwright", "test"]
      : ["test"],
  );
} finally {
  await pg.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
