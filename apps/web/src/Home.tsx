import { LogoMark } from "./LogoMark";
import { SupportVisual } from "./SupportVisual";
import { useLayoutEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import "./home.css";
type Props = { signedIn: boolean; navigate: (path: string) => void };
const views = [
  {
    id: "inbox",
    name: "The inbox",
    image: "/product-inbox.png",
    alt: "Ticket inbox with fictional demo requests",
    caption:
      "Every request has an owner, a priority, and a place to pick up the conversation.",
  },
  {
    id: "knowledge",
    name: "The knowledge",
    image: "/product-knowledge.png",
    alt: "Knowledge base with a fictional approved refund policy",
    caption:
      "Your policies are the source. Approve documents before they become evidence for a reply.",
  },
  {
    id: "review",
    name: "The review",
    image: "/product-review.png",
    alt: "Human-written demo response awaiting review with source citations",
    caption:
      "Read the reply alongside its sources. Edit it, then approve the version you want to send.",
  },
];
export function Home({ signedIn, navigate }: Props) {
  const [menu, setMenu] = useState(false);
  const [view, setView] = useState(0);
  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>(".marketing");
    const sections = page?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!page || !sections?.length) return;
    const motionAllowed = window.matchMedia(
      "(prefers-reduced-motion: no-preference)",
    ).matches;
    if (!motionAllowed || !("IntersectionObserver" in window)) {
      sections.forEach((section) => section.classList.add("is-visible"));
      return;
    }
    page.classList.add("reveal-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -7% 0px" },
    );
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top < window.innerHeight * 0.9)
        section.classList.add("is-visible");
      else observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);
  const active = views[view];
  const previewRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    previewRef.current?.scrollTo({ top: 0 });
  }, [view]);
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
          <LogoMark />
          <span>
            ResolveFlow<span className="home-brand-ai">AI</span>
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
          <div className="home-hero-copy">
            <span className="home-kicker">
              <span /> A workspace for customer support
            </span>
            <h1>
              A good reply starts
              <br />
              with the <em>right context.</em>
            </h1>
            <p>
              The ticket, the policy, the person who can help. Keep them
              together, and give your team a useful first draft to work with.
            </p>
            <div className="home-hero-actions">
              <a className="home-button" href={start} onClick={go(start)}>
                {signedIn ? "Open your workspace" : "Create your workspace"}
              </a>
              <a className="home-text-link" href="#workflow">
                See how it works
              </a>
            </div>
            <p className="home-small-note">
              AI helps with the draft. Your team has the final say.
            </p>
          </div>
          <SupportVisual />
        </section>
        <section
          id="features"
          className="home-container home-product"
          aria-labelledby="product-title"
          data-reveal
        >
          <div className="home-section-top">
            <div>
              <span className="home-section-label">Inside the workspace</span>
              <h2 id="product-title">Less hunting for context.</h2>
            </div>
            <p>
              One place to work through a request,
              <br />
              from the first note to the reviewed reply.
            </p>
          </div>
          <div
            className="home-product-tabs"
            role="tablist"
            aria-label="Product preview"
          >
            {views.map((v, i) => (
              <button
                key={v.id}
                id={"tab-" + v.id}
                role="tab"
                aria-selected={view === i}
                aria-controls="product-panel"
                tabIndex={view === i ? 0 : -1}
                onClick={() => setView(i)}
                onKeyDown={(e) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? views.length - 1
                        : (view +
                            (e.key === "ArrowRight" ? 1 : -1) +
                            views.length) %
                          views.length;
                  setView(next);
                  document.getElementById("tab-" + views[next].id)?.focus();
                }}
              >
                <span aria-hidden="true">0{i + 1}</span>
                {v.name}
              </button>
            ))}
          </div>
          <div
            className="home-screen-frame"
            id="product-panel"
            role="tabpanel"
            aria-labelledby={"tab-" + active.id}
          >
            <div className="home-screen-top">
              <span>ResolveFlow / Demo workspace</span>
              <span>Product preview</span>
            </div>
            <div className="home-screen-image" ref={previewRef}>
              {views.map((item, index) => (
                <img
                  key={item.id}
                  src={item.image}
                  alt={item.alt}
                  hidden={view !== index}
                  width="1440"
                  height="1000"
                  fetchPriority={index === 0 ? "high" : "auto"}
                />
              ))}
            </div>
          </div>
          <div className="home-screen-caption">
            <p>{active.caption}</p>
            <span>Actual product screenshots. Synthetic demo data.</span>
          </div>
        </section>
        <section
          id="workflow"
          className="home-container home-workflow"
          data-reveal
        >
          <div className="home-workflow-intro">
            <span className="home-section-label">
              A typical support request
            </span>
            <h2>
              From “can you help?”
              <br />
              to a considered reply.
            </h2>
            <p>
              You don’t need to hand the whole conversation to AI. Use it for a
              first draft, and keep the decisions with your team.
            </p>
            <div className="home-margin-note">
              A source is useful.
              <br />
              <em>A person checks the details.</em>
            </div>
          </div>
          <div className="home-process">
            {[
              [
                "Bring the request in",
                "Create a ticket with the customer’s question and email, or connect an intake webhook. Assign the person who will handle it.",
              ],
              [
                "Draft with something to back it up",
                "Search your approved policies. Generate a draft with cited passages, or write a response yourself.",
              ],
              [
                "Check it. Then send it.",
                "Read the sources, make your edits, and approve the reply. Confirm delivery separately and follow its status.",
              ],
            ].map(([title, text], i) => (
              <article key={title}>
                <span className="process-number">{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
            <p className="home-delivery-note">
              Email delivery needs a configured email service. Local demo mode
              saves a capture instead.
            </p>
          </div>
        </section>
        <section id="faq" className="home-container home-faq" data-reveal>
          <div>
            <span className="home-section-label">The practical bits</span>
            <h2>Before you start.</h2>
            <p>
              A few things worth knowing
              <br />
              about the way it works.
            </p>
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
                separately.
              </p>
            </details>
            <details>
              <summary>Can businesses have separate workspaces?</summary>
              <p>
                Yes. Each workspace has its own tickets, documents, and team.
                Owners manage access, agents handle requests, and viewers have
                read-only access.
              </p>
            </details>
            <details>
              <summary>How do customers submit a question?</summary>
              <p>
                Your team can create tickets manually, or connect a website or
                service through the ticket webhook. A public customer form and
                email inbox intake are not included yet.
              </p>
            </details>
            <details>
              <summary>What do I need to get started?</summary>
              <p>
                Create a workspace and add your policies as text or Markdown.
                Set up the AI and email service connections when you want to
                generate drafts and send email.
              </p>
            </details>
          </div>
        </section>
        <section className="home-container home-final" data-reveal>
          <div>
            <span className="home-section-label">
              Start with your next request
            </span>
            <h2>
              Give it a place.
              <br />
              Take it from there.
            </h2>
          </div>
          <div>
            <a className="home-button" href={start} onClick={go(start)}>
              {signedIn ? "Open your workspace" : "Create your workspace"}
            </a>
            <p>Bring a policy. Add a ticket. Try a draft.</p>
          </div>
        </section>
      </main>
      <footer className="home-footer home-container">
        <a className="home-brand" href="/" onClick={go("/")}>
          <LogoMark />
          <span>ResolveFlow</span>
        </a>
        <span>Customer support, with context.</span>
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
