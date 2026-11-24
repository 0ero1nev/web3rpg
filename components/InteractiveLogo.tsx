"use client";

import { useState } from "react";

type LogoRow = "onchain" | "persona";
type HoveredLetter = { row: LogoRow; index: number } | null;

const ONCHAIN = "ONCHAIN".split("");
const PERSONA = "PERSONA!".split("");
const ROTATIONS = [-1.3, 0.8, -0.6, 1.15, -0.9, 0.55, -0.4, 1.25];
const ONCHAIN_ARCH = [8, 2, -3, -6, -4, 0, 6];
const PERSONA_ARCH = [9, 3, -3, -7, -6, -1, 5, 11];

function pullFor(hovered: HoveredLetter, row: LogoRow, index: number) {
  if (!hovered || hovered.row !== row) return 0;
  const distance = Math.abs(hovered.index - index);
  if (distance === 0) return 1;
  if (distance === 1) return 0.26;
  return 0;
}

function LetterRow({ row, letters, arch, hovered, setHovered }: {
  row: LogoRow;
  letters: string[];
  arch: number[];
  hovered: HoveredLetter;
  setHovered: (value: HoveredLetter) => void;
}) {
  return <div className={`interactive-letter-row ${row}-letters`} aria-hidden="true">{letters.map((letter, index) => {
    const pull = pullFor(hovered, row, index);
    const style = {
      "--pull": pull,
      "--arch-y": `${arch[index]}px`,
      "--idle-rotate": `${ROTATIONS[index]}deg`,
      "--hover-rotate": `${index % 2 === 0 ? -1.45 : 1.45}deg`,
    } as React.CSSProperties;
    return <span className="logo-letter-hit" key={`${row}-${letter}-${index}`} onPointerEnter={() => setHovered({ row, index })} style={style} data-letter={`${row}-${index}`}><span className="logo-letter-piece"><span className="logo-letter-bottom">{letter}</span><span className="logo-letter-extrusion">{letter}</span><span className="logo-letter-face">{letter}</span></span></span>;
  })}</div>;
}

function OrbitLayer({ layer }: { layer: "back" | "front" }) {
  return <div className={`orbit orbit-${layer}`} aria-hidden="true">
    <svg className="orbit-surface" viewBox="0 0 1000 400" preserveAspectRatio="none">
      <ellipse className="orbit-flow-highlight" cx="500" cy="200" rx="488" ry="188" pathLength="1000" />
      <ellipse className="orbit-flow-shine" cx="500" cy="200" rx="488" ry="188" pathLength="1000" />
      <ellipse className="orbit-debug-path" cx="500" cy="200" rx="488" ry="188" pathLength="1000" />
    </svg>
  </div>;
}

export function InteractiveLogo() {
  const [hovered, setHovered] = useState<HoveredLetter>(null);
  const [showHitAreas, setShowHitAreas] = useState(false);
  const [showOrbitPath, setShowOrbitPath] = useState(false);

  return <div className={`interactive-logo ${showHitAreas ? "show-hit-areas" : ""} ${showOrbitPath ? "show-orbit-path" : ""}`} onPointerLeave={() => setHovered(null)}>
    <span className="sr-only">ONCHAIN PERSONA!</span>
    <OrbitLayer layer="back" />
    <div className="logo-letter-stack">
      <LetterRow row="onchain" letters={ONCHAIN} arch={ONCHAIN_ARCH} hovered={hovered} setHovered={setHovered} />
      <LetterRow row="persona" letters={PERSONA} arch={PERSONA_ARCH} hovered={hovered} setHovered={setHovered} />
    </div>
    <OrbitLayer layer="front" />
    <div className="bitcoin-decoration" aria-hidden="true"><span className="bitcoin-bottom">₿</span><span className="bitcoin-extrusion">₿</span><span className="bitcoin-face">₿</span></div>
    <div className="logo-sparkle sparkle-one" aria-hidden="true">✦</div>
    <div className="logo-sparkle sparkle-two" aria-hidden="true">✦</div>
    <div className="logo-sparkle sparkle-three" aria-hidden="true">✦</div>
    <button className="logo-debug-toggle" type="button" aria-pressed={showHitAreas} onClick={() => setShowHitAreas((value) => !value)}><span aria-hidden="true">{showHitAreas ? "■" : "□"}</span> SHOW LOGO HIT AREAS</button>
    <button className="orbit-debug-toggle" type="button" aria-pressed={showOrbitPath} onClick={() => setShowOrbitPath((value) => !value)}><span aria-hidden="true">{showOrbitPath ? "■" : "□"}</span> SHOW ORBIT PATH</button>
  </div>;
}
