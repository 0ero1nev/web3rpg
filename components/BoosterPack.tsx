"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardBackArtwork } from "@/components/CardBackArtwork";
import { PersonaCard } from "@/components/PersonaCard";
import type { PersonaCardData } from "@/types/persona";

export type CardRevealState =
  | "CARD_READY"
  | "CARD_DRAGGING"
  | "CARD_EXTRACTING"
  | "CARD_CENTERING"
  | "CARD_SUSPENSE"
  | "CARD_FLIPPING"
  | "CARD_REVEALED";

type BoosterPackProps = {
  entering: boolean;
  wallet: string;
  experience: "PACK_ENTERING" | "PACK_READY" | "TEARING" | "PACK_OPEN" | CardRevealState;
  card: PersonaCardData | null;
  onTearStart: () => void;
  onPackOpen: () => void;
  onTearReset: () => void;
  onCardStateChange: (state: CardRevealState) => void;
  onViewPersona: () => void;
};
type PackLayers = { base: boolean; wrinkles: boolean; specular: boolean; shine: boolean; shadow: boolean; text: boolean };

const PACK_WIDTH = 1000;
const PACK_HEIGHT = 1600;
const MASK_OVERLAP = 5;
const TEAR_PATH: ReadonlyArray<readonly [number, number]> = [
  [0, 200], [80, 195], [130, 214], [200, 203], [310, 203], [360, 224],
  [430, 208], [530, 208], [590, 189], [660, 219], [720, 205], [810, 205],
  [850, 221], [920, 197], [1000, 203],
];

function tearYAt(x: number) {
  for (let index = 1; index < TEAR_PATH.length; index += 1) {
    const [x1, y1] = TEAR_PATH[index - 1];
    const [x2, y2] = TEAR_PATH[index];
    if (x <= x2) return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  }
  return TEAR_PATH[TEAR_PATH.length - 1][1];
}

function pathFrom(frontX: number) {
  return [[frontX, tearYAt(frontX)] as [number, number], ...TEAR_PATH.filter(([x]) => x > frontX).map(([x, y]) => [x, y] as [number, number])];
}

function point([x, y]: [number, number], overlap = 0) {
  return `${(x / PACK_WIDTH) * 100}% ${((y + overlap) / PACK_HEIGHT) * 100}%`;
}

function progressiveBodyMask(frontX: number) {
  const path = pathFrom(frontX);
  const fold = Math.min(45, frontX, PACK_WIDTH - frontX);
  const foldTopX = Math.min(PACK_WIDTH, frontX + fold + MASK_OVERLAP);
  return `polygon(0% 0%, ${(foldTopX / PACK_WIDTH) * 100}% 0%, ${path.map((item) => point(item, -MASK_OVERLAP)).join(",")}, 100% 100%, 0% 100%)`;
}

function progressiveTopMask(frontX: number) {
  const path = pathFrom(frontX).reverse();
  const fold = Math.min(45, frontX, PACK_WIDTH - frontX);
  const foldTopX = Math.max(0, frontX + fold - MASK_OVERLAP);
  return `polygon(${(foldTopX / PACK_WIDTH) * 100}% 0%, 100% 0%, ${path.map((item) => point(item, MASK_OVERLAP)).join(",")})`;
}

function progressiveBandMask(frontX: number) {
  const path = pathFrom(frontX);
  return `polygon(${path.map((item) => point(item, -8)).join(",")}, ${[...path].reverse().map((item) => point(item, 8)).join(",")})`;
}

function shortPackWallet(wallet: string) {
  if (/^(dev|demo|test)/i.test(wallet)) return "DEV...PACK";
  if (wallet.length < 10) return wallet.toUpperCase();
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function walletHash(wallet: string) {
  let hash = 2166136261;
  for (let index = 0; index < wallet.length; index += 1) {
    hash ^= wallet.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function barcodeFromWallet(wallet: string) {
  let seed = walletHash(wallet);
  const guardBars = new Set([1, 2, 11, 12, 21, 22]);

  return Array.from({ length: 24 }, (_, index) => {
    seed = Math.imul(seed ^ (index + 17), 2246822519) >>> 0;
    const widthRoll = seed % 12;
    const gapRoll = (seed >>> 7) % 10;

    return {
      width: widthRoll < 6 ? 1 : widthRoll < 11 ? 2 : 3,
      gap: gapRoll < 2 ? .58 : gapRoll === 9 ? 2 : 1,
      guard: guardBars.has(index),
    };
  });
}

function resistantProgress(raw: number) {
  if (raw <= .15) return raw * .72;
  if (raw <= .75) return .108 + (raw - .15) * 1.02;
  return Math.min(1, .72 + (raw - .75) * 1.12);
}

const CARD_STATES: readonly CardRevealState[] = ["CARD_READY", "CARD_DRAGGING", "CARD_EXTRACTING", "CARD_CENTERING", "CARD_SUSPENSE", "CARD_FLIPPING", "CARD_REVEALED"];

export function BoosterPack({ entering, wallet, experience, card, onTearStart, onPackOpen, onTearReset, onCardStateChange, onViewPersona }: BoosterPackProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tearStartX = useRef(0);
  const tearTarget = useRef(0);
  const tearCurrent = useRef(0);
  const tearFrame = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const snapping = useRef(false);
  const openingTimer = useRef<number | null>(null);
  const cardFrame = useRef<number | null>(null);
  const cardTimer = useRef<number | null>(null);
  const cardCurrent = useRef({ progress: 0, x: 0 });
  const [layers, setLayers] = useState<PackLayers>({ base: true, wrinkles: true, specular: true, shine: true, shadow: true, text: true });
  const [lightX, setLightX] = useState(48);
  const [lightY, setLightY] = useState(38);
  const [specularStrength, setSpecularStrength] = useState(34);
  const [wrinkleStrength, setWrinkleStrength] = useState(42);
  const [tiltStrength, setTiltStrength] = useState(100);
  const startsAtCard = CARD_STATES.includes(experience as CardRevealState);
  const [tearProgress, setTearProgress] = useState(startsAtCard ? 1 : 0);
  const [dragging, setDragging] = useState(false);
  const [stripReleased, setStripReleased] = useState(startsAtCard);
  const [tearHover, setTearHover] = useState(false);
  const [showTearPath, setShowTearPath] = useState(false);
  const [showTearFront, setShowTearFront] = useState(false);
  const [showHitArea, setShowHitArea] = useState(false);
  const [tearSlow, setTearSlow] = useState(false);
  const [freezeTear, setFreezeTear] = useState(false);
  const [tearSeparation, setTearSeparation] = useState(100);
  const [pullProgress, setPullProgress] = useState(0);
  const [pullX, setPullX] = useState(0);
  const [pullDistance, setPullDistance] = useState(240);
  const [resultEnabled, setResultEnabled] = useState(false);
  const barcode = useMemo(() => barcodeFromWallet(wallet), [wallet]);
  const packId = useMemo(() => `OP-${walletHash(wallet).toString(36).toUpperCase().slice(0, 4).padStart(4, "0")}`, [wallet]);

  const emitTearEvent = (name: string, detail: Record<string, unknown> = {}) => {
    window.dispatchEvent(new CustomEvent(name, { detail: { wallet, ...detail } }));
  };

  function setProgress(value: number) {
    const next = Math.max(0, Math.min(1, value));
    tearCurrent.current = next;
    tearTarget.current = next;
    setTearProgress(next);
  }

  function animateTear(to: number, duration: number, onDone?: () => void) {
    if (tearFrame.current !== null) cancelAnimationFrame(tearFrame.current);
    const from = tearCurrent.current;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      const next = from + (to - from) * eased;
      tearCurrent.current = next;
      tearTarget.current = next;
      setTearProgress(next);
      emitTearEvent("onTearProgress", { progress: next });
      if (elapsed < 1) tearFrame.current = requestAnimationFrame(tick);
      else {
        tearFrame.current = null;
        onDone?.();
      }
    };
    tearFrame.current = requestAnimationFrame(tick);
  }

  function completeTear() {
    if (snapping.current) return;
    snapping.current = true;
    setDragging(false);
    draggingRef.current = false;
    emitTearEvent("onTearSnap", { progress: tearCurrent.current });
    animateTear(1, (tearSlow ? 680 : 170), () => {
      setStripReleased(true);
      emitTearEvent("onStripRelease");
      openingTimer.current = window.setTimeout(() => {
        emitTearEvent("onPackOpen");
        onPackOpen();
      }, tearSlow ? 2200 : 620);
    });
  }

  function followTearTarget() {
    if (tearFrame.current !== null || snapping.current) return;
    const follow = () => {
      const next = tearCurrent.current + (tearTarget.current - tearCurrent.current) * .34;
      tearCurrent.current = Math.abs(tearTarget.current - next) < .002 ? tearTarget.current : next;
      setTearProgress(tearCurrent.current);
      emitTearEvent("onTearProgress", { progress: tearCurrent.current });
      if (draggingRef.current || Math.abs(tearTarget.current - tearCurrent.current) > .002) tearFrame.current = requestAnimationFrame(follow);
      else tearFrame.current = null;
    };
    tearFrame.current = requestAnimationFrame(follow);
  }

  function startTear(event: React.PointerEvent<HTMLButtonElement>) {
    if (entering || stripReleased || snapping.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    tearStartX.current = event.clientX;
    draggingRef.current = true;
    setDragging(true);
    onTearStart();
    emitTearEvent("onTearGrab");
    emitTearEvent("onTearStart");
  }

  function moveTear(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging || snapping.current) return;
    event.preventDefault();
    if (freezeTear) return;
    const packWidth = surfaceRef.current?.getBoundingClientRect().width ?? 320;
    const raw = Math.max(0, Math.min(1, (tearStartX.current - event.clientX) / (packWidth * .78)));
    if (raw >= .68) {
      completeTear();
      return;
    }
    tearTarget.current = resistantProgress(raw);
    followTearTarget();
  }

  function releaseTear(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging || snapping.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    draggingRef.current = false;
    setDragging(false);
    if (tearCurrent.current < .35) animateTear(0, tearSlow ? 760 : 190);
  }

  function resetTear() {
    if (tearFrame.current !== null) cancelAnimationFrame(tearFrame.current);
    if (openingTimer.current !== null) window.clearTimeout(openingTimer.current);
    tearFrame.current = null;
    openingTimer.current = null;
    snapping.current = false;
    draggingRef.current = false;
    setDragging(false);
    setStripReleased(false);
    setPullProgress(0);
    setPullX(0);
    setResultEnabled(false);
    setProgress(0);
    onTearReset();
  }

  useEffect(() => {
    if (experience !== "CARD_READY" || !card) return;
    cardTimer.current = window.setTimeout(() => {
      const viewportDistance = window.innerHeight * .31;
      const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 250;
      setPullDistance(Math.max(190, Math.min(340, Math.max(viewportDistance, cardHeight * .78))));
      onCardStateChange("CARD_EXTRACTING");
    }, 360);
    return () => { if (cardTimer.current !== null) window.clearTimeout(cardTimer.current); };
  }, [card, experience, onCardStateChange]);

  const setCardPosition = useCallback((progress: number, x: number) => {
    const nextProgress = Math.max(0, Math.min(1, progress));
    const nextX = Math.max(-22, Math.min(22, x));
    cardCurrent.current = { progress: nextProgress, x: nextX };
    setPullProgress(nextProgress);
    setPullX(nextX);
  }, []);

  const animateCardProgress = useCallback((to: number, duration: number, onDone?: () => void) => {
    if (cardFrame.current !== null) cancelAnimationFrame(cardFrame.current);
    const from = cardCurrent.current.progress;
    const fromX = cardCurrent.current.x;
    let started: number | null = null;
    const tick = (now: number) => {
      if (started === null) started = now;
      const elapsed = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - elapsed, 3);
      setCardPosition(from + (to - from) * eased, fromX * (1 - eased));
      if (elapsed < 1) cardFrame.current = requestAnimationFrame(tick);
      else {
        cardFrame.current = null;
        onDone?.();
      }
    };
    cardFrame.current = requestAnimationFrame(tick);
  }, [setCardPosition]);

  useEffect(() => {
    if (experience === "CARD_EXTRACTING") {
      animateCardProgress(1, 620, () => onCardStateChange("CARD_CENTERING"));
      return;
    }
    if (experience === "CARD_CENTERING") {
      cardTimer.current = window.setTimeout(() => onCardStateChange("CARD_SUSPENSE"), 480);
      return () => { if (cardTimer.current !== null) window.clearTimeout(cardTimer.current); };
    }
    if (experience === "CARD_SUSPENSE") {
      cardTimer.current = window.setTimeout(() => onCardStateChange("CARD_FLIPPING"), 540);
      return () => { if (cardTimer.current !== null) window.clearTimeout(cardTimer.current); };
    }
    if (experience === "CARD_FLIPPING") {
      cardTimer.current = window.setTimeout(() => onCardStateChange("CARD_REVEALED"), 740);
      return () => { if (cardTimer.current !== null) window.clearTimeout(cardTimer.current); };
    }
    if (experience === "CARD_REVEALED") {
      cardTimer.current = window.setTimeout(() => setResultEnabled(true), 820);
      return () => { if (cardTimer.current !== null) window.clearTimeout(cardTimer.current); };
    }
  }, [animateCardProgress, experience, onCardStateChange]);

  useEffect(() => () => {
    if (tearFrame.current !== null) cancelAnimationFrame(tearFrame.current);
    if (openingTimer.current !== null) window.clearTimeout(openingTimer.current);
    if (cardFrame.current !== null) cancelAnimationFrame(cardFrame.current);
    if (cardTimer.current !== null) window.clearTimeout(cardTimer.current);
  }, []);

  function toggleLayer(layer: keyof PackLayers) {
    setLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  function moveLight(event: React.PointerEvent<HTMLDivElement>) {
    const surface = surfaceRef.current;
    if (!surface || entering) return;
    const bounds = surface.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2));
    const strength = tiltStrength / 100;
    surface.style.setProperty("--pack-rx", `${(-y * 2 * strength).toFixed(2)}deg`);
    surface.style.setProperty("--pack-ry", `${(x * 3 * strength).toFixed(2)}deg`);
    surface.style.setProperty("--shine-x", `${(50 - x * 16).toFixed(2)}%`);
    surface.style.setProperty("--shine-y", `${(44 - y * 12).toFixed(2)}%`);
  }

  function resetLight() {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.style.setProperty("--pack-rx", "0deg");
    surface.style.setProperty("--pack-ry", "0deg");
    surface.style.setProperty("--shine-x", `${lightX}%`);
    surface.style.setProperty("--shine-y", `${lightY}%`);
  }

  const separation = tearSeparation / 100;
  const tearFrontX = PACK_WIDTH * (1 - tearProgress);
  const tearFrontY = tearYAt(tearFrontX);
  const peelAmount = Math.sin(Math.min(1, tearProgress / .72) * Math.PI * .5);
  const bodyMask = progressiveBodyMask(tearFrontX);
  const topMask = progressiveTopMask(tearFrontX);
  const bandMask = progressiveBandMask(tearFrontX);
  const surfaceStyle = {
    "--shine-x": `${lightX}%`,
    "--shine-y": `${lightY}%`,
    "--specular-strength": specularStrength / 100,
    "--wrinkle-strength": wrinkleStrength / 100,
    "--tear-p": tearProgress,
    "--tear-x": `${100 - tearProgress * 100}%`,
    "--tear-window-bottom": `${91.2 - tearProgress * 7.5}%`,
    "--tear-right": `${tearProgress * 100}%`,
    "--tear-front-x": `${(tearFrontX / PACK_WIDTH) * 100}%`,
    "--tear-front-y": `${(tearFrontY / PACK_HEIGHT) * 100}%`,
    "--tear-material-opacity": separation,
    "--tear-strip-filter": separation > .001 ? "drop-shadow(1px 4px 3px rgba(18,40,91,.2))" : "none",
    "--tear-peel-x": "0px",
    "--tear-peel-y": `${-peelAmount * 3 * separation}px`,
    "--tear-peel-r": `${-peelAmount * 11 * separation}deg`,
    "--card-peek-y": `${(1 - tearProgress) * 5}px`,
    "--curl-right-opacity": Math.max(0, Math.min(1, (tearProgress - .03) / .32)) * separation,
    "--curl-left-opacity": Math.max(0, Math.min(1, (tearProgress - .7) / .3)) * separation,
    "--curl-right-scale": .72 + Math.max(0, Math.min(1, (tearProgress - .03) / .32)) * .28,
    "--curl-left-scale": .72 + Math.max(0, Math.min(1, (tearProgress - .7) / .3)) * .28,
    "--curl-right-rotate": `${-5 - tearProgress * 6}deg`,
    "--curl-left-rotate": `${4 + tearProgress * 7}deg`,
    "--tear-tip-opacity": (tearProgress <= .02 || tearProgress >= .98 ? 0 : Math.min(1, (tearProgress - .02) * 8, (1 - tearProgress) * 8)) * separation,
    "--pull-progress": pullProgress,
    "--pull-x": `${pullX}px`,
    "--pull-y": `${-pullProgress * pullDistance}px`,
    "--pull-rotate": `${Math.max(-2, Math.min(2, pullX / 11))}deg`,
  } as React.CSSProperties;

  const cardState = CARD_STATES.includes(experience as CardRevealState) ? `is-${experience.toLowerCase().replaceAll("_", "-")}` : "";
  const stageState = entering ? "is-entering" : stripReleased || experience === "PACK_OPEN" || cardState ? "is-open" : dragging || tearProgress > 0 ? "is-tearing" : "is-ready";
  const rarityClass = card?.special ? "special" : (card?.rarity ?? "common").toLowerCase();

  return <>
    <div className={`booster-pack-stage ${stageState} ${cardState} rarity-${rarityClass} ${dragging ? "is-dragging" : ""} ${tearHover ? "tear-hover" : ""} ${showTearPath ? "show-tear-path" : ""} ${showTearFront ? "show-tear-front" : ""} ${showHitArea ? "show-tear-hit" : ""}`} aria-live="polite">
      <div className="booster-pack-drop">
        <div className={`pack-root ${layers.shadow ? "show-pack-shadow" : ""}`}>
          <div className="pack-shadow-layer" aria-hidden="true"><i className="pack-shadow-diffuse" /><i className="pack-shadow-contact" /></div>
          <div ref={surfaceRef} className="pack-surface" style={surfaceStyle}>
            {(card || stripReleased || experience === "PACK_OPEN") && <div className={`pack-card-propagation ${card ? "is-card-loaded" : "is-card-waiting"}`} style={{ clipPath: stripReleased || experience === "PACK_OPEN" || CARD_STATES.includes(experience as CardRevealState) ? "none" : topMask }}>
              <div
                ref={cardRef}
                className="pack-pull-card"
                role={card && experience === "CARD_REVEALED" ? "button" : "img"}
                tabIndex={card && experience === "CARD_REVEALED" && resultEnabled ? 0 : -1}
                aria-label={!card ? "Card back inside the opened pack" : experience === "CARD_REVEALED" ? `View ${card.name} Persona` : `${card.name} card revealing automatically`}
                onClick={() => experience === "CARD_REVEALED" && resultEnabled && onViewPersona()}
                onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && experience === "CARD_REVEALED" && resultEnabled) onViewPersona(); }}
              >
                <div className="pack-pull-card__inner">
                  <div className="pack-pull-card__face pack-pull-card__back"><CardBackArtwork idPrefix="pack-inside" /></div>
                  <div className="pack-pull-card__face pack-pull-card__front">{card && <PersonaCard data={card} />}</div>
                </div>
                <div className="pack-reveal-particles" aria-hidden="true"><i>✦</i><i>✦</i><i>✦</i><i>✦</i><i>✦</i></div>
              </div>
            </div>}

            <div className="pack-bottom-pack" style={{ clipPath: bodyMask }}>
              {layers.base && <img className="pack-texture pack-base-artwork" src="/pack-assets/pack-base-v2.png" alt="" draggable={false} />}
              {layers.text && <div className="pack-dynamic-wallet-content">
                <strong>{shortPackWallet(wallet)}</strong>
                <div className="pack-dynamic-barcode" aria-hidden="true">{barcode.map((bar, index) => <i className={bar.guard ? "is-guard" : undefined} key={`${index}-${bar.width}-${bar.gap}`} style={{ "--bar-width": bar.width, "--bar-gap": bar.gap } as React.CSSProperties} />)}</div>
                <small>{packId}</small>
              </div>}
              {layers.wrinkles && <img className="pack-texture pack-wrinkle-overlay" src="/pack-assets/pack-wrinkles-v2.png" alt="" draggable={false} />}
              {layers.specular && <img className="pack-texture pack-specular-overlay" src="/pack-assets/pack-specular-v2.png" alt="" draggable={false} />}
              {layers.shine && <div className="pack-dynamic-shine" aria-hidden="true" />}
            </div>

            <div className="pack-tear-material-propagation" style={{ clipPath: bandMask }} aria-hidden="true">
              <div className="pack-tear-material-boundary">
                <img className="pack-tear-wrinkle-art" src="/pack-assets/tear/tear-wrinkle-overlay.png" alt="" draggable={false} />
                <img className="pack-tear-edge-art" src="/pack-assets/tear/tear-edge-strip.png" alt="" draggable={false} />
              </div>
            </div>

            <img className="pack-tear-curl pack-tear-curl-left" src="/pack-assets/tear/tear-curl-left.png" alt="" draggable={false} />
            <img className="pack-tear-curl pack-tear-curl-right" src="/pack-assets/tear/tear-curl-right.png" alt="" draggable={false} />
            <span className="pack-tear-tip" aria-hidden="true" />

            <div className="pack-top-strip-reveal" aria-hidden="true">
              <div className="pack-top-strip" style={{ clipPath: topMask }}>
                {layers.base && <img className="pack-texture" src="/pack-assets/pack-base-v2.png" alt="" draggable={false} />}
                {layers.wrinkles && <img className="pack-texture pack-strip-wrinkles" src="/pack-assets/pack-wrinkles-v2.png" alt="" draggable={false} />}
                {layers.specular && <img className="pack-texture pack-strip-specular" src="/pack-assets/pack-specular-v2.png" alt="" draggable={false} />}
                {layers.shine && <div className="pack-dynamic-shine pack-strip-shine" aria-hidden="true" />}
              </div>
            </div>

            <svg className="pack-tear-debug-path" viewBox={`0 0 ${PACK_WIDTH} ${PACK_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
              <polyline points={TEAR_PATH.map(([x, y]) => `${x},${y}`).join(" ")} />
              <circle cx={tearFrontX} cy={tearFrontY} r="12" />
            </svg>

            {stripReleased && <div className="pack-snap-details" aria-hidden="true"><i>✦</i><i>✦</i><i>◆</i></div>}

            <div className="pack-interaction-layer" onPointerMove={moveLight} onPointerLeave={resetLight} aria-label={`Sealed Onchain Persona wallet edition pack for ${shortPackWallet(wallet)}`} />
            {!cardState && <button className="pack-tear-hit" type="button" aria-label="Grab and tear the pack from right to left" onPointerEnter={() => setTearHover(true)} onPointerLeave={() => !dragging && setTearHover(false)} onPointerDown={startTear} onPointerMove={moveTear} onPointerUp={releaseTear} onPointerCancel={releaseTear} />}
          </div>
          {!entering && !dragging && tearProgress === 0 && <div className="pack-ready-instruction"><i aria-hidden="true" /><span>TEAR HERE</span></div>}
        </div>
      </div>
      {experience === "CARD_REVEALED" && <button className="pack-view-persona" type="button" disabled={!resultEnabled} onClick={onViewPersona}>VIEW YOUR PERSONA</button>}
      {CARD_STATES.includes(experience as CardRevealState) && <div className="pack-reveal-backdrop" aria-hidden="true" />}
    </div>

    <aside className="pack-material-controls" aria-label="Pack material developer controls">
      <strong>PACK MATERIAL</strong>
      <div className="pack-layer-toggles">
        {(["base", "wrinkles", "specular", "shine", "shadow", "text"] as const).map((layer) => <button type="button" className={layers[layer] ? "active" : ""} onClick={() => toggleLayer(layer)} key={layer}>[{layer === "shine" ? "DYNAMIC SHINE" : layer === "text" ? "DYNAMIC TEXT" : layer.toUpperCase()}]</button>)}
      </div>
      <label>LIGHT X<input type="range" min="0" max="100" value={lightX} onChange={(event) => setLightX(Number(event.target.value))} /></label>
      <label>LIGHT Y<input type="range" min="0" max="100" value={lightY} onChange={(event) => setLightY(Number(event.target.value))} /></label>
      <label>SPECULAR<input type="range" min="0" max="100" value={specularStrength} onChange={(event) => setSpecularStrength(Number(event.target.value))} /></label>
      <label>WRINKLES<input type="range" min="0" max="100" value={wrinkleStrength} onChange={(event) => setWrinkleStrength(Number(event.target.value))} /></label>
      <label>TILT<input type="range" min="0" max="100" value={tiltStrength} onChange={(event) => setTiltStrength(Number(event.target.value))} /></label>
      <hr />
      <label>TEAR PROGRESS<input type="range" min="0" max="1" step=".01" value={tearProgress} onChange={(event) => { snapping.current = false; setStripReleased(false); setProgress(Number(event.target.value)); }} /></label>
      <label>SEPARATION<input type="range" min="0" max="100" value={tearSeparation} onChange={(event) => setTearSeparation(Number(event.target.value))} /></label>
      <div className="pack-layer-toggles tear-debug-buttons">
        <button type="button" className={showTearPath ? "active" : ""} onClick={() => setShowTearPath((value) => !value)}>[TEAR PATH]</button>
        <button type="button" className={showTearFront ? "active" : ""} onClick={() => setShowTearFront((value) => !value)}>[TEAR FRONT]</button>
        <button type="button" className={freezeTear ? "active" : ""} onClick={() => setFreezeTear((value) => !value)}>[FREEZE TEAR]</button>
        <button type="button" className={showHitArea ? "active" : ""} onClick={() => setShowHitArea((value) => !value)}>[HIT AREA]</button>
        <button type="button" onClick={resetTear}>[RESET TEAR]</button>
        <button type="button" onClick={() => { if (experience === "PACK_READY") onTearStart(); completeTear(); }}>[AUTO TEAR]</button>
        <button type="button" className={tearSlow ? "active" : ""} onClick={() => setTearSlow((value) => !value)}>[SLOW .25×]</button>
      </div>
    </aside>
  </>;
}
