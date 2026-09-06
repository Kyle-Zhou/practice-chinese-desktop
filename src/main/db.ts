import Database from 'better-sqlite3'
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { NEW_CARD_STATE, schedule } from '../shared/sm2'
import type {
  Card,
  Correction,
  Deck,
  Grade,
  NewCardInput,
  NewDeckInput,
  PlanCheckpoint,
  Scenario,
  TutorMessage,
  TutorSession
} from '../shared/types'

let db: Database.Database

export function initDatabase(dbPath?: string): void {
  const path = dbPath ?? join(app.getPath('userData'), 'chinese-anki.db')
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate()
}

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      hanzi TEXT NOT NULL,
      pinyin TEXT NOT NULL,
      english TEXT NOT NULL,
      audio_path TEXT,
      notes TEXT,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      due_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cards_deck_id ON cards(deck_id);
    CREATE INDEX IF NOT EXISTS idx_cards_due_at ON cards(due_at);

    CREATE TABLE IF NOT EXISTS review_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      grade TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      interval_before REAL NOT NULL,
      interval_after REAL NOT NULL,
      ease_before REAL NOT NULL,
      ease_after REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      plan TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tutor_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id INTEGER NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
      completed_checkpoint_ids TEXT NOT NULL DEFAULT '[]',
      transcript TEXT NOT NULL DEFAULT '[]',
      corrections TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
  `)
}

interface DeckRow {
  id: number
  name: string
  description: string | null
  created_at: string
  card_count: number
  due_count: number
}

interface CardRow {
  id: number
  deck_id: number
  hanzi: string
  pinyin: string
  english: string
  audio_path: string | null
  notes: string | null
  ease_factor: number
  interval_days: number
  repetitions: number
  due_at: string
  last_reviewed_at: string | null
  created_at: string
}

function deckFromRow(row: DeckRow): Deck {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    cardCount: row.card_count,
    dueCount: row.due_count
  }
}

function cardFromRow(row: CardRow): Card {
  return {
    id: row.id,
    deckId: row.deck_id,
    hanzi: row.hanzi,
    pinyin: row.pinyin,
    english: row.english,
    audioPath: row.audio_path,
    notes: row.notes,
    easeFactor: row.ease_factor,
    intervalDays: row.interval_days,
    repetitions: row.repetitions,
    dueAt: row.due_at,
    lastReviewedAt: row.last_reviewed_at,
    createdAt: row.created_at
  }
}

export function listDecks(): Deck[] {
  const now = new Date().toISOString()
  const rows = db
    .prepare(
      `SELECT
        d.id, d.name, d.description, d.created_at,
        (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count,
        (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.due_at <= @now) AS due_count
      FROM decks d
      ORDER BY d.id ASC`
    )
    .all({ now }) as DeckRow[]
  return rows.map(deckFromRow)
}

export function getAllDueCount(): number {
  const now = new Date().toISOString()
  const row = db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE due_at <= ?`).get(now) as { n: number }
  return row.n
}

export function createDeck(input: NewDeckInput): Deck {
  const createdAt = new Date().toISOString()
  const result = db
    .prepare(`INSERT INTO decks (name, description, created_at) VALUES (?, ?, ?)`)
    .run(input.name, input.description ?? null, createdAt)
  return getDeckById(result.lastInsertRowid as number)
}

export function getDeckById(id: number): Deck {
  const now = new Date().toISOString()
  const row = db
    .prepare(
      `SELECT
        d.id, d.name, d.description, d.created_at,
        (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count,
        (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.due_at <= @now) AS due_count
      FROM decks d WHERE d.id = @id`
    )
    .get({ id, now }) as DeckRow
  return deckFromRow(row)
}

export function deleteDeck(id: number): void {
  db.prepare(`DELETE FROM decks WHERE id = ?`).run(id)
}

export function getCardsForDeck(deckId: number): Card[] {
  const rows = db.prepare(`SELECT * FROM cards WHERE deck_id = ? ORDER BY id ASC`).all(deckId) as CardRow[]
  return rows.map(cardFromRow)
}

export function addCard(input: NewCardInput): Card {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `INSERT INTO cards (deck_id, hanzi, pinyin, english, audio_path, notes, ease_factor, interval_days, repetitions, due_at, last_reviewed_at, created_at)
       VALUES (@deckId, @hanzi, @pinyin, @english, @audioPath, @notes, @easeFactor, @intervalDays, @repetitions, @dueAt, NULL, @createdAt)`
    )
    .run({
      deckId: input.deckId,
      hanzi: input.hanzi,
      pinyin: input.pinyin,
      english: input.english,
      audioPath: input.audioPath ?? null,
      notes: input.notes ?? null,
      easeFactor: NEW_CARD_STATE.easeFactor,
      intervalDays: NEW_CARD_STATE.intervalDays,
      repetitions: NEW_CARD_STATE.repetitions,
      dueAt: now,
      createdAt: now
    })
  return getCardById(result.lastInsertRowid as number)
}

export function getCardById(id: number): Card {
  const row = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as CardRow
  return cardFromRow(row)
}

export function updateCard(
  id: number,
  fields: Partial<Pick<Card, 'hanzi' | 'pinyin' | 'english' | 'audioPath' | 'notes'>>
): Card {
  const current = getCardById(id)
  const merged = { ...current, ...fields }
  db.prepare(
    `UPDATE cards SET hanzi = @hanzi, pinyin = @pinyin, english = @english, audio_path = @audioPath, notes = @notes WHERE id = @id`
  ).run({
    id,
    hanzi: merged.hanzi,
    pinyin: merged.pinyin,
    english: merged.english,
    audioPath: merged.audioPath,
    notes: merged.notes
  })
  return getCardById(id)
}

export function deleteCard(id: number): void {
  db.prepare(`DELETE FROM cards WHERE id = ?`).run(id)
}

/** Cards due now, across one deck or (deckId=null) across every deck. */
export function getDueCards(deckId: number | null, limit = 200): Card[] {
  const now = new Date().toISOString()
  const rows = (
    deckId === null
      ? db
          .prepare(`SELECT * FROM cards WHERE due_at <= ? ORDER BY due_at ASC LIMIT ?`)
          .all(now, limit)
      : db
          .prepare(`SELECT * FROM cards WHERE deck_id = ? AND due_at <= ? ORDER BY due_at ASC LIMIT ?`)
          .all(deckId, now, limit)
  ) as CardRow[]
  return rows.map(cardFromRow)
}

export function submitReview(cardId: number, grade: Grade): Card {
  const card = getCardById(cardId)
  const now = new Date()
  const before = { easeFactor: card.easeFactor, intervalDays: card.intervalDays, repetitions: card.repetitions }
  const result = schedule(before, grade, now)

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE cards SET ease_factor = @easeFactor, interval_days = @intervalDays, repetitions = @repetitions, due_at = @dueAt, last_reviewed_at = @lastReviewedAt WHERE id = @id`
    ).run({
      id: cardId,
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      repetitions: result.repetitions,
      dueAt: result.dueAt.toISOString(),
      lastReviewedAt: now.toISOString()
    })
    db.prepare(
      `INSERT INTO review_log (card_id, grade, reviewed_at, interval_before, interval_after, ease_before, ease_after)
       VALUES (@cardId, @grade, @reviewedAt, @intervalBefore, @intervalAfter, @easeBefore, @easeAfter)`
    ).run({
      cardId,
      grade,
      reviewedAt: now.toISOString(),
      intervalBefore: before.intervalDays,
      intervalAfter: result.intervalDays,
      easeBefore: before.easeFactor,
      easeAfter: result.easeFactor
    })
  })
  tx()

  return getCardById(cardId)
}

export function getMeta(key: string): string | null {
  const row = db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    key,
    value
  )
}

export function deckExistsByName(name: string): boolean {
  const row = db.prepare(`SELECT 1 FROM decks WHERE name = ?`).get(name)
  return row !== undefined
}

export function seedDeck(name: string, description: string, cards: NewCardInput[]): void {
  const tx = db.transaction(() => {
    if (deckExistsByName(name)) return
    const deck = createDeck({ name, description })
    for (const c of cards) {
      addCard({ ...c, deckId: deck.id })
    }
  })
  tx()
}

// --- AI Tutor ---

interface ScenarioRow {
  id: number
  name: string
  description: string
  plan: string
  created_at: string
}

interface TutorSessionRow {
  id: number
  scenario_id: number
  completed_checkpoint_ids: string
  transcript: string
  corrections: string
  status: 'active' | 'completed'
  created_at: string
}

function scenarioFromRow(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    plan: JSON.parse(row.plan) as PlanCheckpoint[]
  }
}

export function listScenarios(): Scenario[] {
  const rows = db.prepare(`SELECT * FROM scenarios ORDER BY id ASC`).all() as ScenarioRow[]
  return rows.map(scenarioFromRow)
}

export function getScenarioById(id: number): Scenario {
  const row = db.prepare(`SELECT * FROM scenarios WHERE id = ?`).get(id) as ScenarioRow
  return scenarioFromRow(row)
}

export function scenarioExistsByName(name: string): boolean {
  const row = db.prepare(`SELECT 1 FROM scenarios WHERE name = ?`).get(name)
  return row !== undefined
}

export function seedScenario(name: string, description: string, plan: PlanCheckpoint[]): void {
  if (scenarioExistsByName(name)) return
  db.prepare(`INSERT INTO scenarios (name, description, plan, created_at) VALUES (?, ?, ?, ?)`).run(
    name,
    description,
    JSON.stringify(plan),
    new Date().toISOString()
  )
}

function tutorSessionFromRow(row: TutorSessionRow, scenario: Scenario): TutorSession {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioName: scenario.name,
    scenarioDescription: scenario.description,
    plan: scenario.plan,
    completedCheckpointIds: JSON.parse(row.completed_checkpoint_ids) as string[],
    transcript: JSON.parse(row.transcript) as TutorMessage[],
    corrections: JSON.parse(row.corrections) as Correction[],
    status: row.status,
    createdAt: row.created_at
  }
}

export function createTutorSession(scenarioId: number): TutorSession {
  const createdAt = new Date().toISOString()
  const result = db
    .prepare(
      `INSERT INTO tutor_sessions (scenario_id, completed_checkpoint_ids, transcript, corrections, status, created_at)
       VALUES (?, '[]', '[]', '[]', 'active', ?)`
    )
    .run(scenarioId, createdAt)
  return getTutorSession(result.lastInsertRowid as number)
}

export function getTutorSession(id: number): TutorSession {
  const row = db.prepare(`SELECT * FROM tutor_sessions WHERE id = ?`).get(id) as TutorSessionRow
  const scenario = getScenarioById(row.scenario_id)
  return tutorSessionFromRow(row, scenario)
}

export function appendTutorTurn(
  sessionId: number,
  userMessage: string,
  assistantMessage: string,
  newCorrections: Correction[],
  newCompletedCheckpointIds: string[]
): TutorSession {
  const session = getTutorSession(sessionId)
  const transcript: TutorMessage[] = [
    ...session.transcript,
    { role: 'user', text: userMessage },
    { role: 'assistant', text: assistantMessage }
  ]
  const corrections = [...session.corrections, ...newCorrections]
  const completedCheckpointIds = Array.from(
    new Set([...session.completedCheckpointIds, ...newCompletedCheckpointIds])
  )

  db.prepare(
    `UPDATE tutor_sessions SET transcript = ?, corrections = ?, completed_checkpoint_ids = ? WHERE id = ?`
  ).run(JSON.stringify(transcript), JSON.stringify(corrections), JSON.stringify(completedCheckpointIds), sessionId)

  return getTutorSession(sessionId)
}

export function completeTutorSession(sessionId: number): TutorSession {
  db.prepare(`UPDATE tutor_sessions SET status = 'completed' WHERE id = ?`).run(sessionId)
  return getTutorSession(sessionId)
}

// --- Settings (encrypted API key) ---

const API_KEY_META_KEY = 'anthropic_api_key_encrypted'

export function hasApiKey(): boolean {
  return getMeta(API_KEY_META_KEY) !== null
}

export function getApiKey(): string | null {
  const stored = getMeta(API_KEY_META_KEY)
  if (!stored) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  return safeStorage.decryptString(Buffer.from(stored, 'base64'))
}

export function setApiKey(key: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level credential encryption is not available on this machine')
  }
  const encrypted = safeStorage.encryptString(key)
  setMeta(API_KEY_META_KEY, encrypted.toString('base64'))
}

export function clearApiKey(): void {
  db.prepare(`DELETE FROM meta WHERE key = ?`).run(API_KEY_META_KEY)
}
