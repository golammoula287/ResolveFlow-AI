import { useEffect, useState } from "react";
import { DraftCard, type Draft, type Api } from "./DraftCard";
export function ReviewQueue({
  workspace,
  writable,
  api,
}: {
  workspace: string;
  writable: boolean;
  api: Api;
}) {
  const [items, setItems] = useState<Draft[]>([]),
    [total, setTotal] = useState(0),
    [status, setStatus] = useState("DRAFT"),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const base = "/workspaces/" + workspace;
  const path =
    base + "/drafts?" + new URLSearchParams({ status, page: String(page) });
  async function refresh() {
    const d = await api(path);
    setItems(d.items);
    setTotal(d.total);
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    api(path)
      .then((d) => {
        if (active) {
          setItems(d.items);
          setTotal(d.total);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <section className="review-queue">
      <p>
        Check the evidence, refine the response, and record your decision.
        Approved responses stay internal. No customer reply is sent.
      </p>
      <div className="toolbar">
        <div className="tabs">
          {[
            ["DRAFT", "Pending review"],
            ["APPROVED", "Approved"],
            ["REJECTED", "Rejected"],
            ["ABSTAINED", "Abstained"],
          ].map(([s, label]) => (
            <button
              key={s}
              className={status === s ? "chosen" : ""}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          disabled={busy}
          onClick={() => {
            setError("");
            refresh().catch((e) => setError(e.message));
          }}
        >
          Refresh queue
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div aria-live="polite">
        {busy ? (
          <div className="empty">Loading drafts…</div>
        ) : items.length ? (
          items.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              base={base}
              writable={writable}
              api={api}
              reload={refresh}
            />
          ))
        ) : (
          <div className="empty">No drafts in this queue.</div>
        )}
      </div>
      <footer className="queue-footer">
        <span>
          {total} drafts · Page {page}
        </span>
        <div>
          <button
            disabled={page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            disabled={page * 20 >= total || busy}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </footer>
    </section>
  );
}
