"use client";

import { useEffect, useRef, useState } from "react";
import { CardBackArtwork } from "@/components/CardBackArtwork";

type CardSpec = {
  id: string;
  depth: "far" | "mid" | "foreground";
  className: string;
  parallax: number;
  activeOnly?: boolean;
};

export type FloatingCardMode = "FLOATING" | "ACTIVE" | "PACK_BACKGROUND";
export type RevealPhase = "IDLE" | "SPIN" | "APPROACH" | "CARD_WIPE" | "PACK_ENTER" | "PACK_REVEAL" | "FLOW_SETTLE" | "SETTLED";

const CARDS: CardSpec[] = [
  { id: "far-left", depth: "far", className: "card-far-left", parallax: 2.5 },
  { id: "far-top", depth: "far", className: "card-far-top", parallax: 3 },
  { id: "mid-left", depth: "mid", className: "card-mid-left", parallax: 6 },
  { id: "mid-right", depth: "mid", className: "card-mid-right", parallax: 7 },
  { id: "front-left", depth: "foreground", className: "card-front-left", parallax: 14 },
];

const TRACK_CARDS: CardSpec[] = [
  ...CARDS,
  { id: "track-six", depth: "mid", className: "orbit-extra", parallax: 5, activeOnly: true },
  { id: "track-seven", depth: "far", className: "orbit-extra", parallax: 3, activeOnly: true },
  { id: "track-eight", depth: "mid", className: "orbit-extra", parallax: 6, activeOnly: true },
  { id: "track-nine", depth: "far", className: "orbit-extra", parallax: 3, activeOnly: true },
  { id: "track-ten", depth: "mid", className: "orbit-extra", parallax: 5, activeOnly: true },
  { id: "track-eleven", depth: "far", className: "orbit-extra", parallax: 2, activeOnly: true },
  { id: "track-twelve", depth: "mid", className: "orbit-extra", parallax: 6, activeOnly: true },
  { id: "track-thirteen", depth: "far", className: "orbit-extra", parallax: 3, activeOnly: true },
  { id: "track-fourteen", depth: "mid", className: "orbit-extra", parallax: 5, activeOnly: true },
  { id: "track-fifteen", depth: "far", className: "orbit-extra", parallax: 2, activeOnly: true },
];

export function FloatingCardScene({ mode = "FLOATING", revealPhase = "IDLE", revealSpeed = 1, revealPaused = false }: { mode?: FloatingCardMode; revealPhase?: RevealPhase; revealSpeed?: number; revealPaused?: boolean }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const orbitRefs = useRef<Array<HTMLDivElement | null>>([]);
  const wipeRef = useRef<HTMLDivElement>(null);
  const orbitAngle = useRef(0);
  const trackStart = useRef(0);
  const calmStart = useRef(0);
  const trackBases = useRef<Array<{ x: number; y: number; width: number; opacity: number }>>([]);
  const previousMode = useRef<FloatingCardMode>("FLOATING");
  const previousRevealPhase = useRef<RevealPhase>("IDLE");
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const [freeze, setFreeze] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  const [opacity, setOpacity] = useState(100);
  const [speed, setSpeed] = useState(100);
  const [parallax, setParallax] = useState(100);
  const [searchSpeed, setSearchSpeed] = useState(100);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const handlePointer = (event: PointerEvent) => {
      if (freeze || reducedMotion) return;
      target.current.x = event.clientX / window.innerWidth * 2 - 1;
      target.current.y = event.clientY / window.innerHeight * 2 - 1;
    };
    window.addEventListener("pointermove", handlePointer, { passive: true });
    let frame = 0;
    const update = () => {
      current.current.x += (target.current.x - current.current.x) * .045;
      current.current.y += (target.current.y - current.current.y) * .045;
      sceneRef.current?.style.setProperty("--mouse-x", current.current.x.toFixed(4));
      sceneRef.current?.style.setProperty("--mouse-y", current.current.y.toFixed(4));
      frame = requestAnimationFrame(update);
    };
    if (!freeze && !reducedMotion) frame = requestAnimationFrame(update);
    return () => {
      window.removeEventListener("pointermove", handlePointer);
      cancelAnimationFrame(frame);
    };
  }, [freeze]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (mode === "FLOATING") {
      cardRefs.current.forEach((card) => {
        if (!card) return;
        card.style.removeProperty("opacity");
        card.style.removeProperty("filter");
        card.style.removeProperty("z-index");
      });
      orbitRefs.current.forEach((orbit) => orbit?.style.removeProperty("transform"));
      trackBases.current = [];
      previousMode.current = mode;
      return;
    }

    const priorMode = previousMode.current;
    const enteringTrack = priorMode === "FLOATING" || trackBases.current.length !== TRACK_CARDS.length;
    if (enteringTrack) {
      trackBases.current = cardRefs.current.map((card) => {
        if (!card) return { x: window.innerWidth / 2, y: window.innerHeight / 2, width: 150, opacity: 0 };
        const rect = card.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width || 150,
          opacity: Number.parseFloat(window.getComputedStyle(card).opacity) || 0,
        };
      });
      trackStart.current = performance.now();
    }
    if (revealPhase === "SPIN" && previousRevealPhase.current !== "SPIN") {
      trackStart.current = performance.now();
    }
    if (priorMode === "ACTIVE" && mode === "PACK_BACKGROUND") calmStart.current = performance.now();
    previousMode.current = mode;
    previousRevealPhase.current = revealPhase;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sparkleNodes = Array.from(scene.querySelectorAll<HTMLElement>(".active-card-sparkles i"));
    const coreGlow = scene.querySelector<HTMLElement>(".vortex-core-glow");
    let frame = 0;
    let lastTime = performance.now();

    const renderTrack = (now: number) => {
      const delta = Math.min(40, now - lastTime);
      lastTime = now;
      const isActive = mode === "ACTIVE";
      const isAnalyzing = isActive && revealPhase === "IDLE";
      const phasePauseTime: Partial<Record<RevealPhase, number>> = { APPROACH: 1.1, CARD_WIPE: 1.3, PACK_ENTER: 1.34, PACK_REVEAL: 1.48, FLOW_SETTLE: 1.7, SETTLED: 2.2 };
      const rawActiveElapsed = Math.max(0, (now - trackStart.current) / 1000) * revealSpeed;
      const activeElapsed = isAnalyzing ? Math.min(rawActiveElapsed, 1) : revealPaused ? phasePauseTime[revealPhase] ?? rawActiveElapsed : rawActiveElapsed;
      const acceleration = isActive ? Math.min(1, activeElapsed / 1.1) : 1;
      const activeEnergy = acceleration * acceleration * (3 - 2 * acceleration);
      const calmProgress = isActive ? 0 : Math.min(1, Math.max(0, (now - calmStart.current) / 560));
      const energy = isActive ? activeEnergy : 1 - calmProgress * .88;
      const motionEnergy = isAnalyzing ? Math.min(energy, .42) : energy;
      const flowSettle = isActive ? Math.min(1, Math.max(0, (activeElapsed - 1.7) / .5)) : 1;
      const turnsPerSecond = isAnalyzing ? .38 : isActive ? (.28 + energy * energy * 2.65) * (1 - flowSettle * .78) : .42;
      if (!freeze && !revealPaused && !reducedMotion) orbitAngle.current += delta / 1000 * revealSpeed * turnsPerSecond * Math.PI * 2 * (searchSpeed / 100);

      const width = window.innerWidth;
      const height = window.innerHeight;
      const centerX = width * .5;
      const centerY = height * .5;
      const join = reducedMotion ? 1 : Math.min(1, (now - trackStart.current) * revealSpeed / 360);
      const easedJoin = 1 - Math.pow(1 - join, 3);
      const trackPoints: Array<{ x: number; y: number; near: number }> = [];
      let wipeSource: { x: number; y: number; scale: number } | null = null;

      TRACK_CARDS.forEach((cardSpec, index) => {
        const card = cardRefs.current[index];
        const orbit = orbitRefs.current[index];
        const base = trackBases.current[index];
        if (!card || !orbit || !base) return;

        const spacingNoise = Math.sin(index * 12.9898) * .27 + Math.cos(index * 5.317) * .12;
        const flowVariation = 1 + Math.sin(index * 2.11) * .045;
        const angle = orbitAngle.current * flowVariation + index / TRACK_CARDS.length * Math.PI * 2 + spacingNoise;
        const near = (Math.sin(angle * .92 + index * .41) + 1) / 2;
        const radiusNoise = 1 + Math.sin(index * 1.73) * .24 + Math.sin(angle * 2.2 + index) * .12;
        const expandingRadius = (1 + motionEnergy * .12) * (1 + flowSettle * .28);
        const backgroundSpread = isActive ? 1 : 1 + calmProgress * .28;
        const radiusX = width * .31 * radiusNoise * expandingRadius * backgroundSpread;
        const radiusY = height * .235 * (1 + Math.cos(index * 1.31) * .1) * expandingRadius * backgroundSpread;
        const targetX = centerX + Math.cos(angle) * radiusX + Math.sin(angle * 2.4 + index) * width * .032 * motionEnergy;
        const targetY = centerY + Math.sin(angle) * radiusY + Math.cos(angle * 1.7 + index) * height * .05 * motionEnergy + Math.sin(index * 2.4) * height * .028;
        const foregroundBoost = index % 8 === 0 ? 28 : 0;
        const desiredWidth = isActive ? 50 + near * 72 + foregroundBoost : 50 + near * 54;
        const targetScale = desiredWidth / Math.max(base.width, 1);
        const extraDelay = cardSpec.activeOnly ? .18 + (index - CARDS.length) * .035 : 0;
        const cardJoin = cardSpec.activeOnly
          ? Math.min(1, Math.max(0, (activeElapsed - extraDelay) / .28))
          : easedJoin;
        const translateX = (targetX - base.x) * cardJoin;
        const translateY = (targetY - base.y) * cardJoin;
        const translateZ = ((near - .5) * (isActive ? 150 : 80)) * cardJoin;
        const scale = 1 + (targetScale - 1) * cardJoin;
        const tiltX = Math.cos(angle * 1.35 + index) * 4 * cardJoin;
        const tiltY = Math.sin(angle + index * .37) * 8 * cardJoin;
        const tiltZ = Math.cos(angle + index * .61) * 3.5 * cardJoin;
        const backgroundCopyFade = !isActive && cardSpec.activeOnly ? 1 - calmProgress : 1;
        const wipeTakeover = index === 5 ? Math.min(1, Math.max(0, (activeElapsed - 1.1) / .12)) : 0;
        const targetOpacity = (isActive ? (.3 + near * .56) * (1 - flowSettle * .7) : .055 + near * .16) * backgroundCopyFade * (1 - wipeTakeover);
        const opacity = cardSpec.activeOnly
          ? targetOpacity * cardJoin
          : base.opacity + (targetOpacity - base.opacity) * easedJoin;
        const speedBlur = isActive ? motionEnergy * (.35 + index % 3 * .32) : .25;
        const blur = speedBlur + (1 - near) * (isActive ? 1.2 : 2.5) + flowSettle * .5;
        const trailDistance = 7 + motionEnergy * 30;
        const trailX = Math.sin(angle) * trailDistance;
        const trailY = -Math.cos(angle) * trailDistance * .62;
        const trailOpacity = isActive ? Math.max(0, motionEnergy - .15) * .17 * (1 - flowSettle * .7) * (1 - wipeTakeover) : 0;

        orbit.style.transform = `translate3d(${translateX.toFixed(2)}px,${translateY.toFixed(2)}px,${translateZ.toFixed(2)}px) scale(${scale.toFixed(4)}) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) rotateZ(${tiltZ.toFixed(2)}deg)`;
        orbit.style.setProperty("--trail-x", `${trailX.toFixed(2)}px`);
        orbit.style.setProperty("--trail-y", `${trailY.toFixed(2)}px`);
        orbit.style.setProperty("--trail-x2", `${(trailX * 1.85).toFixed(2)}px`);
        orbit.style.setProperty("--trail-y2", `${(trailY * 1.85).toFixed(2)}px`);
        orbit.style.setProperty("--trail-opacity", trailOpacity.toFixed(3));
        orbit.style.setProperty("--trail-opacity2", (trailOpacity * .55).toFixed(3));
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = `blur(${blur.toFixed(2)}px) saturate(${isActive ? 1.04 : .94})`;
        card.style.zIndex = String(2 + Math.round(near * 20));
        if (index === 5) wipeSource = { x: targetX, y: targetY, scale: Math.max(.72, desiredWidth / 112) };
        trackPoints.push({ x: targetX, y: targetY, near });
      });

      const wipe = wipeRef.current;
      if (wipe && wipeSource && isActive && activeElapsed >= 1.08 && activeElapsed <= 1.72) {
        const approach = Math.min(1, Math.max(0, (activeElapsed - 1.1) / .2));
        const cross = Math.min(1, Math.max(0, (activeElapsed - 1.3) / .18));
        const exit = Math.min(1, Math.max(0, (activeElapsed - 1.48) / .22));
        const approachEase = 1 - Math.pow(1 - approach, 3);
        const crossEase = cross * cross * (3 - 2 * cross);
        const exitEase = exit * exit;
        const source = wipeSource as { x: number; y: number; scale: number };
        const nearX = centerX + width * .12;
        const nearY = centerY - height * .07;
        const coverX = centerX - width * .08;
        const coverY = centerY - height * .03;
        const x = source.x + (nearX - source.x) * approachEase + (coverX - nearX) * crossEase + (-width * .78 - coverX) * exitEase;
        const y = source.y + (nearY - source.y) * approachEase + (coverY - nearY) * crossEase + (height * .22) * exitEase;
        const wipeScale = source.scale + (1.8 - source.scale) * approachEase + 1.7 * crossEase + .55 * exitEase;
        const wipeRotation = -4 + approachEase * 7 - crossEase * 10 - exitEase * 3;
        wipe.style.opacity = String(Math.min(1, approach * 1.8) * (1 - Math.max(0, exit - .72) / .28));
        wipe.style.transform = `translate3d(${(x - 56).toFixed(2)}px,${(y - 80).toFixed(2)}px,420px) scale(${wipeScale.toFixed(3)}) rotateZ(${wipeRotation.toFixed(2)}deg)`;
        wipe.style.filter = `blur(${(crossEase * .7 + exitEase * 2.4).toFixed(2)}px) drop-shadow(18px 24px 18px rgba(18,40,91,.25))`;
        wipe.style.setProperty("--wipe-trail", `${(-22 - crossEase * 32).toFixed(2)}px`);
      } else if (wipe) {
        wipe.style.opacity = "0";
      }

      sparkleNodes.forEach((sparkle, index) => {
        const point = trackPoints[(index * 2 + 1) % trackPoints.length];
        if (!point) return;
        const sparkleCount = isActive ? Math.max(3, Math.min(5, Math.floor(3 + motionEnergy * 2))) : Math.max(0, 2 - Math.floor(calmProgress * 3));
        sparkle.style.left = `${point.x + (index % 2 ? -18 : 20)}px`;
        sparkle.style.top = `${point.y + (index < 3 ? -25 : 22)}px`;
        sparkle.style.right = "auto";
        sparkle.style.bottom = "auto";
        sparkle.style.display = index < sparkleCount ? "block" : "none";
      });
      if (coreGlow) coreGlow.style.opacity = isActive ? String(Math.max(0, motionEnergy - .72) * .72) : "0";
      scene.style.setProperty("--vortex-energy", motionEnergy.toFixed(3));

      frame = window.requestAnimationFrame(renderTrack);
    };

    frame = window.requestAnimationFrame(renderTrack);
    return () => window.cancelAnimationFrame(frame);
  }, [mode, revealPhase, revealSpeed, revealPaused, freeze, searchSpeed]);

  return <>
    <div
      ref={sceneRef}
      className={`floating-card-scene mode-${mode.toLowerCase().replaceAll("_", "-")} reveal-${revealPhase.toLowerCase().replaceAll("_", "-")} ${freeze || revealPaused ? "cards-frozen" : ""} ${revealPaused ? "reveal-debug-paused" : ""} ${showSafeZone ? "show-card-safe-zone" : ""}`}
      style={{
        "--card-opacity": opacity / 100,
        "--float-speed": 100 / speed,
        "--parallax-strength": parallax / 100,
        "--search-speed": 100 / searchSpeed,
        "--reveal-time-scale": 1 / revealSpeed,
      } as React.CSSProperties}
      aria-hidden="true"
    >
      {TRACK_CARDS.map((card, index) => <div
        key={card.id}
        ref={(node) => { cardRefs.current[index] = node; }}
        className={`floating-card ${card.depth} ${card.className} ${card.activeOnly ? "active-only-card" : ""}`}
        style={{ "--card-parallax": `${card.parallax}px` } as React.CSSProperties}
      >
        <div ref={(node) => { orbitRefs.current[index] = node; }} className="floating-card-orbit">
          <div className="card-motion-trail trail-two"><CardBackArtwork idPrefix={`trail-two-${card.id}`} /></div>
          <div className="card-motion-trail trail-one"><CardBackArtwork idPrefix={`trail-one-${card.id}`} /></div>
          <div className="floating-card-idle"><CardBackArtwork idPrefix={`floating-${card.id}`} /></div>
        </div>
      </div>)}
      <div className="active-card-sparkles" aria-hidden="true"><i>✦</i><i>✦</i><i>•</i><i>✦</i><i>•</i><i>✦</i><i>✦</i></div>
      <div className="vortex-core-glow" aria-hidden="true" />
      <div className="card-safe-zone"><span>CENTRAL SAFE ZONE</span></div>
    </div>

    <div ref={wipeRef} className="foreground-card-wipe" aria-hidden="true">
      <div className="foreground-wipe-ghost ghost-two"><CardBackArtwork idPrefix="wipe-ghost-two" /></div>
      <div className="foreground-wipe-ghost ghost-one"><CardBackArtwork idPrefix="wipe-ghost-one" /></div>
      <CardBackArtwork idPrefix="foreground-wipe" />
    </div>

    <aside className="card-scene-controls" aria-label="Floating card developer controls">
      <strong>CARD SCENE</strong>
      <label><span>CARD OPACITY</span><input type="range" min="35" max="120" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
      <label><span>FLOAT SPEED</span><input type="range" min="40" max="180" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} /></label>
      <label><span>PARALLAX</span><input type="range" min="0" max="150" value={parallax} onChange={(event) => setParallax(Number(event.target.value))} /></label>
      <label><span>ACTIVE SPEED</span><input type="range" min="65" max="165" value={searchSpeed} onChange={(event) => setSearchSpeed(Number(event.target.value))} /></label>
      <button type="button" aria-pressed={showSafeZone} onClick={() => setShowSafeZone((value) => !value)}><span>{showSafeZone ? "■" : "□"}</span> SHOW SAFE ZONE</button>
      <button type="button" aria-pressed={freeze} onClick={() => setFreeze((value) => !value)}><span>{freeze ? "■" : "□"}</span> FREEZE CARDS</button>
    </aside>
  </>;
}
