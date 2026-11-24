"use client";

import { useState } from "react";
import { NewtonStoryReport } from "@/components/NewtonStoryReport";
import {
  NEWTON_STORY_FIXTURES,
  type NewtonStoryFixtureName,
} from "@/data/newtonStoryFixtures";
import styles from "./newton-story.module.css";

const fixtureNames = Object.keys(NEWTON_STORY_FIXTURES) as NewtonStoryFixtureName[];

export default function NewtonStoryPreviewPage() {
  const [fixture, setFixture] = useState<NewtonStoryFixtureName>("FULL_EVIDENCE");

  return <main className={styles.page}>
    <aside className={styles.fixturePicker} aria-label="Newton story fixture picker">
      <strong>NEWTON STORY · DEV PREVIEW</strong>
      <div>
        {fixtureNames.map((name) => <button
          className={name === fixture ? styles.active : ""}
          type="button"
          key={name}
          onClick={() => setFixture(name)}
        >{name}</button>)}
      </div>
    </aside>
    <NewtonStoryReport key={fixture} story={NEWTON_STORY_FIXTURES[fixture]} embedded />
  </main>;
}
