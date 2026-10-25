import { useEffect, useState } from "react";
import { DraftCard, type Draft, type Api } from "./DraftCard";
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
    [error, setError] = useState("");
  const path = base + "/tickets/" + ticketId + "/drafts";
  async function refresh() {
    setDrafts(await api(path));
  }
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
      await refresh();
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
        Drafts remain internal. Review every claim and cited passage. Approval
        records your decision; it does not send a customer reply.
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {!drafts.length && <p className="hint">No drafts yet.</p>}
      {drafts.map((d) => (
        <DraftCard
          key={d.id}
          draft={d}
          base={base}
          writable={writable}
          api={api}
          reload={refresh}
        />
      ))}
    </section>
  );
}
