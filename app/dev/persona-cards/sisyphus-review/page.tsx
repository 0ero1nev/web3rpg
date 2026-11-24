import { PersonaCard } from "@/components/PersonaCard";
import { mockPersonaCards } from "@/data/mockPersonaCards";
import styles from "./sisyphus-review.module.css";

export default function SisyphusReviewPage() {
  const sisyphus = mockPersonaCards.find((card) => card.id === "sisyphus");

  if (!sisyphus) return null;

  return <main className={styles.review}>
    <div className={styles.label}>SISYPHUS · 794 × 1134 REVIEW RENDER</div>
    <div className={styles.card}>
      <PersonaCard data={sisyphus} />
    </div>
  </main>;
}
