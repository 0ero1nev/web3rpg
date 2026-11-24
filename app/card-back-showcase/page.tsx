import { CardBackArtwork } from "@/components/CardBackArtwork";
import styles from "./card-back-showcase.module.css";

const reviewSizes = [
  { label: "50%", detail: "140 × 200", width: 140, id: "half" },
  { label: "25%", detail: "70 × 100", width: 70, id: "quarter" },
  { label: "12%", detail: "35 × 50", width: 35, id: "tiny" },
] as const;

export default function CardBackShowcasePage() {
  return <main className={styles.showcase}>
    <header className={styles.header}>
      <p>MASTER CARD BACK · REVIEW</p>
      <h1>ONCHAIN PERSONA</h1>
    </header>

    <section className={styles.master} aria-label="Master card back">
      <CardBackArtwork className={styles.masterCard} idPrefix="master" />
      <p>100%</p>
    </section>

    <section className={styles.scaleReview} aria-label="Card back scale review">
      {reviewSizes.map((size) => <figure key={size.id} className={styles.scaleItem} style={{ "--review-width": `${size.width}px` } as React.CSSProperties}>
        <div className={styles.scaleStage}>
          <CardBackArtwork className={styles.card} idPrefix={size.id} />
        </div>
        <figcaption><strong>{size.label}</strong><span>{size.detail}</span></figcaption>
      </figure>)}
    </section>
  </main>;
}
