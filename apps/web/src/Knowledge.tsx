import { useEffect, useState, type FormEvent } from "react";
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
type Document = {
  id: string;
  title: string;
  filename: string;
  approved: boolean;
  version: number;
  _count: { chunks: number };
};
type Passage = {
  id: string;
  documentId: string;
  title: string;
  version: number;
  content: string;
  score: number;
};
export function Knowledge({
  workspace,
  role,
  api,
}: {
  workspace: string;
  role: string;
  api: Api;
}) {
  const [replacing, setReplacing] = useState<string | null>(null);
  const [versions, setVersions] = useState<any[] | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [query, setQuery] = useState(""),
    [results, setResults] = useState<Passage[] | null>(null),
    [source, setSource] = useState<any>(null),
    [runs, setRuns] = useState<any[]>([]),
    [status, setStatus] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [content, setContent] = useState(""),
    [filename, setFilename] = useState("knowledge.txt");
  const base = "/workspaces/" + workspace,
    owner = role === "OWNER",
    writable = role === "OWNER" || role === "AGENT";
  async function refresh() {
    const [d, s, r] = await Promise.all([
      api(base + "/documents?page=" + page),
      api(base + "/ai/status"),
      api(base + "/ai/runs"),
    ]);
    setDocuments(d.items);
    setTotal(d.total);
    setStatus(s);
    setRuns(r);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      api(base + "/documents?page=" + page),
      api(base + "/ai/status"),
      api(base + "/ai/runs"),
    ])
      .then(([d, s, r]) => {
        if (active) {
          setDocuments(d.items);
          setTotal(d.total);
          setStatus(s);
          setRuns(r);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspace, page]);
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
  function ingest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const title = new FormData(form).get("title");
    run(async () => {
      await api(
        base +
          (replacing ? "/documents/" + replacing + "/versions" : "/documents"),
        "POST",
        { title, filename, content },
      );
      setReplacing(null);
      setContent("");
      setFilename("knowledge.txt");
      form.reset();
      await refresh();
    });
  }
  async function open(id: string) {
    await run(async () => {
      setSource(await api(base + "/documents/" + id));
    });
  }
  return (
    <section className="knowledge">
      <div className="knowledge-banner">
        <strong>
          {status?.configured
            ? "AI provider configured"
            : "AI provider not configured"}
        </strong>
        <p>
          Approved documents are searchable immediately. Semantic indexing and
          generated drafts require a server-side AI provider. Groq drafts use
          keyword retrieval; semantic indexing requires a separate embedding
          configuration.
        </p>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {writable && (
        <form className="team-card" onSubmit={ingest}>
          <h3>{replacing ? "Upload a new version" : "Add knowledge"}</h3>
          {replacing && (
            <button type="button" onClick={() => setReplacing(null)}>
              Cancel replacement
            </button>
          )}
          <p className="hint">
            Upload UTF-8 .txt or .md files up to 40 KB, or paste plain text. An
            owner must approve each document before it can be retrieved.
          </p>
          <div className="team-grid">
            <label>
              Document title
              <input name="title" required maxLength={200} />
            </label>
            <label>
              Text or Markdown file
              <input
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  run(async () => {
                    if (file.size > 40000 || !/\.(txt|md)$/i.test(file.name))
                      throw Error(
                        "Choose a .txt or .md file no larger than 40 KB.",
                      );
                    const text = new TextDecoder("utf-8", {
                      fatal: true,
                    }).decode(await file.arrayBuffer());
                    setContent(text);
                    setFilename(file.name);
                  });
                }}
              />
            </label>
          </div>
          <label>
            Document content
            <textarea
              name="content"
              aria-label="Document content"
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          <small>Source: {filename}</small>
          <button className="primary" disabled={busy}>
            {replacing ? "Save new version" : "Add document"}
          </button>
        </form>
      )}
      <div className="team-card">
        <h3>Search approved knowledge</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const mode = new FormData(e.currentTarget).get("mode") as string;
            run(async () => {
              const result = await api(
                base +
                  "/documents/search?" +
                  new URLSearchParams({ q: query, mode }),
              );
              setResults(result.items);
            });
          }}
        >
          <div className="knowledge-search">
            <input
              aria-label="Knowledge query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What is the refund policy?"
              maxLength={500}
              required
            />
            <select name="mode" aria-label="Search method">
              <option value="lexical">Keyword search</option>
              <option value="semantic" disabled={!status?.embeddingsConfigured}>
                Hybrid semantic search
              </option>
            </select>
            <button className="primary" disabled={busy}>
              Search knowledge
            </button>
          </div>
        </form>
        {results && (
          <div aria-live="polite">
            {results.length ? (
              results.map((p) => (
                <article className="passage" key={p.id}>
                  <button onClick={() => open(p.documentId)}>
                    {p.title} · version {p.version}
                  </button>
                  <p>{p.content}</p>
                </article>
              ))
            ) : (
              <p>No approved passages matched this search.</p>
            )}
          </div>
        )}
      </div>
      <h3>Workspace documents</h3>
      <div className="inbox table-scroll">
        <table>
          <thead>
            <tr>
              <th>DOCUMENT</th>
              <th>STATE</th>
              <th>PASSAGES</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id}>
                <td>
                  <button className="ticket-link" onClick={() => open(d.id)}>
                    {d.title}
                  </button>
                  <small>
                    {d.filename} · version {d.version}
                  </small>
                </td>
                <td>{d.approved ? "Approved" : "Pending approval"}</td>
                <td>{d._count.chunks}</td>
                <td>
                  <div className="document-actions">
                    {owner && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(base + "/documents/" + d.id, "PATCH", {
                                approved: !d.approved,
                              });
                              setResults(null);
                              await refresh();
                            })
                          }
                        >
                          {d.approved ? "Withdraw" : "Approve"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(base + "/documents/" + d.id, "DELETE");
                              setResults(null);
                              await refresh();
                            })
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {writable && d.approved && (
                      <button
                        disabled={busy || !status?.embeddingsConfigured}
                        onClick={() =>
                          run(async () => {
                            await api(
                              base + "/documents/" + d.id + "/index",
                              "POST",
                            );
                            await refresh();
                          })
                        }
                      >
                        Index for AI
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!documents.length && (
          <div className="empty">
            {loading
              ? "Loading knowledge…"
              : "No documents yet. Add your first support policy above."}
          </div>
        )}
        <footer>
          <span>
            {total} documents · Page {page}
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
      </div>
      {versions && (
        <section className="team-card">
          <div className="team-heading">
            <h3>Document versions</h3>
            <button onClick={() => setVersions(null)}>Close versions</button>
          </div>
          {versions.map((v) => (
            <p key={v.id}>
              <button onClick={() => open(v.id)}>
                {v.title} · version {v.version}
              </button>{" "}
              · {v.approved ? "Approved" : "Not approved"}
            </p>
          ))}
        </section>
      )}
      <h3>AI activity</h3>
      <p className="hint">
        Measured provider requests and token usage. Cost is not estimated. No
        activity is fabricated.
      </p>
      <div className="inbox table-scroll">
        <table>
          <thead>
            <tr>
              <th>OPERATION</th>
              <th>MODEL</th>
              <th>OUTCOME</th>
              <th>LATENCY</th>
              <th>TOKENS IN / OUT</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.operation}</td>
                <td>{r.model}</td>
                <td>
                  {r.status}
                  {r.errorCode && <small>{r.errorCode}</small>}
                </td>
                <td>{r.latencyMs} ms</td>
                <td>
                  {r.inputTokens ?? "—"} / {r.outputTokens ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!runs.length && <div className="empty">No AI requests recorded.</div>}
      </div>
      {source && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-title"
            className="dialog detail"
          >
            <button
              className="close"
              aria-label="Close source"
              onClick={() => setSource(null)}
            >
              ×
            </button>
            <span className="eyebrow">
              SOURCE DOCUMENT · VERSION {source.version}
            </span>
            <h2 id="source-title">{source.title}</h2>
            <p>
              {source.approved
                ? "Approved for retrieval"
                : "Not approved for retrieval"}
            </p>
            {source.chunks.map((c: any) => (
              <article className="passage" key={c.id}>
                <small>
                  Passage {c.ordinal + 1} ·{" "}
                  {c.embeddingModel ? "Semantically indexed" : "Keyword search"}
                </small>
                <p>{c.content}</p>
              </article>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
