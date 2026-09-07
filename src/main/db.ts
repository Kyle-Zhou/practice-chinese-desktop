import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { NEW_CARD_STATE, schedule } from '../shared/sm2'
import { mergeCompleted, planProgress } from '../shared/plan'
import type {
  Card,
  Correction,
  CorrectionMode,
  Deck,
  Grade,
  NewCardInput,
  NewDeckInput,
  PlanCheckpoint,
  Scenario,
  ScenarioKind,
  TutorMessage,
  TutorSession,
  TutorSessionSummaryRow,
  TutorSummary,
  VocabCandidate
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
    CREATE INDEX IF NOT EXISTS idx_cards_hanzi ON cards(hanzi);

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

  // Additive column migrations. SQLite has no ADD COLUMN IF NOT EXISTS, so check first.
  addColumnIfMissing('scenarios', 'tutor_role', `TEXT NOT NULL DEFAULT ''`)
  addColumnIfMissing('scenarios', 'kind', `TEXT NOT NULL DEFAULT 'roleplay'`)
  addColumnIfMissing('scenarios', 'custom', `INTEGER NOT NULL DEFAULT 0`)
  addColumnIfMissing('tutor_sessions', 'vocab_added', `TEXT NOT NULL DEFAULT '[]'`)
  addColumnIfMissing('tutor_sessions', 'correction_mode', `TEXT NOT NULL DEFAULT 'inline'`)
  addColumnIfMissing('tutor_sessions', 'summary', `TEXT`)
  addColumnIfMissing('tutor_sessions', 'updated_at', `TEXT NOT NULL DEFAULT ''`)
  db.exec(`UPDATE tutor_sessions SET updated_at = created_at WHERE updated_at = ''`)
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (columns.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
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

const DECK_SELECT = `
  SELECT
    d.id, d.name, d.description, d.created_at,
    (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count,
    (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id AND c.due_at <= @now) AS due_count
  FROM decks d`

export function listDecks(): Deck[] {
  const now = new Date().toISOString()
  const rows = db.prepare(`${DECK_SELECT} ORDER BY d.id ASC`).all({ now }) as DeckRow[]
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
  const row = db.prepare(`${DECK_SELECT} WHERE d.id = @id`).get({ id, now }) as DeckRow
  return deckFromRow(row)
}

export function findDeckByName(name: string): Deck | null {
  const now = new Date().toISOString()
  const row = db.prepare(`${DECK_SELECT} WHERE d.name = @name`).get({ name, now }) as DeckRow | undefined
  return row ? deckFromRow(row) : null
}

/** Returns the deck with this name, creating it if needed. */
export function ensureDeck(name: string, description: string): Deck {
  return findDeckByName(name) ?? createDeck({ name, description })
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

/** True if any deck already has a card for this hanzi (used to avoid duplicate tutor vocab). */
export function cardExistsWithHanzi(hanzi: string): boolean {
  return db.prepare(`SELECT 1 FROM cards WHERE hanzi = ? LIMIT 1`).get(hanzi) !== undefined
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
      ? db.prepare(`SELECT * FROM cards WHERE due_at <= ? ORDER BY due_at ASC LIMIT ?`).all(now, limit)
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

// --- Meta (key/value store used by settings and seeding) ---

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

export function deleteMeta(key: string): void {
  db.prepare(`DELETE FROM meta WHERE key = ?`).run(key)
}

export function deckExistsByName(name: string): boolean {
  return findDeckByName(name) !== null
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

// --- AI Tutor: scenarios ---

interface ScenarioRow {
  id: number
  kind: ScenarioKind
  name: string
  description: string
  tutor_role: string
  plan: string
  custom: number
  created_at: string
}

function scenarioFromRow(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    tutorRole: row.tutor_role,
    plan: JSON.parse(row.plan) as PlanCheckpoint[],
    custom: row.custom === 1
  }
}

export interface ScenarioInput {
  kind: ScenarioKind
  name: string
  description: string
  tutorRole: string
  plan: PlanCheckpoint[]
}

export function listScenarios(): Scenario[] {
  const rows = db.prepare(`SELECT * FROM scenarios ORDER BY id ASC`).all() as ScenarioRow[]
  return rows.map(scenarioFromRow)
}

export function getScenarioById(id: number): Scenario {
  const row = db.prepare(`SELECT * FROM scenarios WHERE id = ?`).get(id) as ScenarioRow
  return scenarioFromRow(row)
}

/** Inserts or refreshes a seeded scenario so plan edits in seed/scenarios.json reach existing installs. */
export function upsertScenario(input: ScenarioInput): void {
  db.prepare(
    `INSERT INTO scenarios (kind, name, description, tutor_role, plan, custom, created_at)
     VALUES (@kind, @name, @description, @tutorRole, @plan, 0, @createdAt)
     ON CONFLICT(name) DO UPDATE SET kind = excluded.kind, description = excluded.description, tutor_role = excluded.tutor_role, plan = excluded.plan`
  ).run({ ...input, plan: JSON.stringify(input.plan), createdAt: new Date().toISOString() })
}

/** Creates a learner-authored scenario. Names are made unique so a repeated theme never collides with a seed. */
export function createCustomScenario(input: ScenarioInput): Scenario {
  let name = input.name
  for (let n = 2; db.prepare(`SELECT 1 FROM scenarios WHERE name = ?`).get(name); n++) name = `${input.name} (${n})`
  const result = db
    .prepare(
      `INSERT INTO scenarios (kind, name, description, tutor_role, plan, custom, created_at)
       VALUES (@kind, @name, @description, @tutorRole, @plan, 1, @createdAt)`
    )
    .run({ ...input, name, plan: JSON.stringify(input.plan), createdAt: new Date().toISOString() })
  return getScenarioById(result.lastInsertRowid as number)
}

export function deleteScenario(id: number): void {
  db.prepare(`DELETE FROM scenarios WHERE id = ? AND custom = 1`).run(id)
}

// --- AI Tutor: sessions ---

interface TutorSessionRow {
  id: number
  scenario_id: number
  completed_checkpoint_ids: string
  transcript: string
  corrections: string
  vocab_added: string
  correction_mode: CorrectionMode
  status: 'active' | 'completed'
  summary: string | null
  created_at: string
  updated_at: string
}

function tutorSessionFromRow(row: TutorSessionRow, scenario: Scenario): TutorSession {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    scenarioKind: scenario.kind,
    scenarioName: scenario.name,
    scenarioDescription: scenario.description,
    tutorRole: scenario.tutorRole,
    plan: scenario.plan,
    completedCheckpointIds: JSON.parse(row.completed_checkpoint_ids) as string[],
    transcript: JSON.parse(row.transcript) as TutorMessage[],
    corrections: JSON.parse(row.corrections) as Correction[],
    vocabAdded: JSON.parse(row.vocab_added) as VocabCandidate[],
    correctionMode: row.correction_mode,
    status: row.status,
    summary: row.summary ? (JSON.parse(row.summary) as TutorSummary) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function createTutorSession(scenarioId: number, correctionMode: CorrectionMode): TutorSession {
  const now = new Date().toISOString()
  const result = db
    .prepare(
      `INSERT INTO tutor_sessions (scenario_id, correction_mode, status, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?)`
    )
    .run(scenarioId, correctionMode, now, now)
  return getTutorSession(result.lastInsertRowid as number)
}

export function getTutorSession(id: number): TutorSession {
  const row = db.prepare(`SELECT * FROM tutor_sessions WHERE id = ?`).get(id) as TutorSessionRow | undefined
  if (!row) throw new Error(`Tutor session ${id} not found`)
  const scenario = getScenarioById(row.scenario_id)
  return tutorSessionFromRow(row, scenario)
}

export function listTutorSessions(): TutorSessionSummaryRow[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.scenario_id, s.status, s.completed_checkpoint_ids, s.transcript, s.updated_at, sc.name AS scenario_name, sc.plan
       FROM tutor_sessions s JOIN scenarios sc ON sc.id = s.scenario_id
       ORDER BY s.updated_at DESC LIMIT 50`
    )
    .all() as {
    id: number
    scenario_id: number
    status: 'active' | 'completed'
    completed_checkpoint_ids: string
    transcript: string
    updated_at: string
    scenario_name: string
    plan: string
  }[]
  return rows.map((r) => {
    const plan = JSON.parse(r.plan) as PlanCheckpoint[]
    const transcript = JSON.parse(r.transcript) as TutorMessage[]
    return {
      id: r.id,
      scenarioId: r.scenario_id,
      scenarioName: r.scenario_name,
      status: r.status,
      progressPercent: planProgress(plan, JSON.parse(r.completed_checkpoint_ids) as string[]),
      turnCount: transcript.filter((m) => m.role === 'user').length,
      updatedAt: r.updated_at
    }
  })
}

export function deleteTutorSession(id: number): void {
  db.prepare(`DELETE FROM tutor_sessions WHERE id = ?`).run(id)
}

export interface TurnRecord {
  userMessage: TutorMessage
  assistantMessage: TutorMessage
  corrections: Correction[]
  completedCheckpointIds: string[]
  vocabAdded: VocabCandidate[]
}

/** Persists one completed exchange atomically and returns the refreshed session. */
export function appendTutorTurn(sessionId: number, turn: TurnRecord): TutorSession {
  const tx = db.transaction(() => {
    const session = getTutorSession(sessionId)
    const turnIndex = session.transcript.length
    const transcript: TutorMessage[] = [...session.transcript, turn.userMessage, turn.assistantMessage]
    const corrections = [...session.corrections, ...turn.corrections.map((c) => ({ ...c, turnIndex }))]
    const completedCheckpointIds = mergeCompleted(session.plan, session.completedCheckpointIds, turn.completedCheckpointIds)
    const vocabAdded = [...session.vocabAdded, ...turn.vocabAdded]

    db.prepare(
      `UPDATE tutor_sessions
       SET transcript = ?, corrections = ?, completed_checkpoint_ids = ?, vocab_added = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      JSON.stringify(transcript),
      JSON.stringify(corrections),
      JSON.stringify(completedCheckpointIds),
      JSON.stringify(vocabAdded),
      new Date().toISOString(),
      sessionId
    )
  })
  tx()
  return getTutorSession(sessionId)
}

/** Stores a tutor-initiated opening line (the tutor speaks first, like answering a call). */
export function appendAssistantMessage(sessionId: number, text: string): TutorSession {
  const session = getTutorSession(sessionId)
  const transcript: TutorMessage[] = [...session.transcript, { role: 'assistant', text }]
  db.prepare(`UPDATE tutor_sessions SET transcript = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(transcript),
    new Date().toISOString(),
    sessionId
  )
  return getTutorSession(sessionId)
}

export function completeTutorSession(sessionId: number, summary: TutorSummary): TutorSession {
  db.prepare(`UPDATE tutor_sessions SET status = 'completed', summary = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(summary),
    new Date().toISOString(),
    sessionId
  )
  return getTutorSession(sessionId)
}
