import { useEffect, useState } from "react";
import type { Api } from "./DraftCard";
export function Workflows({
  workspace,
  role,
  api,
}: {
  workspace: string;
  role: string;
  api: Api;
}) {
  const [metrics, setMetrics] = useState<any>(null);
  const [data, setData] = useState<any>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [hook, setHook] = useState<any>(null);
  const base = "/workspaces/" + workspace,
    owner = role === "OWNER",
    writable = role === "OWNER" || role === "AGENT";
  async function refresh() {
    setData(await api(base + "/workflows?page=" + page));
    setMetrics(await api(base + "/metrics"));
  }
  useEffect(() => {
    let active = true;
    api(base + "/metrics")
      .then((m) => {
        if (active) setMetrics(m);
      })
      .catch(() => {});
    api(base + "/workflows?page=" + page)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
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
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workflows">
      <div className="team-heading">
        <h2>Workflow runs</h2>
        <button disabled={busy} onClick={() => run(refresh)}>
          Refresh runs
        </button>
      </div>
      {metrics && (
        <div className="summary">
          <div>
            <span>Provider requests</span>
            <strong>{metrics.aiRequests}</strong>
            <small>
              {metrics.aiFailures} failures · p95{" "}
              {metrics.p95LatencyMs === null
                ? "—"
                : metrics.p95LatencyMs + " ms"}
            </small>
          </div>
          <div>
            <span>Human approvals</span>
            <strong>{metrics.approvals}</strong>
            <small>
              {metrics.reviewDecisions} decisions ·{" "}
              {metrics.approvedWithoutEdits} at version 1
            </small>
          </div>
          <div>
            <span>Provider tokens</span>
            <strong>{metrics.inputTokens + metrics.outputTokens}</strong>
            <small>
              Cost{" "}
              {metrics.costUsd === null ? "unavailable" : "$" + metrics.costUsd}
            </small>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {!data ? (
        <p>Loading workflows…</p>
      ) : (
        <>
          <div className="knowledge-banner">
            <strong>
              Delivery:{" "}
              {data.deliveryMode === "local"
                ? "Local capture only · no email sent"
                : data.deliveryMode}
            </strong>
            <p>
              {data.workerHealthy
                ? "Worker ran recently."
                : "No recent worker heartbeat. Process pending jobs or check the configured scheduler."}
            </p>
            {owner && (
              <button
                className="primary"
                disabled={busy || !data.redisConfigured}
                onClick={() =>
                  run(async () => {
                    await api(base + "/workflows/process", "POST");
                  })
                }
              >
                Process pending jobs
              </button>
            )}
          </div>
          <div className="team-grid">
            <section className="team-card">
              <h3>Priority escalation</h3>
              <p className="hint">
                Raise old open tickets from low/normal to high priority.
                Customer replies are never sent by this rule.
              </p>
              {owner ? (
                <form
                  key={String(data.rule?.updatedAt)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const values = new FormData(e.currentTarget);
                    run(async () => {
                      await api(base + "/automation", "PUT", {
                        enabled: values.get("enabled") === "on",
                        minAgeHours: Number(values.get("hours")),
                      });
                    });
                  }}
                >
                  <label className="review-confirm">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={data.rule?.enabled ?? false}
                    />
                    Enable escalation
                  </label>
                  <label>
                    Minimum ticket age (hours)
                    <input
                      name="hours"
                      type="number"
                      min={1}
                      max={720}
                      required
                      defaultValue={data.rule?.minAgeHours ?? 24}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Save rule
                  </button>
                </form>
              ) : (
                <p>
                  {data.rule?.enabled ? "Enabled" : "Disabled"} ·{" "}
                  {data.rule?.minAgeHours ?? 24} hours
                </p>
              )}
              {writable && (
                <button
                  className="text"
                  disabled={busy || !data.rule?.enabled}
                  onClick={() =>
                    run(async () => {
                      await api(base + "/automation/run", "POST");
                    })
                  }
                >
                  Queue escalation run
                </button>
              )}
            </section>
            <section className="team-card">
              <h3>Signed ticket webhooks</h3>
              <p className="hint">
                Receive authenticated ticket events with timestamp and
                duplicate-event checks.
              </p>
              <p>{data.webhookEnabled ? "Enabled" : "Disabled"}</p>
              {owner && (
                <>
                  <button
                    className="primary"
                    disabled={busy || !data.webhookConfigured}
                    onClick={() =>
                      run(async () => {
                        await api(base + "/integrations/webhook", "PUT", {
                          enabled: !data.webhookEnabled,
                        });
                      })
                    }
                  >
                    {data.webhookEnabled ? "Disable webhook" : "Enable webhook"}
                  </button>
                  <button
                    className="text"
                    disabled={busy || !data.webhookConfigured}
                    onClick={() =>
                      run(async () => {
                        setHook(
                          await api(base + "/integrations/webhook-key", "POST"),
                        );
                      })
                    }
                  >
                    Reveal signing key
                  </button>
                  {hook && (
                    <>
                      <label>
                        Webhook path
                        <input value={hook.path} readOnly />
                      </label>
                      <label>
                        Signing key
                        <input
                          value={hook.key}
                          readOnly
                          onFocus={(e) => e.target.select()}
                        />
                      </label>
                      <button onClick={() => setHook(null)}>Hide key</button>
                    </>
                  )}
                </>
              )}
            </section>
          </div>
          <div className="inbox table-scroll">
            <table>
              <thead>
                <tr>
                  <th>JOB</th>
                  <th>STATE</th>
                  <th>ATTEMPTS</th>
                  <th>OUTCOME</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((j: any) => (
                  <tr key={j.id}>
                    <td>
                      {j.kind}
                      <small>{j.id}</small>
                    </td>
                    <td>
                      {j.status}
                      {j.lastError && <small>{j.lastError}</small>}
                    </td>
                    <td>{j.attempts}</td>
                    <td>
                      {j.delivery ? (
                        <>
                          <span className="badge">{j.delivery.status}</span>
                          <small>
                            {j.delivery.recipient} · v{j.delivery.version}
                          </small>
                          <small>
                            {j.delivery.providerId ?? "No provider receipt"}
                          </small>
                        </>
                      ) : j.result ? (
                        <span>{j.result.escalated ?? 0} tickets escalated</span>
                      ) : (
                        "Pending result"
                      )}
                      {writable && j.status === "FAILED" && (
                        <button
                          className="text"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(
                                base + "/jobs/" + j.id + "/retry",
                                "POST",
                                { confirmRetry: true },
                              );
                            })
                          }
                        >
                          Retry failed job
                        </button>
                      )}
                      <details>
                        <summary>Attempt history</summary>
                        {j.history.map((h: any) => (
                          <p key={h.id}>
                            {h.number}. {h.status} · {h.durationMs}ms{" "}
                            {h.errorCode ?? ""}
                          </p>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && (
              <div className="empty">No workflow jobs yet.</div>
            )}
            <footer>
              <span>
                {data.total} jobs · Page {page}
              </span>
              <div>
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <button
                  disabled={page * 20 >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </footer>
          </div>
        </>
      )}
    </section>
  );
}
