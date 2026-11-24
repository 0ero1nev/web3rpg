"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./NewtonStoryReport.css";

export type PersonaStoryReportData = {
  match: number;
  screens: Array<{
    id: string;
    chapter: string;
    eyebrow?: string;
    headline: string[];
    body: string[];
    fact?: string;
    footer?: string[];
    eventId?: string;
  }>;
};

type NewtonStoryReportProps = {
  story: PersonaStoryReportData;
  onExit?: () => void;
  embedded?: boolean;
  scrollNavigation?: boolean;
  personaName?: string;
  shareTagline?: string;
};

function shareText(story: PersonaStoryReportData, personaName: string, shareTagline: string): string {
  return [
    `I trade like ${personaName} — ${Math.round(story.match)}% match.`,
    shareTagline,
    "ONCHAIN PERSONA",
  ].join("\n");
}

export function NewtonStoryReport({
  story,
  onExit,
  embedded = false,
  scrollNavigation = false,
  personaName = "Isaac Newton",
  shareTagline = "Smart enough to leave. Human enough to come back.",
}: NewtonStoryReportProps) {
  const [index, setIndex] = useState(0);
  const [shareStatus, setShareStatus] = useState<"IDLE" | "SHARED" | "COPIED">("IDLE");
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLElement>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigationLockedUntil = useRef(0);
  const [leaving, setLeaving] = useState(false);
  // The intro screen was removed from the model, but cached results (browser
  // localStorage and the server profile cache) can still carry it.
  const screens = story.screens.filter((item) => (item.id as string) !== "intro");
  const lastIndex = screens.length - 1;
  const screen = screens[index];

  const move = useCallback((direction: number) => {
    if (!scrollNavigation) {
      setIndex((current) => Math.max(0, Math.min(lastIndex, current + direction)));
      return;
    }
    if (Date.now() < navigationLockedUntil.current) return;
    const target = Math.max(0, Math.min(lastIndex, index + direction));
    if (target === index) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    navigationLockedUntil.current = Date.now() + (reducedMotion ? 250 : 900);
    if (reducedMotion) { setIndex(target); return; }
    setLeaving(true);
    transitionTimer.current = setTimeout(() => {
      setIndex(target);
      setLeaving(false);
      transitionTimer.current = null;
    }, 420);
  }, [index, lastIndex, scrollNavigation]);
  const previous = useCallback(() => move(-1), [move]);
  const next = useCallback(() => move(1), [move]);

  useEffect(() => () => {
    if (transitionTimer.current !== null) clearTimeout(transitionTimer.current);
  }, []);

  useEffect(() => {
    if (!scrollNavigation) return;
    const element = root.current;
    let accumulated = 0;
    let lastWheel = 0;
    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = Date.now();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      if (now < navigationLockedUntil.current) {
        accumulated = 0;
        lastWheel = now;
        // Wait for momentum to settle before accepting another chapter.
        navigationLockedUntil.current = Math.max(navigationLockedUntil.current, now + 180);
        return;
      }
      if (now - lastWheel > 180 || Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
      lastWheel = now;
      accumulated += delta;
      if (Math.abs(accumulated) >= 52) {
        move(accumulated > 0 ? 1 : -1);
        accumulated = 0;
      }
    }
    element?.addEventListener("wheel", onWheel, { passive: false });
    return () => element?.removeEventListener("wheel", onWheel);
  }, [move, scrollNavigation]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (scrollNavigation) {
        if (event.key === "Escape") { onExit?.(); return; }
        if ((event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
        if (["ArrowDown", "PageDown", " ", "ArrowUp", "PageUp"].includes(event.key)) {
          event.preventDefault();
          if (["ArrowUp", "PageUp"].includes(event.key)) previous();
          else next();
          return;
        }
      }
      if (event.key === "ArrowRight" || event.key === "Enter") next();
      if (event.key === "ArrowLeft") previous();
      if (event.key === "Escape") onExit?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, onExit, previous, scrollNavigation]);

  async function share() {
    const text = shareText(story, personaName, shareTagline);
    if (navigator.share) {
      try {
        await navigator.share({ title: "My Onchain Persona", text });
        setShareStatus("SHARED");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareStatus("COPIED");
    } catch {
      setShareStatus("IDLE");
    }
  }

  return <section
    ref={root}
    className={`newton-story${embedded ? " newton-story--embedded" : ""} newton-story--${screen.id}${scrollNavigation ? " newton-story--scroll" : ""}`}
    aria-label={`${personaName} Persona Story Report`}
    onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
    onPointerCancel={() => { pointerStart.current = null; }}
    onPointerUp={(event) => {
      if (pointerStart.current === null) return;
      const dx = event.clientX - pointerStart.current.x;
      const dy = event.clientY - pointerStart.current.y;
      const distance = scrollNavigation && Math.abs(dy) > Math.abs(dx) ? dy : dx;
      pointerStart.current = null;
      if (Math.abs(distance) < 52) return;
      if (distance < 0) next();
      else previous();
    }}
  >
    <div className="newton-story__motif" aria-hidden="true" />
    <header className="newton-story__topline">
      <span>ONCHAIN PERSONA</span>
      <span aria-label={`Story screen ${index + 1} of ${screens.length}`}>{index + 1} / {screens.length}</span>
      {onExit
        ? <button type="button" onClick={onExit} aria-label="Back to Persona card">BACK TO CARD</button>
        : <span aria-hidden="true" />}
    </header>

    <article
      className={`newton-story__chapter${index < lastIndex ? " newton-story__chapter--interactive" : ""}${leaving ? " newton-story__chapter--leaving" : ""}`}
      key={`${screen.id}-${index}`}
      onClick={index < lastIndex ? next : undefined}
      role={index < lastIndex ? "button" : undefined}
      tabIndex={index < lastIndex ? 0 : undefined}
      onKeyDown={index < lastIndex ? (event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (scrollNavigation) event.stopPropagation();
          next();
        }
      } : undefined}
    >
      <p className="newton-story__chapter-label">{screen.chapter}</p>
      {screen.eyebrow && <p className="newton-story__eyebrow">{screen.eyebrow}</p>}
      {screen.id === "verdict" ? <>
        <div className="newton-story__body">
          {screen.body.map((line) => <p key={line}>{line}</p>)}
        </div>
        {screen.footer && <footer className="newton-story__footer">
          {screen.footer.map((line) => <p key={line}>{line}</p>)}
        </footer>}
        <h1>{screen.headline.map((line) => <span key={line}>{line}</span>)}</h1>
      </> : <>
        <h1>{screen.headline.map((line) => <span key={line}>{line}</span>)}</h1>
        {screen.body.length > 0 && <div className="newton-story__body">
          {screen.body.map((line) => <p key={line}>{line}</p>)}
        </div>}
        {screen.fact && <p className="newton-story__fact">
          {screen.fact.split("\n").map((line) => <span key={line}>{line}</span>)}
        </p>}
        {screen.footer && <footer className="newton-story__footer">
          {screen.footer.map((line) => <p key={line}>{line}</p>)}
        </footer>}
      </>}
    </article>

    <nav className="newton-story__nav" aria-label="Story navigation">
      <button className="newton-story__previous" type="button" onClick={previous} disabled={index === 0} aria-label="Previous chapter">←</button>
      <div className="newton-story__ticks" aria-hidden="true">
        {screens.map((item, itemIndex) => <i className={itemIndex === index ? "is-active" : ""} key={item.id} />)}
      </div>
      {index < lastIndex
        ? <button className="newton-story__continue" type="button" onClick={next}>CONTINUE <span>→</span></button>
        : <button className="newton-story__continue" type="button" onClick={share}>
            {shareStatus === "SHARED" ? "STORY SHARED" : shareStatus === "COPIED" ? "STORY COPIED" : "SHARE MY STORY"}
          </button>}
    </nav>
  </section>;
}
