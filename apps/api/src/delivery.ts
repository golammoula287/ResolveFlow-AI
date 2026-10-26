import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
export class JobError extends Error {
  constructor(
    public code: string,
    public permanent = false,
  ) {
    super(code);
  }
}
export type Envelope = {
  id: string;
  recipient: string;
  subject: string;
  body: string;
};
export interface DeliveryProvider {
  name: string;
  send(
    message: Envelope,
  ): Promise<{ id: string; outcome: "ACCEPTED" | "LOCAL_CAPTURED" }>;
}
export function localDelivery(directory: string): DeliveryProvider {
  return {
    name: "local",
    async send(message) {
      await mkdir(directory, { recursive: true });
      const path = join(directory, message.id + ".json");
      const value = JSON.stringify(
        { ...message, mode: "local-capture" },
        null,
        2,
      );
      try {
        await writeFile(path, value, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST")
          throw new JobError("LOCAL_CAPTURE_FAILED");
        const previous = await readFile(path, "utf8");
        if (previous !== value)
          throw new JobError("IDEMPOTENCY_CONFLICT", true);
      }
      return { id: "local-" + message.id, outcome: "LOCAL_CAPTURED" };
    },
  };
}
export function resendDelivery(
  key: string,
  from: string,
  fetcher: typeof fetch = fetch,
): DeliveryProvider {
  return {
    name: "resend",
    async send(message) {
      let response: Response;
      try {
        response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + key,
            "Content-Type": "application/json",
            "Idempotency-Key": "resolveflow-" + message.id,
          },
          body: JSON.stringify({
            from,
            to: [message.recipient],
            subject: message.subject,
            text: message.body,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new JobError("DELIVERY_TRANSPORT");
      }
      if (!response.ok)
        throw new JobError(
          "DELIVERY_HTTP_" + response.status,
          response.status >= 400 &&
            response.status < 500 &&
            ![408, 409, 429].includes(response.status),
        );
      try {
        return {
          id: z.object({ id: z.string().min(1) }).parse(await response.json())
            .id,
          outcome: "ACCEPTED",
        };
      } catch {
        throw new JobError("INVALID_DELIVERY_RECEIPT");
      }
    },
  };
}
export const hashBody = (body: string) =>
  createHash("sha256").update(body).digest("hex");
