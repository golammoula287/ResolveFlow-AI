import { useState } from "react";
import { Layers, Menu, X } from "lucide-react";
import "./home.css";
type Props = { signedIn: boolean; navigate: (path: string) => void };
const views = [
  {
    id: "inbox",
    name: "The inbox",
    image: "/product-inbox.png",
    alt: "ResolveFlow ticket inbox with synthetic demo records",
    caption: "Keep the conversation, its owner, and its next step together.",
  },
  {
    id: "knowledge",
    name: "The knowledge",
    image: "/product-knowledge.png",
    alt: "ResolveFlow knowledge base showing an approved fictional refund policy",
    caption: "Give your team a source to check, not just an answer to copy.",
  },
  {
    id: "review",
    name: "The review",
    image: "/product-review.png",
    alt: "ResolveFlow review queue showing a human-written demo response approved at a specific version",
    caption: "Review the actual words. Approve the version you stand behind.",
  },
];
export function Home({ signedIn, navigate }: Props) {
  const [menu, setMenu] = useState(false),
    [view, setView] = useState("inbox");
  const active = views.find((v) => v.id === view)!;
  const start = signedIn ? "/app" : "/signup";
  function go(path: string) {
    return (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      setMenu(false);
      navigate(path);
    };
  }
  return (
    <div className="marketing">
      <a className="home-skip" href="#home-main">
        Skip to content
      </a>
      <header className="home-header">
        <a
          className="home-brand"
          href="/"
          onClick={go("/")}
          aria-label="ResolveFlow AI home"
        >
          <Layers size={24} />
          <span>
            ResolveFlow<span className="home-brand-ai"> AI</span>
          </span>
        </a>
        <button
          className="home-menu"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          aria-controls="home-nav"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav
          id="home-nav"
          className={menu ? "home-nav expanded" : "home-nav"}
          aria-label="Main navigation"
        >
          <a href="#features" onClick={() => setMenu(false)}>
            Product
          </a>
          <a href="#workflow" onClick={() => setMenu(false)}>
            How it works
          </a>
          <a href="#faq" onClick={() => setMenu(false)}>
            FAQ
          </a>
        </nav>
        <div className="home-account">
          {signedIn ? (
            <a className="home-button small" href="/app" onClick={go("/app")}>
              Open workspace
            </a>
          ) : (
            <>
              <a className="home-signin" href="/signin" onClick={go("/signin")}>
                Sign in
              </a>
              <a
                className="home-button small"
                href="/signup"
                onClick={go("/signup")}
              >
                Get started
              </a>
            </>
          )}
        </div>
      </header>
      <main id="home-main">
        <section className="home-container home-hero">
          <div className="home-hero-title">
            <span className="home-label">THE SUPPORT WORKSPACE</span>
            <h1>
              Your support team,
              <br />
              <em>on the same page.</em>
            </h1>
          </div>
          <div className="home-hero-copy">
            <p>
              Bring tickets, team knowledge, and response reviews together. Keep
              the work organized while your people make the decisions.
            </p>
            <a className="home-button" href={start} onClick={go(start)}>
              {signedIn ? "Open your workspace" : "Create your workspace"}
            </a>
            <a className="home-text-link" href="#workflow">
              See how it works
            </a>
          </div>
          <div className="home-hero-bottom">
            <span>For the people behind the reply.</span>
            <span>
              Shared inbox <i />
              Source-backed responses <i />
              Human approval
            </span>
          </div>
        </section>
        <section
          id="features"
          className="home-container home-product"
          aria-labelledby="product-title"
        >
          <div className="home-product-bar">
            <h2 id="product-title">A closer look at the product.</h2>
            <div
              className="home-product-tabs"
              role="tablist"
              aria-label="Product preview"
            >
              {views.map((v) => (
                <button
                  key={v.id}
                  id={"tab-" + v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  aria-controls="product-panel"
                  tabIndex={view === v.id ? 0 : -1}
                  onClick={() => setView(v.id)}
                  onKeyDown={(e) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        e.key,
                      )
                    )
                      return;
                    e.preventDefault();
                    const i = views.findIndex((item) => item.id === view);
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? views.length - 1
                          : (i +
                              (e.key === "ArrowRight" ? 1 : -1) +
                              views.length) %
                            views.length;
                    setView(views[next].id);
                    document.getElementById("tab-" + views[next].id)?.focus();
                  }}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </div>
          <div
            className="home-screen-frame"
            id="product-panel"
            role="tabpanel"
            aria-labelledby={"tab-" + view}
          >
            <div className="home-screen-top">
              <span className="home-window-dots">
                <i />
                <i />
                <i />
              </span>
              <span>ResolveFlow / {active.name.toLowerCase()}</span>
              <span className="home-screen-demo">DEMO WORKSPACE</span>
            </div>
            <div className="home-screen-image">
              <img
                key={active.id}
                src={active.image}
                alt={active.alt}
                width="1440"
                height="1000"
                fetchPriority={view === "inbox" ? "high" : "auto"}
              />
            </div>
          </div>
          <div className="home-screen-caption">
            <p>{active.caption}</p>
            <span>Actual product screenshots. Synthetic demo data.</span>
          </div>
        </section>
        <section className="home-container home-details">
          <div className="home-section-intro">
            <span className="home-label">THE DAILY WORK, CONSIDERED</span>
            <h2>
              A useful place for
              <br />
              <em>the whole conversation.</em>
            </h2>
            <p>
              Support work has a lot of moving parts. The workspace should help
              you see them.
            </p>
          </div>
          <div className="home-detail-list">
            <article>
              <span>01</span>
              <div>
                <h3>Know who’s taking care of it.</h3>
                <p>
                  Assign requests, set priorities, and keep internal notes with
                  the ticket. Find the context you need without starting the
                  conversation over.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Keep the source within reach.</h3>
                <p>
                  Search approved policies and documents. Use an AI suggestion
                  or write your own response, then inspect the evidence before
                  making the call.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Be deliberate about what goes out.</h3>
                <p>
                  Review, edit, and approve a response before delivery. Keep its
                  previous versions and the decisions that shaped the final
                  reply.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section id="workflow" className="home-workflow">
          <div className="home-container">
            <div className="home-workflow-heading">
              <span className="home-label">HOW IT WORKS</span>
              <h2>
                A request comes in.
                <br />
                <em>You know what happens next.</em>
              </h2>
              <p>Four steps, with a person making the important decisions.</p>
            </div>
            <div className="home-steps">
              {[
                {
                  n: "01",
                  title: "Bring the request in",
                  text: "Give it a ticket, a priority, and someone to look after it.",
                },
                {
                  n: "02",
                  title: "Check the knowledge",
                  text: "Find an approved passage that actually supports the answer.",
                },
                {
                  n: "03",
                  title: "Review the response",
                  text: "Make your edits. Approve the precise version you intend to use.",
                },
                {
                  n: "04",
                  title: "Confirm delivery",
                  text: "Queue the approved reply, then follow its attempts and outcome.",
                },
              ].map((s) => (
                <article key={s.n}>
                  <span>{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
            <p className="home-workflow-footnote">
              AI suggests. Your team reviews. Sending a reply requires a
              separate confirmation.
            </p>
          </div>
        </section>
        <section className="home-container home-team">
          <div className="home-team-note">
            <span className="home-label">A NOTE ON CONTROL</span>
            <p>
              Software can help with the work.
              <br />
              <em>The judgment stays with you.</em>
            </p>
          </div>
          <div className="home-team-copy">
            <p>
              Each workspace has its own tickets, knowledge, and people. Owners
              manage access, agents handle requests, and viewers follow the
              work.
            </p>
            <p>
              If a response changes, its approval is cleared. If a source is
              withdrawn, the response needs another review. The history stays
              there for your team to inspect.
            </p>
            <div className="home-role-line">
              <span>Owner</span>
              <span>Agent</span>
              <span>Viewer</span>
            </div>
          </div>
        </section>
        <section id="faq" className="home-container home-faq">
          <div>
            <span className="home-label">BEFORE YOU START</span>
            <h2>
              A few practical
              <br />
              <em>questions.</em>
            </h2>
          </div>
          <div className="home-faq-list">
            <details>
              <summary>Does AI send customer replies automatically?</summary>
              <p>
                No. AI creates an internal draft from approved evidence. Your
                team reviews the response and separately confirms delivery
                before it enters the queue.
              </p>
            </details>
            <details>
              <summary>Can I work without AI?</summary>
              <p>
                Yes. Write a manual response, attach approved source passages,
                and submit it for review. Human-written responses are labelled
                separately from AI-generated drafts.
              </p>
            </details>
            <details>
              <summary>Can businesses have separate workspaces?</summary>
              <p>
                Yes. Tickets, documents, drafts, and workflows are scoped to a
                workspace. Access depends on the person’s current membership and
                role.
              </p>
            </details>
            <details>
              <summary>What do I need to get started?</summary>
              <p>
                Create a workspace and add your team and approved text or
                Markdown policies. AI generation and email delivery work when
                their service connections are configured.
              </p>
            </details>
          </div>
        </section>
        <section className="home-container home-final">
          <div>
            <span className="home-label">GIVE YOUR TEAM A CLEARER WORKDAY</span>
            <h2>
              Good support.
              <br />
              <em>In good hands.</em>
            </h2>
          </div>
          <a className="home-button" href={start} onClick={go(start)}>
            {signedIn ? "Open your workspace" : "Create your workspace"}
          </a>
        </section>
      </main>
      <footer className="home-footer home-container">
        <a className="home-brand" href="/" onClick={go("/")}>
          <Layers size={21} />
          <span>
            ResolveFlow<span className="home-brand-ai"> AI</span>
          </span>
        </a>
        <span>Built around the conversation.</span>
        <div>
          <a href="#features">Product</a>
          <a href="#faq">FAQ</a>
          <a
            href={signedIn ? "/app" : "/signin"}
            onClick={go(signedIn ? "/app" : "/signin")}
          >
            {signedIn ? "Workspace" : "Sign in"}
          </a>
        </div>
        <small>© 2026 ResolveFlow AI</small>
      </footer>
    </div>
  );
}
