import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getMeta, seedDeck, seedScenario, setMeta } from './db'
import type { NewCardInput, PlanCheckpoint } from '../shared/types'

interface SeedWord {
  hanzi: string
  pinyin: string
  english: string
}

interface SeedScenario {
  name: string
  description: string
  plan: PlanCheckpoint[]
}

/** Bump this whenever seed/*.json content changes so existing installs pick up new decks/scenarios. */
const SEED_VERSION = '2'

const SEED_DECKS = [
  { file: 'hsk1.json', name: 'HSK 1', description: 'HSK Level 1 vocabulary (150 words)' },
  { file: 'hsk2.json', name: 'HSK 2', description: 'HSK Level 2 vocabulary (150 words)' },
  { file: 'hsk3.json', name: 'HSK 3', description: 'HSK Level 3 vocabulary (300 words)' }
]

function seedDir(): string {
  // In dev, seed/ lives at the project root. In a packaged build it's bundled as an extra resource.
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

  const scenarios = JSON.parse(readFileSync(join(dir, 'scenarios.json'), 'utf-8')) as SeedScenario[]
  for (const scenario of scenarios) {
    seedScenario(scenario.name, scenario.description, scenario.plan)
  }

  setMeta('seed_version', SEED_VERSION)
}
