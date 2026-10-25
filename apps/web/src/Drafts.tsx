import { useEffect, useState } from "react";
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
type Citation = {
  chunkId: string;
  documentId: string;
  title: string;
  version: number;
  quote: string;
  claim: string;
};
type Draft = {
  id: string;
  status: string;
  body: string;
  reason: string | null;
  citations: Citation[];
  createdAt: string;
  sourcesAvailable?: boolean;
};
export function Drafts({
  base,
  ticketId,
  writable,
  api,
}: {
  base: string;
  ticketId: string;
  writable: boolean;
  api: Api;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [source, setSource] = useState<any>(null);
  const path = base + "/tickets/" + ticketId + "/drafts";
  useEffect(() => {
    let active = true;
    api(path)
      .then((d) => {
        if (active) setDrafts(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      await api(path, "POST");
      setDrafts(await api(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="drafts">
      <div className="team-heading">
        <h3>Evidence-backed drafts</h3>
        {writable && (
          <button disabled={busy} onClick={generate}>
            {busy ? "Retrieving evidence…" : "Generate draft"}
          </button>
        )}
      </div>
      <p className="hint">
        Drafts remain internal. Check each claim and source before using a
        response. Exact-quote checks do not prove that a claim is correct.
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {!drafts.length && <p className="hint">No drafts yet.</p>}
      {drafts.map((d) => (
        <article className="draft-card" key={d.id}>
          <span className="eyebrow">
            {d.status === "ABSTAINED"
              ? "INSUFFICIENT EVIDENCE"
              : "UNREVIEWED DRAFT"}{" "}
            · {new Date(d.createdAt).toLocaleString()}
          </span>
          {d.reason && <p>{d.reason}</p>}
          {d.body && <p className="draft-body">{d.body}</p>}
          {d.citations.map((c, i) => (
            <details key={i}>
              <summary>
                {i + 1}. {c.title} · version {c.version}
              </summary>
              <blockquote>{c.quote}</blockquote>
              <button
                onClick={async () => {
                  try {
                    const document = await api(
                      base + "/documents/" + c.documentId,
                    );
                    if (!document.approved)
                      throw Error(
                        "This source is no longer approved. Generate a new draft.",
                      );
                    setSource({ ...document, chunkId: c.chunkId });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Open source passage
              </button>
            </details>
          ))}
        </article>
      ))}
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
    </section>
  );
}
