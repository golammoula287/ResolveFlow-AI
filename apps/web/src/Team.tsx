import { useEffect, useState, type FormEvent } from "react";
type Member = {
  userId: string;
  role: string;
  user: { name: string; email: string };
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};
type Api = (path: string, method?: string, data?: unknown) => Promise<any>;
export function Team({
  workspace,
  role,
  api,
  reload,
}: {
  workspace: string;
  role: string;
  api: Api;
  reload: (id?: string) => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const base = "/workspaces/" + workspace,
    owner = role === "OWNER";
  async function refresh() {
    if (!workspace) {
      setMembers([]);
      setInvitations([]);
      return;
    }
    setMembers(await api(base + "/members"));
    setInvitations(owner ? await api(base + "/manage/invitations") : []);
  }
  useEffect(() => {
    setToken("");
    setError("");
    refresh().catch((e) => setError(e.message));
  }, [workspace, role]);
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
  function form(
    e: FormEvent<HTMLFormElement>,
    fn: (d: Record<string, string>) => Promise<void>,
  ) {
    e.preventDefault();
    const element = e.currentTarget;
    const d = Object.fromEntries(new FormData(element)) as Record<
      string,
      string
    >;
    run(async () => {
      await fn(d);
      element.reset();
    });
  }
  return (
    <section className="team">
      <h2>People & workspaces</h2>
      <p>Manage access and bring teammates into your workspace.</p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="team-grid">
        <form
          className="team-card"
          onSubmit={(e) =>
            form(e, async (d) => {
              const w = await api("/workspaces", "POST", d);
              await reload(w.id);
            })
          }
        >
          <h3>Create a workspace</h3>
          <label>
            Workspace name
            <input name="name" required maxLength={100} />
          </label>
          <button className="primary" disabled={busy}>
            Create workspace
          </button>
        </form>
        <form
          className="team-card"
          onSubmit={(e) =>
            form(e, async (d) => {
              const result = await api("/invitations/accept", "POST", d);
              await reload(result.workspaceId);
            })
          }
        >
          <h3>Join a workspace</h3>
          <label>
            Invitation token
            <input
              name="token"
              required
              minLength={64}
              maxLength={64}
              autoComplete="off"
            />
          </label>
          <p className="hint">
            Sign in with the email address your invitation was created for.
          </p>
          <button className="primary" disabled={busy}>
            Accept invitation
          </button>
        </form>
      </div>
      {workspace && (
        <>
          <div className="team-heading">
            <h3>Workspace members</h3>
            <button disabled={busy} onClick={() => run(refresh)}>
              Refresh members
            </button>
          </div>
          <div className="inbox table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PERSON</th>
                  <th>ROLE</th>
                  {owner && <th>ACCESS</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td>
                      {m.user.name}
                      <small>{m.user.email}</small>
                    </td>
                    <td>
                      {owner ? (
                        <select
                          aria-label={"Role for " + m.user.email}
                          disabled={busy}
                          value={m.role}
                          onChange={(e) => {
                            const role = e.target.value;
                            run(async () => {
                              await api(
                                base + "/manage/members/" + m.userId,
                                "PATCH",
                                { role },
                              );
                              await reload(workspace);
                              await refresh();
                            });
                          }}
                        >
                          {["OWNER", "AGENT", "VIEWER"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        m.role
                      )}
                    </td>
                    {owner && (
                      <td>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(
                                base + "/manage/members/" + m.userId,
                                "DELETE",
                              );
                              await reload();
                              await refresh();
                            })
                          }
                        >
                          Remove member
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {owner && (
        <>
          <form
            className="team-card invite-form"
            onSubmit={(e) =>
              form(e, async (d) => {
                const result = await api(
                  base + "/manage/invitations",
                  "POST",
                  d,
                );
                setToken(result.token);
                await refresh();
              })
            }
          >
            <h3>Invite a teammate</h3>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role">
                <option>AGENT</option>
                <option>VIEWER</option>
                <option>OWNER</option>
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Create invitation
            </button>
            <p className="hint">
              Invitations expire in seven days. Share the token privately with
              the invited person.
            </p>
            {token && (
              <label>
                Invitation token · shown once
                <input
                  readOnly
                  value={token}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
          </form>
          <h3>Invitations</h3>
          <div className="inbox table-scroll">
            <table>
              <thead>
                <tr>
                  <th>EMAIL</th>
                  <th>ROLE</th>
                  <th>STATE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{i.role}</td>
                    <td>
                      {i.acceptedAt
                        ? "Accepted"
                        : i.revokedAt
                          ? "Revoked"
                          : new Date(i.expiresAt) < new Date()
                            ? "Expired"
                            : "Pending"}
                    </td>
                    <td>
                      {!i.acceptedAt && !i.revokedAt && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(
                                base + "/manage/invitations/" + i.id,
                                "DELETE",
                              );
                              await refresh();
                            })
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!invitations.length && (
              <div className="empty">No invitations yet.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
