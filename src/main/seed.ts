import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { clearLessonProgress, getMeta, seedDeck, setMeta, upsertLesson, upsertScenario } from './db'
import { ensureProgressDeck } from './lessons'
import type { LessonRecord, NewCardInput, PlanCheckpoint, ScenarioKind } from '../shared/types'

interface SeedWord {
  hanzi: string
  pinyin: string
  english: string
}

interface SeedScenario {
  kind: ScenarioKind
  name: string
  description: string
  tutorRole: string
  plan: PlanCheckpoint[]
}

/** Bump this whenever seed/*.json content changes so existing installs pick up new decks/scenarios. */
const SEED_VERSION = '6'

const SEED_DECKS = [
  { file: 'hsk1.json', name: 'HSK 1', description: 'HSK Level 1 vocabulary (150 words)' },
  { file: 'hsk2.json', name: 'HSK 2', description: 'HSK Level 2 vocabulary (150 words)' },
  { file: 'hsk3.json', name: 'HSK 3', description: 'HSK Level 3 vocabulary (300 words)' }
]

export function seedDir(): string {
  // In dev, seed/ lives at the project root. In a packaged build it's bundled as an extra
  // resource. CHINESE_ANKI_SEED_DIR overrides both, which is what smoke runs use.
  const override = process.env['CHINESE_ANKI_SEED_DIR']
  if (override) return override
  return app.isPackaged ? join(process.resourcesPath, 'seed') : join(app.getAppPath(), 'seed')
}

export function seedIfNeeded(): void {
  if (getMeta('seed_version') === SEED_VERSION) return

  const dir = seedDir()
  for (const deck of SEED_DECKS) {
    const words = JSON.parse(readFileSync(join(dir, deck.file), 'utf-8')) as SeedWord[]
    const cards: NewCardInput[] = words.map((w) => ({
      deckId: 0,
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      english: w.english
    }))
    seedDeck(deck.name, deck.description, cards)
  }

  // Scenarios are upserted (not skipped) so plan tweaks reach existing installs; sessions
  // reference scenarios by id, so a refreshed plan never orphans past sessions.
  const scenarios = JSON.parse(readFileSync(join(dir, 'scenarios.json'), 'utf-8')) as SeedScenario[]
  for (const scenario of scenarios) {
    upsertScenario(scenario)
  }

  // Lessons are upserted so refreshed content (better example sentences, say) reaches existing
  // installs. Progress is cleared first because lesson ids are positional (hsk1-03…): the v6
  // regrouping into themes means an id now points at different words, so carrying over a
  // "completed" flag would be wrong. A fresh install simply has nothing to clear.
  clearLessonProgress()
  const lessons = JSON.parse(readFileSync(join(dir, 'lessons.json'), 'utf-8')) as LessonRecord[]
  for (const lesson of lessons) {
    upsertLesson(lesson)
  }

  // Create the progress deck up front so it can be browsed (and quick-added to) before the
  // first lesson is finished.
  ensureProgressDeck()

  setMeta('seed_version', SEED_VERSION)
}
