"use client";

import { useMemo, useState } from "react";
import { PersonaCard } from "@/components/PersonaCard";
import { mockPersonaCards } from "@/data/mockPersonaCards";
import { buildDiogenesCardData, buildDiogenesWhyCopy, DIOGENES } from "@/data/specialPersonas";
import { getRarity } from "@/lib/personaRarity";
import type { PersonaRarity } from "@/types/persona";
import styles from "./persona-cards.module.css";

type Filter = "ALL" | PersonaRarity;
const filters: Filter[] = ["ALL", "COMMON", "RARE", "EPIC", "LEGENDARY"];
const diogenesPreviews = [0, 5, 9] as const;

export default function PersonaCardsGalleryPage() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selectedId, setSelectedId] = useState(mockPersonaCards[0].id);
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(mockPersonaCards.map((card) => [card.id, card.match ?? 0])));

  const cards = useMemo(() => mockPersonaCards.map((card) => {
    const match = scores[card.id] ?? card.match;
    return { ...card, match, rarity: getRarity(match) };
  }), [scores]);
  const visibleCards = filter === "ALL" ? cards : cards.filter((card) => card.rarity === filter);
  const selected = cards.find((card) => card.id === selectedId) ?? cards[0];

  return <main className={styles.gallery}>
    <header className={styles.intro}>
      <p>DEVELOPMENT GALLERY · RESULT CARD SYSTEM</p>
      <h1>ONCHAIN PERSONA</h1>
      <span>Click a card, then change its match score to test rarity.</span>
    </header>

    <section className={styles.controls} aria-label="Persona card gallery controls">
      <div className={styles.filters}>
        {filters.map((value) => <button className={filter === value ? styles.active : ""} type="button" onClick={() => setFilter(value)} key={value}>[{value}]</button>)}
      </div>
      <label className={styles.matchControl}>
        <span>MATCH · {selected.name}</span>
        <input type="range" min="0" max="100" value={selected.match} onChange={(event) => setScores((current) => ({ ...current, [selected.id]: Number(event.target.value) }))} />
        <strong>{selected.match}% · {selected.rarity}</strong>
      </label>
    </section>

    <section className={styles.grid} aria-label={`${filter.toLowerCase()} persona cards`}>
      {visibleCards.map((card) => <div
        className={`${styles.cardSlot} ${card.id === selected.id ? styles.selected : ""}`}
        key={card.id}
        role="button"
        tabIndex={0}
        aria-label={`Select ${card.name}`}
        onClick={() => setSelectedId(card.id)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(card.id); }}
      >
        <PersonaCard data={card} />
      </div>)}
      {visibleCards.length === 0 && <p className={styles.empty}>NO PERSONAS AT THIS RARITY — ADJUST A MATCH SCORE.</p>}
    </section>

    <section className={styles.gallery} aria-label="Special persona preview">
      <header className={styles.intro}>
        <p>SPECIAL PERSONA · NOT PART OF NORMAL SCORING, RARITY, OR CALIBRATION</p>
        <h1>{DIOGENES.name}</h1>
        <span>Routes wallets with 0–9 qualifying swaps. No match percentage is ever shown.</span>
      </header>
      <div className={styles.grid}>
        {diogenesPreviews.map((qualifyingSwaps) => <div className={styles.cardSlot} key={qualifyingSwaps}>
          <PersonaCard data={buildDiogenesCardData(qualifyingSwaps)} />
        </div>)}
      </div>
      {(() => {
        const why = buildDiogenesWhyCopy(5);
        const zero = buildDiogenesWhyCopy(0);
        return <div className={styles.intro}>
          <h2>{why.title}</h2>
          {why.body.map((line) => <p key={line}>{line}</p>)}
          {why.punchline.map((line) => <p key={line}><strong>{line}</strong></p>)}
          <h2>ZERO-TRADE VARIANT</h2>
          <p><strong>{zero.zeroTrade?.title}</strong></p>
          <p>{zero.zeroTrade?.subtitle}</p>
          {zero.zeroTrade?.lines.map((line) => <p key={line}>{line}</p>)}
          <p>Artwork: {DIOGENES.artwork}</p>
        </div>;
      })()}
    </section>
  </main>;
}
