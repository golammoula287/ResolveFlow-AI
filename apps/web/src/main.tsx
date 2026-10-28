import { LogoMark } from "./LogoMark";
import { SupportVisual } from "./SupportVisual";
import { Home } from "./Home";
import { useDialogs } from "./useDialogs";
import { Workflows } from "./Workflows";
import { ReviewQueue } from "./ReviewQueue";
import { Knowledge } from "./Knowledge";
import { Drafts } from "./Drafts";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Inbox,
  Activity,
  Plus,
  Search,
  ArrowUpRight,
  LogOut,
  X,
  Send,
  BookOpen,
  Users,
  GitBranch,
  ClipboardCheck,
  House,
} from "lucide-react";
import "./style.css";
import "./workspace.css";
import { Team } from "./Team";
type Ticket = {
  id: string;
  subject: string;
  customerEmail: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  createdAt: string;
  deliveries?: {
    id: string;
    status: string;
    body: string;
    recipient: string;
    version: number;
    createdAt: string;
  }[];
  messages?: { id: string; body: string; createdAt: string }[];
};
type Me = {
  id: string;
  name: string;
  memberships: {
    workspaceId: string;
    role: string;
    workspace: { name: string };
  }[];
};
const root = import.meta.env.VITE_API_URL ?? "";
async function api(path: string, method = "GET", data?: unknown) {
  const r = await fetch(root + "/api" + path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = r.status === 204 ? null : await r.json();
  if (!r.ok) throw Error(json?.error || "Request failed");
  return json;
}
function App() {
  useDialogs();
  const routeForPath = () =>
    window.location.pathname === "/signup"
      ? "signup"
      : window.location.pathname === "/signin"
        ? "signin"
        : window.location.pathname === "/app"
          ? "app"
          : "home";
  const [publicPage, setPublicPage] = useState(routeForPath);
  function navigate(path: string, replace = false) {
    if (replace) window.history.replaceState({}, "", path);
    else window.history.pushState({}, "", path);
    setPublicPage(routeForPath());
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const onBack = () => setPublicPage(routeForPath());
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  useEffect(() => {
    document.title =
      publicPage === "home"
        ? "ResolveFlow AI · Customer support, with context."
        : publicPage === "signup"
          ? "Create a workspace · ResolveFlow AI"
          : publicPage === "signin"
            ? "Sign in · ResolveFlow AI"
            : "Support workspace · ResolveFlow AI";
  }, [publicPage]);
  const [me, setMe] = useState<Me | null>(null),
    [workspace, setWorkspace] = useState(""),
    [tickets, setTickets] = useState<Ticket[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [sessionLoading, setSessionLoading] = useState(true),
    [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Ticket | null>(null),
    [tab, setTab] = useState("inbox"),
    [events, setEvents] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [members, setMembers] = useState<any[]>([]);
  const register = publicPage === "signup";
  const pageRef = useRef<HTMLElement>(null);
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 });
  }, [tab, workspace]);
  useEffect(() => {
    if (me && (publicPage === "signin" || publicPage === "signup"))
      navigate("/app", true);
  }, [me, publicPage]);
  const base = "/workspaces/" + workspace;
  const writable =
    me?.memberships.find((m) => m.workspaceId === workspace)?.role !== "VIEWER";
  async function loadMe(id?: string) {
    const user = await api("/me");
    const preferred = id || sessionStorage.getItem("workspace:" + user.id);
    setMe(user);
    setWorkspace(
      preferred &&
        user.memberships.some(
          (m: { workspaceId: string }) => m.workspaceId === preferred,
        )
        ? preferred
        : user.memberships[0]?.workspaceId || "",
    );
  }
  useEffect(() => {
    if (me && workspace)
      sessionStorage.setItem("workspace:" + me.id, workspace);
  }, [me, workspace]);
  useEffect(() => {
    loadMe()
      .catch(() => {})
      .finally(() => setSessionLoading(false));
  }, []);
  async function refresh() {
    if (!workspace) return;
    const data = await api(
      base +
        "/tickets?" +
        new URLSearchParams({
          q,
          page: String(page),
          ...(status ? { status } : {}),
        }),
    );
    setTickets(data.items);
    setTotal(data.total);
  }
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api(
        base +
          "/tickets?" +
          new URLSearchParams({
            q,
            page: String(page),
            ...(status ? { status } : {}),
          }),
      )
        .then((d) => {
          if (active) {
            setTickets(d.items);
            setTotal(d.total);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [workspace, q, status, page]);
  useEffect(() => {
    setSelected(null);
    if (!workspace) return;
    api(base + "/members")
      .then(setMembers)
      .catch((e) => setError(e.message));
  }, [workspace]);
  useEffect(() => {
    if (workspace && tab === "activity")
      api(base + "/events")
        .then(setEvents)
        .catch((e) => setError(e.message));
  }, [workspace, tab]);
  async function submit(
    e: React.FormEvent<HTMLFormElement>,
    fn: (data: Record<string, string>) => Promise<void>,
  ) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    try {
      await fn(
        Object.fromEntries(new FormData(form)) as Record<string, string>,
      );
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    try {
      setSelected(await api(base + "/tickets/" + id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function update(data: unknown) {
    try {
      const id = selected!.id;
      await api(base + "/tickets/" + id, "PATCH", data);
      const ticket = await api(base + "/tickets/" + id);
      setSelected((current) => (current?.id === id ? ticket : current));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (publicPage === "home")
    return <Home signedIn={!!me} navigate={navigate} />;
  if (publicPage === "app" && !me && sessionLoading)
    return (
      <main className="session-loading" role="status">
        <LogoMark />
        Opening your workspace…
      </main>
    );
  if (!me)
    return (
      <div className="auth">
        <div className="auth-story">
          <div className="brand">
            <LogoMark /> ResolveFlow<span>AI</span>
          </div>
          <div className="auth-intro">
            <span className="auth-caption">
              The daily work of customer support
            </span>
            <h1>Pick up the conversation.</h1>
            <p>
              A place for the question, the policy, and the reply you’ve
              checked.
            </p>
          </div>
          <SupportVisual compact />
          <div className="promise">
            Your policies. Your workspace. Your team’s decision.
          </div>
        </div>
        <main className="auth-form">
          <a
            className="auth-home"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setError("");
              navigate("/");
            }}
          >
            ← Back to home
          </a>
          <span className="eyebrow">YOUR SUPPORT WORKSPACE</span>
          <h2>{register ? "Start a new workspace" : "Welcome back"}</h2>
          <p>
            {register
              ? "Bring your team’s conversations together."
              : "Sign in to pick up where you left off."}
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) =>
              submit(e, async (d) => {
                await api(
                  "/auth/" + (register ? "register" : "login"),
                  "POST",
                  d,
                );
                await loadMe();
                navigate("/app");
              })
            }
          >
            {register && (
              <>
                <label>
                  Your name
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  Workspace name
                  <input name="workspace" required maxLength={100} />
                </label>
              </>
            )}
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
              <small>At least 12 characters</small>
            </label>
            <button className="primary" disabled={busy || sessionLoading}>
              {busy
                ? "Please wait…"
                : register
                  ? "Create workspace"
                  : "Sign in"}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <button
            className="text"
            onClick={() => {
              navigate(register ? "/signin" : "/signup");
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New here? Create a workspace"}
          </button>
        </main>
      </div>
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <LogoMark /> ResolveFlow<span>AI</span>
        </div>
        <label className="workspace-label">
          WORKSPACE
          <select
            aria-label="Workspace"
            value={workspace}
            onChange={(e) => {
              setWorkspace(e.target.value);
              setPage(1);
            }}
          >
            {me.memberships.map((m) => (
              <option key={m.workspaceId} value={m.workspaceId}>
                {m.workspace.name}
              </option>
            ))}
          </select>
        </label>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          <button
            className={tab === "inbox" ? "active" : ""}
            aria-current={tab === "inbox" ? "page" : undefined}
            onClick={() => setTab("inbox")}
          >
            <Inbox size={19} />
            Ticket inbox
          </button>
          <button
            className={tab === "activity" ? "active" : ""}
            aria-current={tab === "activity" ? "page" : undefined}
            onClick={() => setTab("activity")}
          >
            <Activity size={19} />
            Activity log
          </button>
          <button
            className={tab === "team" ? "active" : ""}
            aria-current={tab === "team" ? "page" : undefined}
            onClick={() => setTab("team")}
          >
            <Users size={19} />
            People & workspaces
          </button>
          <button
            className={tab === "knowledge" ? "active" : ""}
            aria-current={tab === "knowledge" ? "page" : undefined}
            onClick={() => setTab("knowledge")}
          >
            <BookOpen size={19} />
            Knowledge base
          </button>
          <button
            className={tab === "reviews" ? "active" : ""}
            aria-current={tab === "reviews" ? "page" : undefined}
            onClick={() => setTab("reviews")}
          >
            <ClipboardCheck size={19} />
            Review queue
          </button>
          <button
            className={tab === "workflows" ? "active" : ""}
            aria-current={tab === "workflows" ? "page" : undefined}
            onClick={() => setTab("workflows")}
          >
            <GitBranch size={19} />
            Workflows
          </button>
        </nav>
        <div className="sidebar-note">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            About ResolveFlow
          </a>
          <small>Support, with context.</small>
        </div>
        <button
          className="account"
          onClick={async () => {
            try {
              await api("/auth/logout", "POST");
              setMe(null);
              setTickets([]);
              setWorkspace("");
              navigate("/signin");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <span className="avatar">{me.name[0]}</span>
          <span>
            {me.name}
            <small>Sign out</small>
          </span>
          <LogOut size={16} />
        </button>
      </aside>
      <main className="content">
        <header>
          <span className="workspace-breadcrumb">
            Workspace <span className="slash">/</span>{" "}
            {tab === "inbox"
              ? "Ticket inbox"
              : tab === "team"
                ? "People & workspaces"
                : tab === "knowledge"
                  ? "Knowledge base"
                  : tab === "reviews"
                    ? "Review queue"
                    : tab === "workflows"
                      ? "Workflows"
                      : "Activity log"}
          </span>
          <div className="workspace-header-actions">
            <span className="secure">
              {
                me.memberships.find((m) => m.workspaceId === workspace)
                  ?.workspace.name
              }
            </span>
            <a
              className="workspace-home"
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigate("/");
              }}
            >
              <House size={14} aria-hidden="true" />
              Back to home
            </a>
          </div>
        </header>
        <section
          className="page"
          ref={pageRef}
          tabIndex={0}
          aria-label="Workspace content"
        >
          <div className="heading">
            <div>
              <h1>
                {tab === "inbox"
                  ? "Ticket inbox"
                  : tab === "team"
                    ? "People & workspaces"
                    : tab === "knowledge"
                      ? "Knowledge base"
                      : tab === "reviews"
                        ? "Review queue"
                        : tab === "workflows"
                          ? "Workflows"
                          : "Activity log"}
              </h1>
              <p>
                {tab === "inbox"
                  ? "Assign requests, keep notes, and work through the next reply."
                  : tab === "team"
                    ? "Invite teammates and manage what they can access."
                    : tab === "knowledge"
                      ? "Add and approve the policies your team uses to answer questions."
                      : tab === "reviews"
                        ? "Review the evidence before approving a response."
                        : "Follow the actions and outcomes recorded in this workspace."}
              </p>
            </div>
            {tab === "inbox" && writable && (
              <button className="primary" onClick={() => setModal(true)}>
                <Plus size={18} /> New ticket
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {tab === "workflows" ? (
            <Workflows
              key={workspace}
              workspace={workspace}
              role={
                me.memberships.find((m) => m.workspaceId === workspace)?.role ||
                ""
              }
              api={api}
            />
          ) : tab === "reviews" ? (
            <ReviewQueue
              key={workspace}
              workspace={workspace}
              writable={writable}
              api={api}
            />
          ) : tab === "knowledge" ? (
            <Knowledge
              key={workspace}
              workspace={workspace}
              role={
                me.memberships.find((m) => m.workspaceId === workspace)?.role ||
                ""
              }
              api={api}
            />
          ) : tab === "team" ? (
            <Team
              key={
                workspace +
                me.memberships.find((m) => m.workspaceId === workspace)?.role
              }
              workspace={workspace}
              role={
                me.memberships.find((m) => m.workspaceId === workspace)?.role ||
                ""
              }
              api={api}
              reload={loadMe}
            />
          ) : tab === "inbox" ? (
            <>
              <div className="inbox-context">
                <span>
                  <strong>{total}</strong> {total === 1 ? "ticket" : "tickets"}{" "}
                  matching your filters
                </span>
                <span>Replies need approval before delivery.</span>
              </div>
              <div className="inbox ticket-inbox" aria-busy={loading}>
                <div className="toolbar">
                  <div className="tabs">
                    {["", "OPEN", "PENDING", "RESOLVED"].map((s) => (
                      <button
                        key={s}
                        className={status === s ? "chosen" : ""}
                        onClick={() => {
                          setStatus(s);
                          setPage(1);
                        }}
                      >
                        {s ? s[0] + s.slice(1).toLowerCase() : "All tickets"}
                      </button>
                    ))}
                  </div>
                  <label className="search">
                    <Search size={17} />
                    <input
                      aria-label="Search tickets"
                      placeholder="Search by subject…"
                      value={q}
                      onChange={(e) => {
                        setQ(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>CONVERSATION</th>
                        <th>STATUS</th>
                        <th>PRIORITY</th>
                        <th>CREATED</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <button
                              className="ticket-link"
                              onClick={() => open(t.id)}
                            >
                              {t.subject}
                            </button>
                            <small>{t.customerEmail}</small>
                          </td>
                          <td>
                            <span className={"badge " + t.status.toLowerCase()}>
                              {t.status.toLowerCase()}
                            </span>
                          </td>
                          <td>
                            <span
                              className={"priority " + t.priority.toLowerCase()}
                            >
                              ●
                            </span>{" "}
                            {t.priority.toLowerCase()}
                          </td>
                          <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              aria-label={"Open " + t.subject}
                              className="icon-button"
                              onClick={() => open(t.id)}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!tickets.length && (
                  <div className="empty">
                    <Inbox size={34} />
                    <h3>
                      {loading
                        ? "Loading conversations…"
                        : "A clear inbox starts here."}
                    </h3>
                    <p>
                      {loading
                        ? "Getting your workspace tickets."
                        : q || status
                          ? "No tickets match these filters."
                          : "Create your first ticket to bring a conversation into the workspace."}
                    </p>
                  </div>
                )}
                <footer>
                  <span>
                    {total} matching tickets · Page {page}
                  </span>
                  <div>
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <button
                      disabled={page * 20 >= total}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </div>
            </>
          ) : (
            <div className="inbox activity">
              {events.length ? (
                events.map((e) => (
                  <article key={e.id}>
                    <Activity size={18} />
                    <div>
                      <strong>{e.action.replaceAll(".", " ")}</strong>
                      <small>{e.resourceId}</small>
                    </div>
                    <time>{new Date(e.createdAt).toLocaleString()}</time>
                  </article>
                ))
              ) : (
                <div className="empty">
                  No activity yet. Ticket changes will appear here.
                </div>
              )}
            </div>
          )}
          <div className="page-foot">
            ResolveFlow AI <span>Internal notes stay in your workspace.</span>
          </div>
        </section>
      </main>
      {modal && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            className="dialog"
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setModal(false)}
            >
              <X />
            </button>
            <span className="eyebrow">START A CONVERSATION</span>
            <h2 id="new-title">New ticket</h2>
            <form
              onSubmit={(e) =>
                submit(e, async (d) => {
                  await api(base + "/tickets", "POST", d);
                  setModal(false);
                  await refresh();
                })
              }
            >
              <label>
                Subject
                <input name="subject" required maxLength={200} />
              </label>
              <label>
                Customer email
                <input name="customerEmail" type="email" required />
              </label>
              <label>
                Priority
                <select name="priority">
                  <option>NORMAL</option>
                  <option>LOW</option>
                  <option>HIGH</option>
                  <option>URGENT</option>
                </select>
              </label>
              <label>
                Customer request
                <textarea name="body" required maxLength={20000} rows={5} />
              </label>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Creating…" : "Create ticket"}
              </button>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-title"
            className="dialog detail"
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <span className="eyebrow">CONVERSATION</span>
            <h2 id="ticket-title">{selected.subject}</h2>
            <p>{selected.customerEmail}</p>
            <div className="detail-controls">
              <label>
                Status
                <select
                  disabled={!writable}
                  aria-label="Status"
                  value={selected.status}
                  onChange={(e) => update({ status: e.target.value })}
                >
                  {["OPEN", "PENDING", "RESOLVED"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  disabled={!writable}
                  aria-label="Priority"
                  value={selected.priority}
                  onChange={(e) => update({ priority: e.target.value })}
                >
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Assignee
                <select
                  disabled={!writable}
                  aria-label="Assignee"
                  value={selected.assigneeId || ""}
                  onChange={(e) =>
                    update({ assigneeId: e.target.value || null })
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="messages">
              {selected.messages?.map((m, i) => (
                <article key={m.id}>
                  <span className="eyebrow">
                    {i === 0 ? "INITIAL REQUEST" : "INTERNAL NOTE"} ·{" "}
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                  <p>{m.body}</p>
                </article>
              ))}
            </div>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            {!!selected.deliveries?.length && (
              <section className="messages">
                <h3>Response delivery</h3>
                {selected.deliveries.map((d) => (
                  <article key={d.id}>
                    <span className="eyebrow">
                      {d.status === "LOCAL_CAPTURED"
                        ? "LOCAL CAPTURE · NO EMAIL SENT"
                        : d.status}{" "}
                      · VERSION {d.version}
                    </span>
                    <small>{d.recipient}</small>
                    <p>{d.body}</p>
                  </article>
                ))}
              </section>
            )}
            <Drafts
              key={workspace + selected.id}
              base={base}
              ticketId={selected.id}
              writable={writable}
              api={api}
            />
            {writable && (
              <form
                onSubmit={(e) =>
                  submit(e, async (d) => {
                    await api(
                      base + "/tickets/" + selected.id + "/messages",
                      "POST",
                      d,
                    );
                    await open(selected.id);
                  })
                }
              >
                <label>
                  Internal note
                  <textarea name="body" required rows={3} maxLength={20000} />
                </label>
                <button className="primary" disabled={busy}>
                  <Send size={16} /> Add note
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
