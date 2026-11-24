"use client";

import { useState } from "react";
import { PersonaFlavorText } from "@/components/PersonaFlavorText";
import { PersonaMetricIcon } from "@/components/PersonaMetricIcon";
import type { PersonaCardData } from "@/types/persona";
import "./PersonaCard.css";

type PersonaCardProps = {
  data: PersonaCardData;
  className?: string;
};

function MetricMeter({ value }: { value?: number }) {
  if (value === undefined) return <span className="persona-card__meter persona-card__meter--raw" aria-hidden="true" />;
  const filled = Math.max(0, Math.min(10, Math.round(value / 10)));
  return <span className="persona-card__meter" aria-hidden="true">
    {Array.from({ length: 10 }, (_, index) => <i className={index < filled ? "is-filled" : ""} key={index} />)}
  </span>;
}

export function PersonaCard({ data, className = "" }: PersonaCardProps) {
  const [failedArtwork, setFailedArtwork] = useState<string | null>(null);
  const artFailed = failedArtwork === data.artwork;
  const special = data.special === true;

  return <article
    className={`persona-card ${className}`}
    data-rarity={special ? "special" : (data.rarity ?? "common").toLowerCase()}
    aria-label={special ? `${data.name}, special persona` : `${data.name}, ${data.rarity}, ${data.match}% match`}
  >
    <div className="persona-card__print" aria-hidden="true" />
    <header className="persona-card__header">
      <span className="persona-card__brand"><b>✦</b> ONCHAIN PERSONA</span>
      <span className="persona-card__rarity">{special ? <><span>SPECIAL</span><b>✦</b><span>PERSONA</span></> : <>{data.rarity}<b>✦</b></>}</span>
    </header>

    <div className="persona-card__artwork">
      <div className="persona-card__placeholder" aria-hidden="true">
        <span className="persona-card__placeholder-star">✦</span>
        <span className="persona-card__placeholder-figure"><i /><b /><em /></span>
        <strong>{data.name}</strong>
        <small>ARTWORK PLACEHOLDER</small>
      </div>
      {!artFailed && <img className="is-loaded" src={data.artwork} alt={`${data.name} persona artwork`} onError={() => setFailedArtwork(data.artwork)} />}
      <span className="persona-card__art-spark persona-card__art-spark--one" aria-hidden="true">✦</span>
      <span className="persona-card__art-spark persona-card__art-spark--two" aria-hidden="true">✦</span>
    </div>

    <section className="persona-card__identity">
      <div className="persona-card__name-block">
        <h2>{data.name}</h2>
        <p>{data.subtitle}</p>
      </div>
      {special
        ? <div className="persona-card__match persona-card__match--special"><small>SPECIAL</small><strong>PERSONA</strong></div>
        : <div className="persona-card__match"><small>MATCH</small><strong>{data.match}<i>%</i></strong></div>}
    </section>

    <section className="persona-card__metrics" aria-label="Persona metrics">
      {data.metrics.slice(0, 4).map((metric) => <div className="persona-card__metric" key={metric.label}>
        <PersonaMetricIcon label={metric.label} />
        <span className="persona-card__metric-label">{metric.label}</span>
        <MetricMeter value={metric.normalizedValue} />
        <strong>{metric.displayValue}</strong>
      </div>)}
    </section>

    <PersonaFlavorText lines={data.quote} />
  </article>;
}
