import { resendHooks } from "./resend-hooks.js";
import { timingSafeEqual, randomUUID } from "node:crypto";
import {
  workflowRoutes,
  inboundHooks,
  type WorkflowConfig,
} from "./workflow-routes.js";
import { reviewRoutes } from "./reviews.js";
import { knowledgeRoutes } from "./knowledge.js";
import { ServiceError, type AiProvider } from "./ai.js";
import { workspaceRoutes } from "./workspaces.js";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit, type Store } from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { canWrite } from "./policy.js";
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(12)
    .max(128)
    .refine(
      (v) => Buffer.byteLength(v, "utf8") <= 72,
      "Password must be at most 72 UTF-8 bytes",
    ),
});
const createTicket = z.object({
  subject: z.string().trim().min(1).max(200),
  customerEmail: z.email(),
  body: z.string().trim().min(1).max(20000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});
export function createApp(
  db: PrismaClient,
  config: {
    secret: string;
    origin: string;
    production?: boolean;
    ai?: AiProvider;
    aiRequestLimit?: number;
    rateStore?: (prefix: string) => Store;
    aiPricing?: { input?: number; output?: number; embedding?: number };
    workflows?: WorkflowConfig;
    cronSecret?: string;
    resendWebhookSecret?: string;
    runCron?: () => Promise<void>;
  },
) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.VERCEL) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    const started = Date.now();
    const requestId = randomUUID();
    res.set("X-Request-ID", requestId);
    res.on("finish", () => {
      if (process.env.NODE_ENV !== "test")
        console.log(
          JSON.stringify({
            level: "info",
            requestId,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - started,
          }),
        );
    });
    next();
  });
  inboundHooks(app, db, config.workflows?.webhookSecret);
  resendHooks(app, db, config.resendWebhookSecret);
  app.use(
    helmet(),
    cors({ origin: config.origin, credentials: true }),
    express.json({ limit: "64kb" }),
    cookieParser(),
  );
  app.use((req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== config.origin
    ) {
      res.status(403).json({ error: "Invalid request origin" });
      return;
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 900000,
    limit: 30,
    store: config.rateStore?.("auth"),
  });
  const session = (res: Response, id: string) =>
    res.cookie(
      "rf_session",
      jwt.sign({ sub: id }, config.secret, {
        expiresIn: "8h",
        algorithm: "HS256",
      }),
      {
        httpOnly: true,
        secure: !!config.production,
        sameSite: "strict",
        maxAge: 28800000,
        path: "/",
      },
    );
  app.get("/api/health", async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const input = credentials
      .extend({
        name: z.string().trim().min(1).max(100),
        workspace: z.string().trim().min(1).max(100),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await db.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        memberships: {
          create: {
            role: "OWNER",
            workspace: { create: { name: input.workspace } },
          },
        },
      },
    });
    session(res, user.id);
    res.status(201).json({ id: user.id });
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const input = credentials.parse(req.body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    session(res, user.id);
    res.json({ id: user.id });
  });
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie("rf_session", { path: "/" });
    res.sendStatus(204);
  });
  app.get("/api/cron/workflows", async (req, res) => {
    const expected = "Bearer " + (config.cronSecret ?? "");
    const provided = req.headers.authorization ?? "";
    if (
      !config.cronSecret ||
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!config.runCron) {
      res.status(503).json({ error: "Redis is not configured" });
      return;
    }
    await config.runCron();
    res.set("Cache-Control", "no-store").json({ ok: true });
  });
  app.use("/api", (req, res, next) => {
    try {
      const token = jwt.verify(req.cookies.rf_session ?? "", config.secret, {
        algorithms: ["HS256"],
      });
      if (typeof token === "string" || !token.sub) throw Error();
      res.locals.userId = token.sub;
      next();
    } catch {
      res.status(401).json({ error: "Please sign in" });
    }
  });
  app.get("/api/me", async (_req, res) => {
    const user = await db.user.findUnique({
      where: { id: res.locals.userId },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: { include: { workspace: true } },
      },
    });
    if (!user) {
      res.sendStatus(401);
      return;
    }
    res.json(user);
  });
  workspaceRoutes(app, db);
  app.use("/api/workspaces/:workspaceId", async (req, res, next) => {
    const workspaceId = req.params.workspaceId;
    const member = await db.membership.findUnique({
      where: { userId_workspaceId: { userId: res.locals.userId, workspaceId } },
    });
    if (!member) {
      res.status(404).json({ error: "Workspace not found" });
      return;
    }
    res.locals.workspaceId = workspaceId;
    res.locals.role = member.role;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !canWrite(member.role)
    ) {
      res.status(403).json({ error: "Read-only workspace access" });
      return;
    }
    next();
  });
  knowledgeRoutes(
    app,
    db,
    config.ai,
    config.aiRequestLimit,
    config.rateStore?.("ai"),
    config.aiPricing,
  );
  reviewRoutes(app, db);
  workflowRoutes(app, db, config.workflows ?? {});
  const base = "/api/workspaces/:workspaceId";
  app.get(base + "/tickets", async (req, res) => {
    const query = z
      .object({
        q: z.string().max(200).default(""),
        status: z.enum(["OPEN", "PENDING", "RESOLVED"]).optional(),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(req.query);
    const where: Prisma.TicketWhereInput = {
      workspaceId: res.locals.workspaceId,
      status: query.status,
      subject: { contains: query.q, mode: "insensitive" },
    };
    const [items, total] = await db.$transaction([
      db.ticket.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        skip: (query.page - 1) * 20,
      }),
      db.ticket.count({ where }),
    ]);
    res.json({ items, total, page: query.page });
  });
  app.post(base + "/tickets", async (req, res) => {
    const input = createTicket.parse(req.body);
    const { workspaceId, userId } = res.locals;
    const ticket = await db.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          workspaceId,
          subject: input.subject,
          customerEmail: input.customerEmail,
          priority: input.priority,
          messages: { create: { body: input.body, authorId: userId } },
        },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "ticket.created",
          resourceId: ticket.id,
        },
      });
      return ticket;
    });
    res.status(201).json(ticket);
  });
  app.get(base + "/tickets/:id", async (req, res) => {
    const ticket = await db.ticket.findFirst({
      where: {
        id: z.string().parse(req.params.id),
        workspaceId: res.locals.workspaceId,
      },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        drafts: {
          select: {
            deliveries: {
              select: {
                id: true,
                status: true,
                body: true,
                recipient: true,
                version: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const { drafts, ...detail } = ticket;
    res.json({ ...detail, deliveries: drafts.flatMap((d) => d.deliveries) });
  });
  app.patch(base + "/tickets/:id", async (req, res) => {
    const input = z
      .object({
        status: z.enum(["OPEN", "PENDING", "RESOLVED"]).optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
        assigneeId: z.string().nullable().optional(),
      })
      .strict()
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    if (
      input.assigneeId &&
      !(await db.membership.findUnique({
        where: {
          userId_workspaceId: { workspaceId, userId: input.assigneeId },
        },
      }))
    ) {
      res.status(400).json({ error: "Assignee must belong to workspace" });
      return;
    }
    const result = await db.$transaction(async (tx) => {
      const result = await tx.ticket.updateMany({
        where: { id: z.string().parse(req.params.id), workspaceId },
        data: input,
      });
      if (result.count)
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: userId,
            resourceId: z.string().parse(req.params.id),
            action: "ticket.updated",
          },
        });
      return result;
    });
    res
      .status(result.count ? 200 : 404)
      .json(result.count ? { ok: true } : { error: "Ticket not found" });
  });
  app.post(base + "/tickets/:id/messages", async (req, res) => {
    const { body } = z
      .object({ body: z.string().trim().min(1).max(20000) })
      .parse(req.body);
    const { workspaceId, userId } = res.locals;
    const result = await db.$transaction(async (tx) => {
      const ticket = await tx.ticket.findFirst({
        where: { id: z.string().parse(req.params.id), workspaceId },
      });
      if (!ticket) return null;
      const message = await tx.message.create({
        data: { ticketId: ticket.id, workspaceId, authorId: userId, body },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId,
          actorId: userId,
          resourceId: ticket.id,
          action: "note.added",
        },
      });
      return message;
    });
    res
      .status(result ? 201 : 404)
      .json(result ?? { error: "Ticket not found" });
  });
  app.get(base + "/members", async (_req, res) =>
    res.json(
      await db.membership.findMany({
        where: { workspaceId: res.locals.workspaceId },
        select: {
          userId: true,
          role: true,
          user: { select: { name: true, email: true } },
        },
      }),
    ),
  );
  app.get(base + "/events", async (_req, res) =>
    res.json(
      await db.auditEvent.findMany({
        where: { workspaceId: res.locals.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ),
  );
  app.use((_req, res) => {
    res.status(404).json({ error: "Route not found" });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ServiceError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    if (
      err &&
      typeof err === "object" &&
      "type" in err &&
      err.type === "entity.too.large"
    ) {
      res.status(413).json({ error: "Request exceeds the 64 KB limit" });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input", details: err.issues });
      return;
    }
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      res.status(409).json({ error: "Record already exists" });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }
    console.error(
      JSON.stringify({
        level: "error",
        message: "Unhandled request error",
        errorType: err instanceof Error ? err.name : "Unknown",
        code:
          err instanceof Prisma.PrismaClientKnownRequestError
            ? err.code
            : undefined,
      }),
    );
    res.status(500).json({ error: "Request failed" });
  });
  return app;
}
