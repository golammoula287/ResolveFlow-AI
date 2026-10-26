import { Redis } from "ioredis";
import { RedisStore, type RedisReply } from "rate-limit-redis";
export function redisRateStores(url: string) {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    retryStrategy: (attempt) => (attempt > 2 ? null : 100 * attempt),
  });
  client.on("error", () =>
    console.error(
      JSON.stringify({ level: "error", event: "rate_limit_store_unavailable" }),
    ),
  );
  return (prefix: string) =>
    new RedisStore({
      prefix: "resolveflow-limit-" + prefix + ":",
      sendCommand: (...args: string[]) =>
        client.call(...(args as [string, ...string[]])) as Promise<RedisReply>,
    });
}
