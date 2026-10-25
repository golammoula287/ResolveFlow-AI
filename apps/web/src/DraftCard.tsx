import { useEffect, useState } from "react";
export type Api = (
  path: string,
  method?: string,
  data?: unknown,
) => Promise<any>;
export type Citation = {
  chunkId: string;
  documentId: string;
  title: string;
  version: number;
  quote: string;
  claim: string;
};
export type Draft = {
  id: string;
  ticketId: string;
  status: string;
  body: string;
  reason: string | null;
  citations: Citation[];
  createdAt: string;
  version: number;
  approvedVersion: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  sourcesAvailable?: boolean;
  ticket?: { id: string; subject: string; customerEmail?: string };
};
export function DraftCard({
  draft: d,
  base,
  writable,
  api,
  reload,
}: {
  draft: Draft;
  base: string;
  writable: boolean;
  api: Api;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(d.body),
    [confirmed, setConfirmed] = useState(false),
    [rejecting, setRejecting] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [source, setSource] = useState<any>(null),
    [history, setHistory] = useState<any>(null);
  const path = base + "/drafts/" + d.id;
  useEffect(() => {
    setBody(d.body);
    setConfirmed(false);
    setEditing(false);
    setRejecting(false);
    setSource(null);
    setHistory(null);
  }, [d.version, d.status, d.sourcesAvailable]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const editable =
    writable &&
    ["DRAFT", "APPROVED", "REJECTED"].includes(d.status) &&
    d.sourcesAvailable !== false;
  return (
    <article className="draft-card" aria-label={"Draft version " + d.version}>
      <div className="team-heading">
        <span className="eyebrow">
          {d.status === "ABSTAINED"
            ? "INSUFFICIENT EVIDENCE"
            : d.status === "DRAFT"
              ? "PENDING REVIEW"
              : d.status}{" "}
          · VERSION {d.version}
        </span>
        <small>{new Date(d.createdAt).toLocaleString()}</small>
      </div>
      {d.ticket && <h3>{d.ticket.subject}</h3>}
      {d.reason && <p>{d.reason}</p>}
      {d.rejectionReason && (
        <p className="review-reason">Rejection reason: {d.rejectionReason}</p>
      )}
      {d.status === "APPROVED" && (
        <p className="approval-note">
          Approved version {d.approvedVersion} ·{" "}
          {d.reviewedAt ? new Date(d.reviewedAt).toLocaleString() : ""}.
          Delivery has not been queued.
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error} <button onClick={() => run(reload)}>Refresh draft</button>
        </div>
      )}
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(path, "PATCH", { body, expectedVersion: d.version });
              await reload();
              setEditing(false);
            });
          }}
        >
          <label>
            Response text
            <textarea
              aria-label="Response text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={12000}
              rows={6}
            />
          </label>
          <p className="hint">
            Saving a changed response creates a new version and clears its
            approval. Check your edits against the source passages.
          </p>
          <div className="review-actions">
            <button className="primary" disabled={busy}>
              Save revision
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setBody(d.body);
              }}
            >
              Cancel edit
            </button>
          </div>
        </form>
      ) : (
        d.body && <p className="draft-body">{d.body}</p>
      )}
      {!!d.citations.length && (
        <>
          <p className="hint">
            Evidence from the generated draft. Edited claims need a fresh human
            check.
          </p>
          {d.citations.map((c, i) => (
            <details key={i}>
              <summary>
                {i + 1}. {c.title} · version {c.version}
              </summary>
              <p>{c.claim}</p>
              <blockquote>{c.quote}</blockquote>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const document = await api(
                      base + "/documents/" + c.documentId,
                    );
                    if (!document.approved)
                      throw Error(
                        "This source is no longer approved. Refresh the draft.",
                      );
                    setSource({ ...document, chunkId: c.chunkId });
                  })
                }
              >
                Open source passage
              </button>
            </details>
          ))}
        </>
      )}
      {source && (
        <div className="source-inline">
          <div className="team-heading">
            <h4>
              {source.title} · version {source.version}
            </h4>
            <button onClick={() => setSource(null)}>Close passage</button>
          </div>
          {source.chunks
            .filter((c: any) => c.id === source.chunkId)
            .map((c: any) => (
              <p key={c.id}>{c.content}</p>
            ))}
        </div>
      )}
      {!editing && (
        <>
          <div className="review-actions">
            {editable && (
              <button disabled={busy} onClick={() => setEditing(true)}>
                Edit response
              </button>
            )}
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setHistory(await api(path));
                })
              }
            >
              View review history
            </button>
          </div>
          {writable && d.status === "DRAFT" && (
            <div className="review-panel">
              {d.sourcesAvailable !== false && (
                <label className="review-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I checked this response against its cited sources.
                </label>
              )}
              <div className="review-actions">
                <button
                  className="primary"
                  disabled={busy || !confirmed || d.sourcesAvailable === false}
                  onClick={() =>
                    run(async () => {
                      await api(path + "/review", "POST", {
                        action: "APPROVE",
                        expectedVersion: d.version,
                        confirmEvidence: true,
                      });
                      await reload();
                    })
                  }
                >
                  Approve version {d.version}
                </button>
                <button
                  disabled={busy}
                  onClick={() => setRejecting(!rejecting)}
                >
                  Reject draft
                </button>
              </div>
              {rejecting && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await api(path + "/review", "POST", {
                        action: "REJECT",
                        expectedVersion: d.version,
                        reason,
                      });
                      await reload();
                      setReason("");
                      setRejecting(false);
                    });
                  }}
                >
                  <label>
                    Rejection reason
                    <textarea
                      aria-label="Rejection reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      required
                      maxLength={1000}
                      rows={2}
                    />
                  </label>
                  <button disabled={busy} className="primary">
                    Confirm rejection
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
      {history && (
        <div className="review-history">
          <div className="team-heading">
            <h4>Review history</h4>
            <button onClick={() => setHistory(null)}>Close history</button>
          </div>
          {history.reviews.length ? (
            history.reviews.map((r: any) => (
              <p key={r.id}>
                {r.action} · version {r.version} · {r.actorName ?? r.actorId}
                <small>
                  {new Date(r.createdAt).toLocaleString()}
                  {r.reason ? " · " + r.reason : ""}
                </small>
              </p>
            ))
          ) : (
            <p>No review decisions yet.</p>
          )}
          <h4>Saved revisions</h4>
          {history.revisions.map((r: any) => (
            <details key={r.id}>
              <summary>
                Version {r.version} · {r.editorName ?? r.changedBy}
              </summary>
              <p className="draft-body">
                {r.body || "Source content unavailable."}
              </p>
            </details>
          ))}
        </div>
      )}
    </article>
  );
}
