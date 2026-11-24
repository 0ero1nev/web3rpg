"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, RotateCcw, Share2, Swords, Trophy, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FighterAvatar } from "@/components/FighterAvatar";
import { FloatingCardScene, type FloatingCardMode, type RevealPhase } from "@/components/FloatingCardScene";
import { InteractiveLogo } from "@/components/InteractiveLogo";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { BoosterPack } from "@/components/BoosterPack";
import type { CardRevealState } from "@/components/BoosterPack";
import { PersonaResultView } from "@/components/PersonaResultView";
import { StatBar } from "@/components/StatBar";
import { CLASS_INFO } from "@/game/classes";
import { simulateBattle } from "@/game/battleEngine";
import { generateFighter, shortWallet } from "@/game/fighterGenerator";
import { buildDiogenesResult, type PersonaResult } from "@/lib/persona/personaResult";
import { readCachedPersonaResult, writeCachedPersonaResult } from "@/lib/persona/personaResultCache";
import { mockPersonaCards } from "@/data/mockPersonaCards";
import type { PersonaId } from "@/lib/persona/personaTypes";
import type { PersonaRarity } from "@/types/persona";
import type { BattleResult, Fighter } from "@/types/game";
import type { WalletAnalysisFeedEvent, WalletAnalysisProgressEvent, WalletAnalysisStage } from "@/lib/analysis/progress";

type Screen = "home" | "persona" | "reveal" | "intro" | "battle" | "result" | "why";
type PackExperienceState = "HOME" | "ANALYZING" | "PACK_ENTERING" | "PACK_READY" | "TEARING" | "PACK_OPEN" | CardRevealState | "RESULT";
const demos = [["Assassin Demo", "demo-assassin-AXIS9x7"], ["Mage Demo", "demo-mage-MOON100x"], ["Warrior Demo", "demo-warrior-GREEN77"], ["Paladin Demo", "demo-paladin-HODL88"]] as const;

function forcedPersonaResult(kind: PersonaRarity | "DIOGENES"): PersonaResult {
  if (kind === "DIOGENES") return buildDiogenesResult(5);
  const card = mockPersonaCards.find((item) => item.rarity === kind) ?? mockPersonaCards[0];
  return {
    ...card,
    kind: "NORMAL_PERSONA",
    personaId: card.id.replaceAll("-", "_") as PersonaId,
    match: card.match ?? 50,
    rarity: card.rarity ?? kind,
    confidence: 1,
    evidence: card.metrics.map((metric) => ({ label: metric.label, value: metric.displayValue })),
    story: [...card.quote],
  };
}

export function WalletRpg({ initialWallet = "" }: { initialWallet?: string }) {
  const [screen, setScreen] = useState<Screen>(initialWallet ? "reveal" : "home");
  const [wallet, setWallet] = useState(initialWallet); const [draftWallet, setDraftWallet] = useState(initialWallet);
  const [opponentDraft, setOpponentDraft] = useState(""); const [opponentWallet, setOpponentWallet] = useState("");
  const [challengeOpen, setChallengeOpen] = useState(false); const [shareOpen, setShareOpen] = useState(false); const [scoutOpen, setScoutOpen] = useState(false);
  const [error, setError] = useState(""); const [actionIndex, setActionIndex] = useState(-1); const [introReady, setIntroReady] = useState(false);
  const [packExperience, setPackExperience] = useState<PackExperienceState>("HOME");
  const [analysisMode, setAnalysisMode] = useState<"ACTIVE" | "PACK_BACKGROUND">("ACTIVE");
  const [analysisReplayKey, setAnalysisReplayKey] = useState(0);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("IDLE");
  const [revealRunKey, setRevealRunKey] = useState(0);
  const [revealSpeed, setRevealSpeed] = useState(1);
  const [pauseAt, setPauseAt] = useState<RevealPhase | "NONE">("NONE");
  const [revealPaused, setRevealPaused] = useState(false);
  const [packWallet, setPackWallet] = useState("");
  const [invalidShake, setInvalidShake] = useState(false);
  const [packReplayKey, setPackReplayKey] = useState(0);
  const [personaResult, setPersonaResult] = useState<PersonaResult | null>(null);
  const [analysisStage, setAnalysisStage] = useState<WalletAnalysisStage>("PREPARING");
  const [analysisProgressRunKey, setAnalysisProgressRunKey] = useState(0);
  const [analysisPreviewPercent, setAnalysisPreviewPercent] = useState<number | null>(null);
  const [analysisEvents, setAnalysisEvents] = useState<string[]>([]);
  const [analysisVisualComplete, setAnalysisVisualComplete] = useState(false);
  const analysisRequestId = useRef(0);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const analysisSimulationTimers = useRef<number[]>([]);
  const player = useMemo(() => wallet ? generateFighter(wallet) : null, [wallet]);
  const opponent = useMemo(() => opponentWallet ? generateFighter(opponentWallet) : null, [opponentWallet]);
  const result = useMemo(() => player && opponent ? simulateBattle(player, opponent) : null, [player, opponent]);
  const action = result && actionIndex >= 0 ? result.rounds[actionIndex] : null;
  const currentHp = useMemo(() => { if (!result) return { player: player?.stats.hp ?? 0, opponent: opponent?.stats.hp ?? 0 }; const state = { player: result.player.stats.hp, opponent: result.opponent.stats.hp }; result.rounds.slice(0, actionIndex + 1).forEach((round) => { const target = round.attacker === "player" ? "opponent" : "player"; state[target] = round.targetHp; }); return state; }, [result, actionIndex, player, opponent]);

  useEffect(() => { if (screen !== "intro") return; const ready = window.setTimeout(() => setIntroReady(true), 700); const start = window.setTimeout(() => { setActionIndex(0); setScreen("battle"); }, 1900); return () => { window.clearTimeout(ready); window.clearTimeout(start); }; }, [screen]);
  useEffect(() => { if (screen !== "battle" || !result) return; if (actionIndex >= result.rounds.length - 1) { const done = window.setTimeout(() => setScreen("result"), 1150); return () => window.clearTimeout(done); } const next = window.setTimeout(() => setActionIndex((value) => value + 1), 660); return () => window.clearTimeout(next); }, [screen, actionIndex, result]);
  useEffect(() => () => { analysisAbortRef.current?.abort(); analysisSimulationTimers.current.forEach(window.clearTimeout); }, []);
  useEffect(() => { if (typeof document === "undefined") return; const context = (document as Document & { modelContext?: { registerTool?: (...args: unknown[]) => unknown } }).modelContext; if (!context?.registerTool) return; const lifecycle = new AbortController(); Promise.resolve(context.registerTool({ name: "create_wallet_fighter", title: "Create wallet fighter", description: "Generate and reveal the deterministic RPG fighter for a wallet string.", inputSchema: { type: "object", properties: { wallet: { type: "string", minLength: 9 } }, required: ["wallet"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: (input: unknown) => { const toolWallet = (input as { wallet?: unknown }).wallet; if (typeof toolWallet !== "string" || toolWallet.trim().length <= 8) throw new Error("Wallet must be longer than 8 characters."); const clean = toolWallet.trim(); setWallet(clean); setDraftWallet(clean); setScreen("reveal"); const generated = generateFighter(clean); return { class: generated.class, level: generated.level, stats: generated.stats }; } }, { signal: lifecycle.signal })).catch(() => undefined); return () => lifecycle.abort(); }, []);

  useEffect(() => {
    if (!revealRunKey) return;
    setRevealPaused(false);
    setPackExperience("ANALYZING");
    setAnalysisMode("ACTIVE");
    const emit = (name: string) => window.dispatchEvent(new CustomEvent(name, { detail: { run: revealRunKey } }));
    const steps: Array<{ at: number; phase: RevealPhase; event?: string }> = [
      { at: 0, phase: "SPIN", event: "onSpinAccelerate" },
      { at: 1100, phase: "APPROACH", event: "onForegroundApproach" },
      { at: 1300, phase: "CARD_WIPE", event: "onCardWipe" },
      { at: 1340, phase: "PACK_ENTER", event: "onPackForm" },
      { at: 1480, phase: "PACK_REVEAL" },
      { at: 1700, phase: "FLOW_SETTLE", event: "onPackImpact" },
      { at: 2200, phase: "SETTLED", event: "onFoilSweep" },
    ];
    const timers: number[] = [];
    let blocked = false;
    steps.forEach((step) => {
      if (blocked) return;
      timers.push(window.setTimeout(() => {
        setRevealPhase(step.phase);
        if (step.phase === "APPROACH") setPackExperience("PACK_ENTERING");
        if (step.event) emit(step.event);
        if (pauseAt === step.phase) setRevealPaused(true);
      }, step.at / revealSpeed));
      if (pauseAt === step.phase) blocked = true;
    });
    if (!blocked) timers.push(window.setTimeout(() => {
      setPackExperience("PACK_READY");
      setAnalysisMode("PACK_BACKGROUND");
      emit("onTearReady");
    }, 2550 / revealSpeed));
    return () => timers.forEach(window.clearTimeout);
  }, [revealRunKey, revealSpeed, pauseAt]);

  useEffect(() => {
    if (packExperience !== "PACK_OPEN" || !personaResult) return;
    const timer = window.setTimeout(() => {
      if (personaResult.kind === "INCONCLUSIVE") {
        setWallet(packWallet);
        setScreen("persona");
        setPackExperience("RESULT");
        window.history.pushState({}, "", `/result/${encodeURIComponent(packWallet)}`);
        return;
      }
      setPackExperience("CARD_READY");
    }, 320);
    return () => window.clearTimeout(timer);
  }, [packExperience, personaResult, packWallet]);

  useEffect(() => {
    if (!analysisVisualComplete || analysisStage !== "COMPLETE" || packExperience !== "ANALYZING" || !personaResult || analysisPreviewPercent !== null) return;
    const timer = window.setTimeout(() => {
      setAnalysisVisualComplete(false);
      setRevealRunKey((value) => value + 1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [analysisPreviewPercent, analysisStage, analysisVisualComplete, packExperience, personaResult]);

  useEffect(() => {
    if (analysisStage !== "COMPLETE" || packExperience !== "ANALYZING" || !personaResult || analysisPreviewPercent !== null || analysisVisualComplete) return;
    const fallback = window.setTimeout(() => setAnalysisVisualComplete(true), 2500);
    return () => window.clearTimeout(fallback);
  }, [analysisPreviewPercent, analysisStage, analysisVisualComplete, packExperience, personaResult]);

  function viewPersonaResult() {
    if (!personaResult || packExperience !== "CARD_REVEALED") return;
    setWallet(packWallet);
    setScreen("persona");
    setPackExperience("RESULT");
    window.history.pushState({}, "", `/result/${encodeURIComponent(packWallet)}`);
  }

  function startCardReadyPreview(kind: PersonaRarity | "DIOGENES") {
    analysisRequestId.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    clearAnalysisSimulation();
    const previewWallet = `dev-card-${kind.toLowerCase()}`;
    setError("");
    setPackWallet(previewWallet);
    setPersonaResult(forcedPersonaResult(kind));
    setAnalysisVisualComplete(false);
    setAnalysisPreviewPercent(null);
    setAnalysisEvents([]);
    setPackReplayKey((value) => value + 1);
    setRevealPhase("SETTLED");
    setPackExperience("CARD_READY");
    setScreen("home");
  }

  function createFighter(value = draftWallet) { const clean = value.trim(); if (clean.length <= 8) { setError("Drop a wallet string longer than 8 characters."); return; } setError(""); setWallet(clean); setDraftWallet(clean); setScreen("reveal"); window.history.pushState({}, "", `/fighter/${encodeURIComponent(clean)}`); }
  function startBattle() { const clean = opponentDraft.trim(); if (clean.length <= 8) { setError("Your opponent needs a wallet longer than 8 characters."); return; } if (clean === wallet) { setError("That is your wallet. Pick a rival."); return; } setError(""); setIntroReady(false); setOpponentWallet(clean); setChallengeOpen(false); setActionIndex(-1); setScreen("intro"); }
  function resetChallenge() { setOpponentDraft(""); setOpponentWallet(""); setActionIndex(-1); setScreen("reveal"); setChallengeOpen(true); }
  function clearAnalysisSimulation() { analysisSimulationTimers.current.forEach(window.clearTimeout); analysisSimulationTimers.current = []; }
  function fullReset() { analysisRequestId.current += 1; analysisAbortRef.current?.abort(); analysisAbortRef.current = null; clearAnalysisSimulation(); setWallet(""); setDraftWallet(""); setOpponentWallet(""); setOpponentDraft(""); setActionIndex(-1); setPackWallet(""); setPersonaResult(null); setAnalysisPreviewPercent(null); setAnalysisEvents([]); setAnalysisVisualComplete(false); setPackExperience("HOME"); setScreen("home"); window.history.pushState({}, "", "/"); }

  function validPackWallet(value: string) {
    return /^(dev|demo|test)([-_].*)?$/i.test(value) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
  }

  function shakeWalletInput() {
    setInvalidShake(false);
    window.requestAnimationFrame(() => setInvalidShake(true));
    window.setTimeout(() => setInvalidShake(false), 300);
  }

  async function analyzePackWallet(address: string, requestId: number, controller: AbortController) {
    try {
      const cached = readCachedPersonaResult(address);
      if (cached) {
        if (requestId !== analysisRequestId.current) return;
        setAnalysisEvents(["RECENT ANALYSIS RESTORED", "MATCH LOCKED", "PACKING YOUR CARD..."]);
        setPersonaResult(cached.result);
        setAnalysisStage("COMPLETE");
        return;
      }
      const response = await fetch("/api/analyze-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, progress: true }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json() as { message?: string };
        throw new Error(payload.message ?? "Wallet analysis failed.");
      }
      if (!response.body) throw new Error("Wallet analysis returned no progress stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: PersonaResult | null = null;
      let partialHistory = false;
      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as WalletAnalysisProgressEvent | WalletAnalysisFeedEvent | { type: "result"; profile: { personaResult?: PersonaResult; dataQuality?: { historyComplete?: boolean } } } | { type: "error"; message: string };
        if (event.type === "progress") {
          if (requestId === analysisRequestId.current) setAnalysisStage(event.stage);
          return;
        }
        if (event.type === "analysis_event") {
          if (requestId === analysisRequestId.current) setAnalysisEvents((current) => [...current, event.message]);
          return;
        }
        if (event.type === "error") throw new Error(event.message);
        result = event.profile.personaResult ?? null;
        partialHistory = event.profile.dataQuality?.historyComplete === false;
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
        if (done) break;
      }
      processLine(buffer);
      if (!result) throw new Error("Wallet analysis returned no Persona result.");
      if (requestId !== analysisRequestId.current) return;
      writeCachedPersonaResult(address, result, partialHistory);
      setPersonaResult(result);
      setAnalysisStage("COMPLETE");
    } catch (analysisError) {
      if (requestId !== analysisRequestId.current) return;
      setError(analysisError instanceof Error ? analysisError.message : "Wallet analysis failed.");
      setPersonaResult(null);
      setRevealPhase("IDLE");
      setRevealRunKey(0);
      setPackExperience("HOME");
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null;
    }
  }

  function startPackExperience() {
    if (packExperience !== "HOME") return;
    const clean = draftWallet.trim();
    if (!clean || !validPackWallet(clean)) { shakeWalletInput(); return; }
    setError("");
    setPackWallet(clean);
    setPackExperience("ANALYZING");
    setAnalysisMode("ACTIVE");
    setRevealPhase("IDLE");
    setAnalysisStage("PREPARING");
    setAnalysisPreviewPercent(null);
    setAnalysisEvents([]);
    setAnalysisVisualComplete(false);
    setAnalysisProgressRunKey((value) => value + 1);
    setAnalysisReplayKey((value) => value + 1);
    setPackReplayKey((value) => value + 1);
    setPersonaResult(null);
    const requestId = ++analysisRequestId.current;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    void analyzePackWallet(clean, requestId, controller);
  }

  function retryPackAnalysis() {
    const clean = packWallet.trim() || draftWallet.trim();
    if (!clean || !validPackWallet(clean)) { shakeWalletInput(); return; }
    setError("");
    setPackWallet(clean);
    setScreen("home");
    setPackExperience("ANALYZING");
    setAnalysisMode("ACTIVE");
    setRevealPhase("IDLE");
    setAnalysisStage("PREPARING");
    setAnalysisPreviewPercent(null);
    setAnalysisEvents([]);
    setAnalysisVisualComplete(false);
    setAnalysisProgressRunKey((value) => value + 1);
    setAnalysisReplayKey((value) => value + 1);
    setPackReplayKey((value) => value + 1);
    setPersonaResult(null);
    const requestId = ++analysisRequestId.current;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    void analyzePackWallet(clean, requestId, controller);
  }

  function resetPackExperience() {
    analysisRequestId.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    setAnalysisMode("ACTIVE");
    clearAnalysisSimulation();
    setInvalidShake(false);
    setRevealPhase("IDLE");
    setPackExperience("HOME");
    setPersonaResult(null);
    setAnalysisPreviewPercent(null);
    setAnalysisEvents([]);
    setAnalysisVisualComplete(false);
    setScreen("home");
    window.history.pushState({}, "", "/");
  }

  function previewAnalysisProgress(percent: number) {
    analysisRequestId.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    clearAnalysisSimulation();
    setError("");
    setPackWallet("dev-progress-preview");
    setPersonaResult(null);
    setRevealPhase("IDLE");
    setPackExperience("ANALYZING");
    setAnalysisPreviewPercent(percent);
    setAnalysisEvents([]);
    setAnalysisVisualComplete(false);
    setAnalysisProgressRunKey((value) => value + 1);
  }

  function simulateSlowAnalysis() {
    analysisRequestId.current += 1;
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = null;
    clearAnalysisSimulation();
    setError("");
    setPackWallet("dev-progress-slow");
    setPersonaResult(null);
    setRevealPhase("IDLE");
    setPackExperience("ANALYZING");
    setAnalysisPreviewPercent(null);
    setAnalysisVisualComplete(false);
    setAnalysisStage("PREPARING");
    setAnalysisEvents([]);
    setAnalysisProgressRunKey((value) => value + 1);
    const sequence: Array<[number, WalletAnalysisStage]> = [[650, "FETCHING_TRANSACTIONS"], [4200, "READING_SWAPS"], [5400, "RECONSTRUCTING_POSITIONS"], [6600, "VALUING_TRADES"], [7800, "MATCHING_PERSONA"], [9000, "PACKING_RESULT"]];
    analysisSimulationTimers.current = sequence.map(([delay, stage]) => window.setTimeout(() => setAnalysisStage(stage), delay));
    const simulatedEvents: Array<[number, string]> = [[700, "WALLET FOUND"], [6650, "CHECKING YOUR WINS & LOSSES..."], [7850, "LOOKING FOR TRADING PATTERNS..."], [8100, "TRADING PATTERN FOUND"], [8350, "COMPARING 8 PERSONAS..."], [8600, "MATCH LOCKED"], [9050, "PACKING YOUR CARD..."]];
    analysisSimulationTimers.current.push(...simulatedEvents.map(([delay, message]) => window.setTimeout(() => setAnalysisEvents((current) => [...current, message]), delay)));
    analysisSimulationTimers.current.push(window.setTimeout(() => {
      setPersonaResult(forcedPersonaResult("DIOGENES"));
      setAnalysisStage("COMPLETE");
      analysisSimulationTimers.current = [];
    }, 10_200));
  }

  function skipToPackEntrance() {
    if (!packWallet) setPackWallet(draftWallet.trim() || "dev-wallet-persona");
    setPackReplayKey((value) => value + 1);
    setPauseAt("NONE");
    setRevealRunKey((value) => value + 1);
  }

  function replayPackEntrance() {
    if (!packWallet) setPackWallet(draftWallet.trim() || "dev-wallet-persona");
    setPackReplayKey((value) => value + 1);
    setRevealRunKey((value) => value + 1);
  }

  function replaySearching() {
    if (!packWallet) setPackWallet(draftWallet.trim() || "dev-wallet-persona");
    setPackExperience("ANALYZING");
    setAnalysisMode("PACK_BACKGROUND");
    window.requestAnimationFrame(() => {
      setAnalysisReplayKey((value) => value + 1);
      setAnalysisMode("ACTIVE");
    });
  }

  function replayClearing() {
    if (!packWallet) setPackWallet(draftWallet.trim() || "dev-wallet-persona");
    setAnalysisMode("PACK_BACKGROUND");
    setAnalysisReplayKey((value) => value + 1);
    setPackExperience("ANALYZING");
  }

  useEffect(() => {
    document.body.classList.remove("debug-ui-visible");
    return () => document.body.classList.remove("debug-ui-visible");
  }, []);

  useEffect(() => {
    const handleDevelopmentKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.repeat || isEditing) return;
      const key = event.key.toLowerCase();
      if (key === "h") document.body.classList.toggle("debug-ui-visible");
      if (key === "r") resetPackExperience();
      if (key === "p") skipToPackEntrance();
      if (key === "a") replayPackEntrance();
      if (key === "s") replaySearching();
      if (key === "c") replayClearing();
      if (event.code === "Space") { event.preventDefault(); replayPackEntrance(); }
      if (key === "1") setRevealSpeed(1);
      if (key === "2") setRevealSpeed(.5);
      if (key === "3") setRevealSpeed(.25);
    };
    window.addEventListener("keydown", handleDevelopmentKeys);
    return () => window.removeEventListener("keydown", handleDevelopmentKeys);
  }, [draftWallet, packWallet, packExperience, analysisMode]);

  const packPhaseClass = screen === "home" ? `pack-experience-${packExperience.toLowerCase().replaceAll("_", "-")}` : "";
  const cardSceneMode: FloatingCardMode = packExperience === "HOME" ? "FLOATING" : ["PACK_READY", "TEARING", "PACK_OPEN", "CARD_READY", "CARD_DRAGGING", "CARD_EXTRACTING", "CARD_CENTERING", "CARD_SUSPENSE", "CARD_FLIPPING", "CARD_REVEALED"].includes(packExperience) ? "PACK_BACKGROUND" : "ACTIVE";

  return <main className={`game-shell screen-${screen} ${packPhaseClass}`}>
    {screen === "home" && <FloatingCardScene mode={cardSceneMode} revealPhase={revealPhase} revealSpeed={revealSpeed} revealPaused={revealPaused} />}
    {screen !== "home" && <header className="topbar"><button className="brand persona-brand" onClick={fullReset} aria-label="Onchain Persona home"><span className="brand-spark" aria-hidden="true">✦</span><span className="brand-words"><b>ONCHAIN</b><strong>PERSONA!</strong></span></button><div className="phase-pill persona-phase"><span className="phase-gem" aria-hidden="true">◆</span> PHASE 1 · PLAYTEST</div></header>}
    {screen === "home" && <HomeScreen wallet={draftWallet} setWallet={setDraftWallet} error={error} experience={packExperience} invalidShake={invalidShake} packWallet={packWallet} packReplayKey={packReplayKey} personaResult={personaResult} analysisStage={analysisStage} analysisEvents={analysisEvents} analysisProgressRunKey={analysisProgressRunKey} analysisPreviewPercent={analysisPreviewPercent} revealPhase={revealPhase} revealSpeed={revealSpeed} revealPaused={revealPaused} pauseAt={pauseAt} setPauseAt={setPauseAt} setRevealSpeed={setRevealSpeed} replayReveal={replayPackEntrance} onAnalysisVisualComplete={() => setAnalysisVisualComplete(true)} onPreviewAnalysisProgress={previewAnalysisProgress} onSimulateSlowAnalysis={simulateSlowAnalysis} onCreate={startPackExperience} onTearStart={() => setPackExperience("TEARING")} onPackOpen={() => setPackExperience("PACK_OPEN")} onTearReset={() => setPackExperience("PACK_READY")} onCardStateChange={setPackExperience} onViewPersona={viewPersonaResult} onPreviewCard={startCardReadyPreview} />}
    {screen === "persona" && personaResult && <section className="persona-result-screen"><PersonaResultView result={personaResult} onTryAnother={fullReset} onRetry={retryPackAnalysis} /></section>}
    {screen === "reveal" && player && <RevealScreen fighter={player} onChallenge={() => { setError(""); setChallengeOpen(true); }} onShare={() => setShareOpen(true)} />}
    {screen === "intro" && player && opponent && <BattleIntro player={player} opponent={opponent} ready={introReady} />}
    {screen === "battle" && result && <BattleScreen result={result} hp={currentHp} action={action} actionIndex={actionIndex} />}
    {screen === "result" && result && <ResultScreen result={result} onWhy={() => setScreen("why")} onAgain={resetChallenge} onShare={() => setShareOpen(true)} />}
    {screen === "why" && result && <WhyScreen result={result} onBack={() => setScreen("result")} onAgain={resetChallenge} onScout={() => setScoutOpen(true)} />}
    <Dialog open={challengeOpen} onOpenChange={setChallengeOpen}><DialogContent className="game-dialog sm:max-w-md"><DialogHeader><p className="eyebrow">PICK YOUR RIVAL</p><DialogTitle>WHO WANTS<br />THE SMOKE?</DialogTitle><DialogDescription>Every wallet hides a fighter. Choose carefully.</DialogDescription></DialogHeader><label className="wallet-field"><span>OPPONENT WALLET</span><input autoFocus value={opponentDraft} onChange={(e) => setOpponentDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && startBattle()} placeholder="Paste opponent wallet…" /></label>{error && <p className="field-error">{error}</p>}<button className="primary-button" onClick={startBattle}><Swords /> START BATTLE</button><div className="rival-demos">{demos.filter((d) => !d[1].includes(player?.class.toLowerCase() ?? "_")).map(([label, value]) => <button key={value} onClick={() => setOpponentDraft(value)}>{label.replace(" Demo", "")}</button>)}</div></DialogContent></Dialog>
    <Dialog open={shareOpen} onOpenChange={setShareOpen}><DialogContent className="game-dialog share-dialog sm:max-w-lg"><DialogHeader><p className="eyebrow">SHARE PREVIEW</p><DialogTitle>{result ? "BATTLE RECEIPT" : "FIGHTER CARD"}</DialogTitle><DialogDescription>Screenshot this card and call out the next wallet.</DialogDescription></DialogHeader>{result ? <ShareBattleCard result={result} /> : player && <ShareFighterCard fighter={player} />}<button className="secondary-button" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Copy /> COPY LINK</button></DialogContent></Dialog>
    <Dialog open={scoutOpen} onOpenChange={setScoutOpen}><DialogContent className="game-dialog scout-modal sm:max-w-md"><DialogHeader><p className="eyebrow">LOCKED INTEL</p><DialogTitle>FULL SCOUT REPORT</DialogTitle><DialogDescription>Full Scout Reports are coming soon.</DialogDescription></DialogHeader><div className="locked-list">{["Entry behavior", "Trading style", "Risk profile", "Biggest strengths", "Head-to-head breakdown"].map((item) => <div key={item}><span>🔒</span>{item}</div>)}</div><button className="secondary-button" onClick={() => setScoutOpen(false)}>GOT IT</button></DialogContent></Dialog>
  </main>;
}

function WalletDialogue({ wallet, setWallet, onCreate, disabled, invalidShake }: { wallet: string; setWallet: (value: string) => void; onCreate: () => void; disabled: boolean; invalidShake: boolean }) {
  return <div className={`dialogue-shell ${invalidShake ? "wallet-input-shake" : ""}`}><div className="dialogue-middle"><label className="dialogue-inner"><span className="menu-cursor" aria-hidden="true">▶</span><input aria-label="Solana wallet address" disabled={disabled} value={wallet} onChange={(event) => setWallet(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onCreate()} placeholder="Paste your Solana wallet…" /><span className="dialogue-diamond" aria-hidden="true">◆</span></label></div></div>;
}

function OpenPackButton({ onClick, disabled, label = "OPEN MY PACK" }: { onClick: () => void; disabled: boolean; label?: string }) {
  return <button className="open-pack-button" disabled={disabled} onClick={onClick}><span aria-hidden="true">▶</span> {label}</button>;
}

function FloatingPrompt() {
  function setParallax(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 4;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 3;
    event.currentTarget.style.setProperty("--prompt-x", `${x.toFixed(2)}px`);
    event.currentTarget.style.setProperty("--prompt-y", `${y.toFixed(2)}px`);
  }

  function clearParallax(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty("--prompt-x", "0px");
    event.currentTarget.style.setProperty("--prompt-y", "0px");
  }

  return <div className="persona-prompt" onPointerMove={setParallax} onPointerLeave={clearParallax}>
    <div className="persona-prompt-depth">
      <div className="prompt-headline-float">
        <span className="prompt-projected-shadow" aria-hidden="true">WHO ARE YOU ONCHAIN?</span>
        <h2>WHO ARE YOU ONCHAIN?</h2>
      </div>
      <p className="prompt-subtitle-float">Your wallet knows more than you think.</p>
    </div>
  </div>;
}

function HomeScreen({ wallet, setWallet, error, experience, invalidShake, packWallet, packReplayKey, personaResult, analysisStage, analysisEvents, analysisProgressRunKey, analysisPreviewPercent, revealPhase, revealSpeed, revealPaused, pauseAt, setPauseAt, setRevealSpeed, replayReveal, onAnalysisVisualComplete, onPreviewAnalysisProgress, onSimulateSlowAnalysis, onCreate, onTearStart, onPackOpen, onTearReset, onCardStateChange, onViewPersona, onPreviewCard }: { wallet: string; setWallet: (v: string) => void; error: string; experience: PackExperienceState; invalidShake: boolean; packWallet: string; packReplayKey: number; personaResult: PersonaResult | null; analysisStage: WalletAnalysisStage; analysisEvents: string[]; analysisProgressRunKey: number; analysisPreviewPercent: number | null; revealPhase: RevealPhase; revealSpeed: number; revealPaused: boolean; pauseAt: RevealPhase | "NONE"; setPauseAt: (phase: RevealPhase | "NONE") => void; setRevealSpeed: (speed: number) => void; replayReveal: () => void; onAnalysisVisualComplete: () => void; onPreviewAnalysisProgress: (percent: number) => void; onSimulateSlowAnalysis: () => void; onCreate: () => void; onTearStart: () => void; onPackOpen: () => void; onTearReset: () => void; onCardStateChange: (state: CardRevealState) => void; onViewPersona: () => void; onPreviewCard: (kind: PersonaRarity | "DIOGENES") => void }) {
  const leaving = experience !== "HOME";
  return <section className={`home-screen pack-opening-screen reveal-phase-${revealPhase.toLowerCase().replaceAll("_", "-")} ${revealPaused ? "reveal-debug-paused" : ""}`} style={{ "--reveal-time-scale": 1 / revealSpeed } as React.CSSProperties}>
    <div className={`persona-hero ${leaving ? "is-leaving" : ""}`}>
      <InteractiveLogo />
      <FloatingPrompt />
      <WalletDialogue wallet={wallet} setWallet={setWallet} onCreate={onCreate} disabled={leaving} invalidShake={invalidShake} />
      {error && <p className="persona-error" role="alert">{error}</p>}
      <OpenPackButton onClick={onCreate} disabled={leaving} label={error ? "TRY AGAIN" : "OPEN MY PACK"} />
      <p className="persona-footer">ONE WALLET · ONE PERSONA</p>
    </div>
    {experience === "ANALYZING" && revealPhase === "IDLE" && <AnalysisProgress key={analysisProgressRunKey} wallet={packWallet || wallet} stage={analysisStage} events={analysisEvents} previewPercent={analysisPreviewPercent} onVisualComplete={onAnalysisVisualComplete} />}
    {(["PACK_ENTERING", "PACK_READY", "TEARING", "PACK_OPEN", "CARD_READY", "CARD_DRAGGING", "CARD_EXTRACTING", "CARD_CENTERING", "CARD_SUSPENSE", "CARD_FLIPPING", "CARD_REVEALED"] as PackExperienceState[]).includes(experience) && <BoosterPack key={packReplayKey} entering={experience === "PACK_ENTERING"} experience={experience as "PACK_ENTERING" | "PACK_READY" | "TEARING" | "PACK_OPEN" | CardRevealState} wallet={packWallet || wallet || "dev-wallet-persona"} card={personaResult?.kind === "INCONCLUSIVE" ? null : personaResult} onTearStart={onTearStart} onPackOpen={onPackOpen} onTearReset={onTearReset} onCardStateChange={onCardStateChange} onViewPersona={onViewPersona} />}
    <aside className="pack-reveal-controls" aria-label="Pack reveal developer controls">
      <strong>PACK REVEAL · {revealPhase}{revealPaused ? " · PAUSED" : ""}</strong>
      <button type="button" onClick={replayReveal}>REPLAY REVEAL <kbd>SPACE</kbd></button>
      <div className="reveal-speed-buttons"><button className={revealSpeed === 1 ? "active" : ""} onClick={() => setRevealSpeed(1)}>1×</button><button className={revealSpeed === .5 ? "active" : ""} onClick={() => setRevealSpeed(.5)}>.5×</button><button className={revealSpeed === .25 ? "active" : ""} onClick={() => setRevealSpeed(.25)}>.25×</button></div>
      <label>PAUSE AT<select value={pauseAt} onChange={(event) => setPauseAt(event.target.value as RevealPhase | "NONE")}><option value="NONE">NONE</option>{["APPROACH", "CARD_WIPE", "PACK_ENTER", "PACK_REVEAL", "FLOW_SETTLE", "SETTLED"].map((phase) => <option key={phase} value={phase}>{phase}</option>)}</select></label>
      <div className="card-reveal-preview-buttons"><span>START AT CARD_READY</span>{(["COMMON", "RARE", "EPIC", "LEGENDARY", "DIOGENES"] as const).map((kind) => <button type="button" key={kind} onClick={() => onPreviewCard(kind)}>{kind}</button>)}</div>
      <div className="analysis-progress-preview-buttons"><span>ANALYSIS PROGRESS</span>{[10,35,60,85,99,100].map((percent) => <button type="button" key={percent} onClick={() => onPreviewAnalysisProgress(percent)}>{percent}%</button>)}<button type="button" onClick={onSimulateSlowAnalysis}>[SIMULATE SLOW]</button></div>
    </aside>
  </section>;
}

function RevealScreen({ fighter, onChallenge, onShare }: { fighter: Fighter; onChallenge: () => void; onShare: () => void }) {
  return <section className="reveal-screen"><div className="reveal-heading"><p className="eyebrow">FIGHTER # {fighter.wallet.length.toString().padStart(4, "0")}</p><h1>{fighter.title}</h1><p>{fighter.personality}</p></div><div className="fighter-stage" style={{ "--fighter": fighter.color } as React.CSSProperties}><div className="level-badge"><small>LEVEL</small><strong>{fighter.level}</strong></div><div className="class-stamp">{fighter.class}</div><FighterAvatar fighter={fighter} /><div className="wallet-tag">{shortWallet(fighter.wallet)}</div></div><div className="stats-card"><div className="stats-title"><span>COMBAT BUILD</span><strong>{fighter.stats.hp} HP</strong></div><StatBar label="ATK" value={fighter.stats.atk} /><StatBar label="DEF" value={fighter.stats.def} /><StatBar label="SPD" value={fighter.stats.spd} /><StatBar label="CRIT" value={fighter.stats.crit} max={45} /><StatBar label="LUCK" value={fighter.stats.luck} /><div className="signature"><span>SIGNATURE MOVE</span><strong>{fighter.signature}</strong><Zap /></div></div><div className="reveal-actions"><button className="primary-button" onClick={onChallenge}><Swords /> CHALLENGE A WALLET</button><button className="secondary-button" onClick={onShare}><Share2 /> SHARE FIGHTER</button></div></section>;
}

function BattleIntro({ player, opponent, ready }: { player: Fighter; opponent: Fighter; ready: boolean }) { return <section className="battle-intro"><div className="intro-fighter opponent"><FighterAvatar fighter={opponent} size="small" flipped /><p>LV.{opponent.level}</p><h2>{opponent.title}</h2><span>{opponent.stats.hp} HP</span></div><div className="vs-mark"><span>V</span><span>S</span></div><div className="intro-fighter player"><FighterAvatar fighter={player} size="small" /><p>LV.{player.level}</p><h2>{player.title}</h2><span>{player.stats.hp} HP</span></div><div className={`battle-start ${ready ? "show" : ""}`}>BATTLE START</div></section>; }
function HpBar({ fighter, hp, side }: { fighter: Fighter; hp: number; side: string }) { return <div className={`hp-block ${side}`}><div><span>{side === "player" ? "YOU" : "RIVAL"} · LV.{fighter.level}</span><strong>{fighter.title}</strong></div><div className="hp-numbers"><b>{hp}</b> / {fighter.stats.hp}</div><div className="hp-track"><span style={{ width: `${(hp / fighter.stats.hp) * 100}%`, background: fighter.color }} /></div></div>; }
function BattleScreen({ result, hp, action, actionIndex }: { result: BattleResult; hp: { player: number; opponent: number }; action: BattleResult["rounds"][number] | null; actionIndex: number }) { const playerAttacks = action?.attacker === "player"; return <section className={`battle-screen ${action?.critical ? "is-critical" : ""}`}><div className="battle-round">ROUND {Math.floor(actionIndex / 2) + 1}<span>LIVE</span></div><div className="combatant opponent"><HpBar fighter={result.opponent} hp={hp.opponent} side="opponent" /><FighterAvatar fighter={result.opponent} size="small" flipped active={!playerAttacks} hit={playerAttacks} /></div><div className="combat-feed" key={actionIndex}>{action?.special && <strong>{action.special}</strong>}{action?.critical && <b>CRITICAL</b>}<span className="damage-pop">−{action?.damage ?? 0} HP</span><p>{action?.message}</p></div><div className="combatant player"><FighterAvatar fighter={result.player} size="small" active={playerAttacks} hit={!playerAttacks} /><HpBar fighter={result.player} hp={hp.player} side="player" /></div><div className="battle-log-mini">{result.rounds.slice(Math.max(0, actionIndex - 2), actionIndex + 1).map((round) => <p key={round.turn}><span>0{round.turn}</span>{round.special || round.message}</p>)}</div></section>; }

function ResultScreen({ result, onWhy, onAgain, onShare }: { result: BattleResult; onWhy: () => void; onAgain: () => void; onShare: () => void }) { const won = result.winner === "player"; return <section className={`result-screen ${won ? "won" : "lost"}`}><p className="eyebrow">BATTLE COMPLETE</p><h1>{won ? "YOU WIN" : <>YOU GOT<br />LIQUIDATED</>}</h1><div className="score-card"><div><FighterAvatar fighter={result.player} size="small" /><span>YOU</span><strong>{result.player.class}</strong></div><p><b>{result.score[0]}</b><i>—</i><b>{result.score[1]}</b></p><div><FighterAvatar fighter={result.opponent} size="small" flipped /><span>RIVAL</span><strong>{result.opponent.class}</strong></div></div><div className="mvp-card"><Trophy /><div><span>MVP MOVE</span><strong>{result.mvp.special || result.mvp.message}</strong><p>{result.mvp.critical ? "CRITICAL · " : ""}−{result.mvp.damage} HP</p></div></div><div className="damage-summary"><div><span>DAMAGE DEALT</span><strong>{result.playerDamage}</strong></div><div><span>DAMAGE TAKEN</span><strong>{result.opponentDamage}</strong></div><div><span>TURNS</span><strong>{result.rounds.length}</strong></div></div><button className="primary-button" onClick={onWhy}>{won ? "WHY DID I WIN?" : "WHY DID I LOSE?"}</button><div className="split-actions"><button className="secondary-button" onClick={onAgain}><RotateCcw /> AGAIN</button><button className="secondary-button" onClick={onShare}><Share2 /> SHARE</button></div></section>; }

function WhyScreen({ result, onBack, onAgain, onScout }: { result: BattleResult; onBack: () => void; onAgain: () => void; onScout: () => void }) {
  const won = result.winner === "player"; const comparisons = [["ENTRY SPEED", "spd", "Faster wallets take control before momentum forms."], ["PROFIT POWER", "atk", "The harder-hitting build converted more openings."], ["RISK CONTROL", "def", "Defense softened the worst of the volatility."]] as const; const rivalInfo = CLASS_INFO[result.opponent.class];
  return <section className="why-screen"><button className="text-back" onClick={onBack}>← RESULT</button><p className="eyebrow">POST-MARKET ANALYSIS</p><h1>WHY YOU {won ? "WON" : "LOST"}</h1><p className="why-lead">{won ? "Your build found the edge in the moments that mattered." : "Your rival exposed three gaps in your build."}</p><div className="comparison-list">{comparisons.map(([label, stat, copy]) => { const you = result.player.stats[stat]; const them = result.opponent.stats[stat]; const edge = you === them ? "EVEN" : you > them ? "YOU" : "RIVAL"; return <article key={stat}><header><h2>{label}</h2><span className={edge === "YOU" ? "you" : ""}>{edge} EDGE</span></header><div className="compare-values"><div><small>YOU</small><strong>{you}</strong><i style={{ width: `${you}%` }} /></div><div><small>RIVAL</small><strong>{them}</strong><i style={{ width: `${them}%` }} /></div></div><p>{copy}</p></article>; })}</div><div className="profile-card"><span>OPPONENT PROFILE</span><h2>{result.opponent.emoji} {result.opponent.title}</h2><div><p><small>STRENGTH</small>{rivalInfo.strength}</p><p><small>WEAKNESS</small>{rivalInfo.weakness}</p></div></div><button className="locked-report" onClick={onScout}><span>🔒</span><div><strong>FULL SCOUT REPORT</strong><small>Entry behavior · Risk profile · Head-to-head</small></div><b>VIEW</b></button><button className="primary-button" onClick={onAgain}><Swords /> CHALLENGE AGAIN</button></section>;
}

function ShareBattleCard({ result }: { result: BattleResult }) { const winner = result.winner === "player" ? result.player : result.opponent; return <div className="share-card"><p>WALLET BATTLE</p><div className="share-versus"><div><span>{result.player.emoji}</span><strong>{shortWallet(result.player.wallet)}</strong><small>{result.player.title}</small></div><b>{result.score[0]} — {result.score[1]}</b><div><span>{result.opponent.emoji}</span><strong>{shortWallet(result.opponent.wallet)}</strong><small>{result.opponent.title}</small></div></div><h3>🏆 {winner.class} WINS</h3><div><small>MVP MOVE</small><strong>{result.mvp.special || winner.signature}</strong><span>−{result.mvp.damage} HP</span></div><footer>WALLET RPG · YOUR WALLET IS YOUR FIGHTER</footer></div>; }
function ShareFighterCard({ fighter }: { fighter: Fighter }) { return <div className="share-card fighter-share"><p>WALLET FIGHTER</p><span className="share-emoji">{fighter.emoji}</span><h3>{fighter.title}</h3><strong>LV.{fighter.level}</strong><div><small>SIGNATURE MOVE</small><strong>{fighter.signature}</strong><span>{fighter.personality}</span></div><footer>WALLET RPG · {shortWallet(fighter.wallet)}</footer></div>; }
