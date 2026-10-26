import { useState } from "react";
import type { Api } from "./DraftCard";
export function ManualDraft({
  base,
  ticketId,
  api,
  done,
}: {
  base: string;
  ticketId: string;
  api: Api;
  done: () => Promise<void>;
}) {
  const [body, setBody] = useState(""),
    [q, setQ] = useState(""),
    [items, setItems] = useState<any[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="team-card manual-draft"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api(base + "/tickets/" + ticketId + "/manual-drafts", "POST", {
            body,
            citations: items
              .filter((p) => selected.includes(p.id))
              .map((p) => ({ chunkId: p.id, quote: p.content })),
          });
          await done();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Write a manual response</h3>
      <p className="hint">
        This response is written by you. Attach approved source passages and
        submit it for review.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <label>
        Manual response
        <textarea
          aria-label="Manual response"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={12000}
          required
        />
      </label>
      <label>
        Find evidence
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find evidence"
          maxLength={500}
        />
      </label>
      <button
        type="button"
        disabled={busy || !q.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await api(
              base + "/documents/search?" + new URLSearchParams({ q }),
            );
            setItems(result.items);
            setSelected([]);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Find source passages
      </button>
      {items.map((p) => (
        <label className="manual-source" key={p.id}>
          <input
            type="checkbox"
            checked={selected.includes(p.id)}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, p.id]
                  : selected.filter((id) => id !== p.id),
              )
            }
          />
          <span>
            {p.title} · version {p.version}
            <small>{p.content}</small>
          </span>
        </label>
      ))}
      <button className="primary" disabled={busy || !selected.length}>
        Submit manual draft
      </button>
    </form>
  );
}
