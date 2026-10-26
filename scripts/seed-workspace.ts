import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

dotenv.config({ path: "apps/api/.env", quiet: true });
const args = process.argv.slice(2);
const email = args[args.indexOf("--email") + 1];
if (!args.includes("--email") || !email || !args.includes("--confirm"))
  throw Error(
    "Usage: npm run demo:workspace -- --email EMAIL --confirm [--allow-remote]",
  );
const url = new URL(process.env.DATABASE_URL!);
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) &&
  !args.includes("--allow-remote")
)
  throw Error(
    "Hosted database seeding requires --allow-remote. Existing records are preserved.",
  );

const policies = [
  [
    "refund",
    "Refund eligibility",
    "Customers may request a refund within 30 calendar days of their first paid subscription invoice. Renewal invoices are not refundable. Include the invoice number and account email for an eligibility review.",
  ],
  [
    "billing",
    "Invoices and billing",
    "Workspace owners can download invoices from Settings > Billing > Invoices. Billing email changes apply to future invoices. Duplicate charges must be reviewed by support before any refund is promised.",
  ],
  [
    "invites",
    "Workspace invitations",
    "Workspace invitations expire after seven days. An owner can revoke an expired invitation and send a new one from workspace settings. Only owners can change member roles.",
  ],
  [
    "plans",
    "Subscription changes",
    "Cancellation takes effect at the end of the current billing period. Upgrades require owner approval. Export workspace data before the subscription ends.",
  ],
  [
    "security",
    "Account security",
    "Never request passwords or API keys in a support ticket. Suspected account compromise must be escalated to the workspace owner for identity verification.",
  ],
] as const;
const scenarios = [
  [
    "refund",
    "Refund for my first subscription",
    "I subscribed 12 days ago. How can I request a refund for invoice DEMO-1042?",
    "OPEN",
    "NORMAL",
  ],
  [
    "billing",
    "Download last month’s invoice",
    "Our finance team needs a PDF copy of invoice DEMO-1038. Where can the owner download it?",
    "OPEN",
    "LOW",
  ],
  [
    "invites",
    "My teammate’s invitation expired",
    "The invitation I sent nine days ago no longer works. Can I send a fresh invitation?",
    "OPEN",
    "NORMAL",
  ],
  [
    "plans",
    "Cancel at the end of this billing period",
    "We are pausing our project. Will we keep access until the current subscription ends?",
    "PENDING",
    "NORMAL",
  ],
  [
    "security",
    "Unexpected account activity",
    "I noticed unfamiliar workspace activity. Please help us verify account access.",
    "OPEN",
    "URGENT",
  ],
  [
    "billing",
    "Possible duplicate charge",
    "Two charges appear on our statement for the same month. Please review DEMO-1045.",
    "PENDING",
    "HIGH",
  ],
  [
    "invites",
    "Change a teammate to viewer",
    "We need a colleague to read tickets without changing them. Which role should the owner select?",
    "OPEN",
    "LOW",
  ],
  [
    "plans",
    "Upgrade approval",
    "Can an agent upgrade our subscription, or does our workspace owner need to approve it?",
    "OPEN",
    "NORMAL",
  ],
  [
    "billing",
    "Update our billing email",
    "Please explain how future invoices can use our finance address.",
    "RESOLVED",
    "LOW",
  ],
  [
    "refund",
    "Refund on a renewal invoice",
    "Our subscription renewed yesterday. Does the first-invoice refund policy cover renewals?",
    "OPEN",
    "HIGH",
  ],
  [
    "security",
    "Safe way to share troubleshooting details",
    "Should I paste our API key into this ticket so support can investigate?",
    "OPEN",
    "HIGH",
  ],
  [
    "plans",
    "Export before cancellation",
    "We would like to export our workspace data before the subscription ends.",
    "RESOLVED",
    "NORMAL",
  ],
] as const;

const db = new PrismaClient();
try {
  const user = await db.user.findUniqueOrThrow({
    where: { email },
    include: {
      memberships: { where: { role: "OWNER" }, include: { workspace: true } },
    },
  });
  if (user.memberships.length !== 1)
    throw Error(
      "Target account must own exactly one workspace to avoid ambiguous seeding.",
    );
  const workspaceId = user.memberships[0].workspaceId;
  const id = (key: string) =>
    "demo_" +
    createHash("sha256")
      .update(workspaceId + ":" + key)
      .digest("hex")
      .slice(0, 28);
  const created = await db.$transaction(
    async (tx) => {
      const counts = { tickets: 0, documents: 0, drafts: 0 };
      for (const [key, title, text] of policies) {
        const documentId = id("policy:" + key);
        if (
          await tx.knowledgeDocument.findUnique({ where: { id: documentId } })
        )
          continue;
        const content = "# Fictional demo policy: " + title + "\n\n" + text;
        await tx.knowledgeDocument.create({
          data: {
            id: documentId,
            workspaceId,
            title: "[Demo] " + title,
            filename: key + "-demo.md",
            contentHash: createHash("sha256").update(content).digest("hex"),
            createdBy: user.id,
            approved: true,
            approvedBy: user.id,
            approvedAt: new Date(),
            chunks: { create: { ordinal: 0, content } },
          },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: user.id,
            action: "demo.document_seeded",
            resourceId: documentId,
          },
        });
        counts.documents++;
      }
      for (const [
        index,
        [key, subject, request, status, priority],
      ] of scenarios.entries()) {
        const ticketId = id("ticket:" + index);
        if (await tx.ticket.findUnique({ where: { id: ticketId } })) continue;
        const createdAt = new Date(Date.now() - (index + 1) * 3 * 3600000);
        await tx.ticket.create({
          data: {
            id: ticketId,
            workspaceId,
            subject: "[Demo] " + subject,
            customerEmail: `customer${index + 1}@example.test`,
            status,
            priority,
            assigneeId: index % 3 === 0 ? user.id : null,
            createdAt,
            messages: {
              create: {
                authorId: user.id,
                body:
                  "Fictional customer scenario for demonstration.\n\n" +
                  request,
                createdAt,
              },
            },
          },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: user.id,
            action: "demo.ticket_seeded",
            resourceId: ticketId,
          },
        });
        counts.tickets++;
        if (index > 2) continue;
        const document = await tx.knowledgeDocument.findUniqueOrThrow({
          where: { id: id("policy:" + key) },
          include: { chunks: true },
        });
        const quote = policies.find((p) => p[0] === key)![2];
        const body = "Thanks for reaching out. " + quote;
        const citations = [
          {
            documentId: document.id,
            chunkId: document.chunks[0].id,
            title: document.title,
            version: document.version,
            quote,
            claim: body,
          },
        ];
        const draftId = id("draft:" + index);
        await tx.draft.create({
          data: {
            id: draftId,
            workspaceId,
            ticketId,
            status: "DRAFT",
            origin: "HUMAN",
            body,
            citations,
            createdBy: user.id,
          },
        });
        await tx.draftRevision.create({
          data: {
            draftId,
            workspaceId,
            version: 1,
            body,
            citations,
            changedBy: user.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId,
            actorId: user.id,
            action: "demo.manual_draft_seeded",
            resourceId: draftId,
          },
        });
        counts.drafts++;
      }
      return counts;
    },
    { timeout: 60000 },
  );
  console.log(
    JSON.stringify({
      workspace: user.memberships[0].workspace.name,
      created,
      note: "Fictional data only. No AI runs, delivery jobs, or customer emails created.",
    }),
  );
} finally {
  await db.$disconnect();
}
