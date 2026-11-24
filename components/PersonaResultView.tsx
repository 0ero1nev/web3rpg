"use client";

import { useState } from "react";
import { NewtonStoryReport } from "@/components/NewtonStoryReport";
import { PersonaCard } from "@/components/PersonaCard";
import { buildDiogenesWhyCopy } from "@/data/specialPersonas";
import type { PersonaResult } from "@/lib/persona/personaResult";
import { getInconclusivePresentation } from "@/lib/persona/inconclusivePresentation";
import "./PersonaCard.css";
import "./PersonaResultView.css";

type PersonaResultViewProps = {
  result: PersonaResult;
  onTryAnother?: () => void;
  onRetry?: () => void;
};

/**
 * The single production result surface: the exact same component renders
 * normal personas, the Diogenes special persona, and the inconclusive state.
 * Normal results separate the historical story from wallet behavior evidence.
 */
export function PersonaResultView({ result, onTryAnother, onRetry }: PersonaResultViewProps) {
  const personaStory = result.kind === "NORMAL_PERSONA"
    ? result.newtonStory ?? result.icarusStory ?? result.donQuixoteStory
    : undefined;
  const opensWithPersonaStory = Boolean(personaStory);
  const [storyClosedFor, setStoryClosedFor] = useState<PersonaResult | null>(null);
  const showStory = opensWithPersonaStory && storyClosedFor !== result;

  if (result.kind === "INCONCLUSIVE") {
    const presentation = getInconclusivePresentation(result.reason);
    const action = result.reason === "HISTORICAL_PRICING_UNAVAILABLE" ? onRetry ?? onTryAnother : onTryAnother;
    return <section className="persona-result persona-result--inconclusive" aria-label={result.reason === "HISTORICAL_PRICING_UNAVAILABLE" ? "Analysis interrupted" : "Persona inconclusive"}>
      <header>
        <p className="persona-result__eyebrow">{presentation.eyebrow}</p>
        <h1>{presentation.title.split("\n").map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</h1>
      </header>
      <p className="persona-result__body">{presentation.body}</p>
      {presentation.result && <dl className="persona-result__facts">
        <div>
          <dt>QUALIFYING TRADES</dt>
          <dd>{result.qualifyingSwaps}</dd>
        </div>
        <div>
          <dt>RESULT</dt>
          <dd>{presentation.result}</dd>
        </div>
      </dl>}
      {action && <button className="persona-result__cta" type="button" onClick={action}>{presentation.cta}</button>}
    </section>;
  }

  if (result.kind === "SPECIAL_PERSONA") {
    const why = buildDiogenesWhyCopy(result.qualifyingSwaps);
    return <section className="persona-result" aria-label="Special persona result">
      <div className="persona-result__card"><PersonaCard data={result} /></div>
      <div className="persona-result__why">
        <h2>{why.title}</h2>
        {why.body.map((line) => <p key={line}>{line}</p>)}
        {why.punchline.map((line) => <p key={line}><strong>{line}</strong></p>)}
        {why.zeroTrade && <>
          <p><strong>{why.zeroTrade.title}</strong></p>
          <p>{why.zeroTrade.subtitle}</p>
          {why.zeroTrade.lines.map((line) => <p key={line}>{line}</p>)}
        </>}
      </div>
    </section>;
  }

  return <section className="persona-result" aria-label="Persona result">
    <div className="persona-result__card"><PersonaCard data={result} /></div>
    <div className="persona-result__why">
      <h2>WHY {result.name}?</h2>
      <div className="persona-result__story">
        {result.story.map((line) => <p key={line}>{line}</p>)}
      </div>
      <div className="persona-result__evidence" aria-label="Wallet behavior evidence">
        <p>WALLET EVIDENCE</p>
        <ul>
          {result.evidence.map((item) => <li key={item.label}>
            <span>{item.label}</span>
            <b>{item.value}</b>
          </li>)}
        </ul>
      </div>
      {personaStory && <button
        className="persona-result__story-cta"
        type="button"
        onClick={() => setStoryClosedFor(null)}
      >SEE MY STORY <span aria-hidden="true">→</span></button>}
    </div>
    {showStory && personaStory
      ? <NewtonStoryReport
          story={personaStory}
          onExit={() => setStoryClosedFor(result)}
          scrollNavigation={result.personaId === "don_quixote"}
          personaName={result.personaId === "don_quixote" ? "Don Quixote" : result.personaId === "icarus" ? "Icarus" : "Isaac Newton"}
          shareTagline={result.personaId === "don_quixote"
            ? "The world sees windmills. You see giants."
            : result.personaId === "icarus"
            ? "The fall was real. So was the high."
            : "Smart enough to leave. Human enough to come back."}
        />
      : null}
  </section>;
}
