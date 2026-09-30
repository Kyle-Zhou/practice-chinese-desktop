import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { NEW_CARD_STATE, schedule } from '../shared/sm2'
import { mergeCompleted, planProgress } from '../shared/plan'
import { normalizePinyin } from '../shared/pinyin'
import type {
  Card,
  Correction,
  CorrectionMode,
  Deck,
  DictionaryEntry,
  Grade,
  LessonDetail,
  LessonRecord,
  LessonStatus,
  LessonSummary,
  LessonWord,
  LevelWordGroup,
  NewCardInput,
  NewDeckInput,
  PlanCheckpoint,
  Scenario,
  ScenarioKind,
  StreakInfo,
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

    CREATE TABLE IF NOT EXISTS dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simplified TEXT NOT NULL,
      traditional TEXT NOT NULL,
      pinyin TEXT NOT NULL,
      pinyin_normalized TEXT NOT NULL,
      english TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dictionary_simplified ON dictionary(simplified);
    CREATE INDEX IF NOT EXISTS idx_dictionary_traditional ON dictionary(traditional);
    CREATE INDEX IF NOT EXISTS idx_dictionary_pinyin ON dictionary(pinyin_normalized);

    -- External-content FTS index: the glosses live in dictionary, so this only stores the
    -- inverted index and is rebuilt wholesale after an import.
    CREATE VIRTUAL TABLE IF NOT EXISTS dictionary_fts USING fts5(
      english,
      content='dictionary',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      words TEXT NOT NULL
    );

    -- A row exists only once a lesson has been started; everything else is derived.
    CREATE TABLE IF NOT EXISTS lesson_progress (
      lesson_id TEXT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      correct INTEGER,
      total INTEGER,
      started_at TEXT NOT NULL,
      completed_at TEXT
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

/** Correction mode is a session-time control, changeable mid-conversation (see prompts.ts's
 *  caching note: this busts the reply system prompt cache from the next turn on, which is an
 *  acceptable one-off cost for a rarely-toggled preference). */
export function setTutorCorrectionMode(sessionId: number, correctionMode: CorrectionMode): TutorSession {
  db.prepare(`UPDATE tutor_sessions SET correction_mode = ?, updated_at = ? WHERE id = ?`).run(
    correctionMode,
    new Date().toISOString(),
    sessionId
  )
  return getTutorSession(sessionId)
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

// --- Dictionary (CC-CEDICT) ---

export interface DictionaryImportRow {
  simplified: string
  traditional: string
  pinyin: string
  pinyinNormalized: string
  english: string
}

interface DictionaryRow {
  id: number
  simplified: string
  traditional: string
  pinyin: string
  english: string
}

/** Replaces the whole dictionary in one transaction, then rebuilds the external-content FTS index. */
export function replaceDictionary(rows: DictionaryImportRow[]): void {
  const insert = db.prepare(
    `INSERT INTO dictionary (simplified, traditional, pinyin, pinyin_normalized, english)
     VALUES (@simplified, @traditional, @pinyin, @pinyinNormalized, @english)`
  )
  const tx = db.transaction(() => {
    db.exec(`DELETE FROM dictionary`)
    for (const row of rows) insert.run(row)
    db.exec(`INSERT INTO dictionary_fts(dictionary_fts) VALUES('rebuild')`)
  })
  tx()
}

export function dictionaryEntryCount(): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM dictionary`).get() as { n: number }).n
}

const DICTIONARY_SELECT = `SELECT id, simplified, traditional, pinyin, english FROM dictionary`

const HAS_HANZI = /[㐀-鿿]/

/** Entries that only redirect elsewhere are legitimate but never what a learner is looking for. */
const LOW_VALUE_GLOSS = /^(variant of|old variant of|see |surname )/i

let commonWords: Set<string> | null = null

/**
 * CC-CEDICT carries no frequency data, so an obscure entry can outrank the word a learner
 * actually meant. The seeded HSK 1–4 vocabulary is a good enough frequency proxy: if a
 * headword is on it, it is almost certainly the intended answer.
 */
function commonWordSet(): Set<string> {
  if (commonWords) return commonWords
  commonWords = new Set()
  for (const row of db.prepare(`SELECT words FROM lessons`).all() as { words: string }[]) {
    for (const word of JSON.parse(row.words) as LessonWord[]) commonWords.add(word.hanzi)
  }
  return commonWords
}

function dictionaryFromRow(row: DictionaryRow): DictionaryEntry {
  return {
    id: row.id,
    simplified: row.simplified,
    traditional: row.traditional,
    pinyin: row.pinyin,
    english: row.english
  }
}

/**
 * Turns free text into an FTS5 MATCH expression: every word is quoted (so punctuation and
 * reserved words like NOT can't break the query) and the last one is a prefix term, which is
 * what makes the dropdown feel live while typing.
 */
function ftsQuery(query: string): string | null {
  const terms = query.toLowerCase().match(/[a-z0-9]+/g)
  if (!terms || terms.length === 0) return null
  return terms.map((term, i) => (i === terms.length - 1 ? `"${term}"*` : `"${term}"`)).join(' ')
}

/**
 * BM25 puts the obvious answer surprisingly deep — for "cup" it ranks 杯子 65th, behind 杯盖
 * and cupidity — so we pull a wide window of matches and re-rank them by how directly a gloss
 * answers the query, keeping BM25 order only as the tiebreak.
 */
function searchEnglish(query: string, limit: number): DictionaryRow[] {
  const match = ftsQuery(query)
  if (!match) return []
  const rows = db
    .prepare(
      `SELECT dictionary.id, dictionary.simplified, dictionary.traditional, dictionary.pinyin, dictionary.english
       FROM dictionary_fts JOIN dictionary ON dictionary.id = dictionary_fts.rowid
       WHERE dictionary_fts MATCH @match ORDER BY rank LIMIT @window`
    )
    .all({ match, window: Math.max(200, limit * 10) }) as DictionaryRow[]

  const needle = query.trim().toLowerCase()
  const common = commonWordSet()
  const score = (row: DictionaryRow): number => {
    const boost = common.has(row.simplified) ? -0.5 : 0
    const glosses = row.english.split('; ').map((g) => g.trim().toLowerCase())
    if (LOW_VALUE_GLOSS.test(row.english)) return 4
    if (glosses.includes(needle) || glosses.includes(`to ${needle}`)) return boost
    if (glosses.some((g) => g.startsWith(needle))) return 1 + boost
    return 2 + boost
  }
  return rows
    .map((row, index) => ({ row, index, score: score(row) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.row)
}

/**
 * One search box for three kinds of query. Hanzi input matches headwords, latin input is tried
 * as pinyin (toneless, so "nihao" and "nǐ hǎo" both work) and as English.
 *
 * Each strategy contributes a tier — an exact headword beats a prefix beats an English gloss —
 * but tiers are not absolute: a cross-reference-only entry ("variant of 杯") is pushed below
 * every real match, and a word from the HSK lists is pulled up, because that is nearly always
 * the one the learner meant.
 */
export function searchDictionary(query: string, limit = 20): DictionaryEntry[] {
  const trimmed = query.trim()
  if (!trimmed) return []

  const common = commonWordSet()
  const scored = new Map<number, { row: DictionaryRow; score: number; order: number }>()
  let order = 0

  // `preRanked` rows arrive in their own meaningful order (searchEnglish has already weighed
  // gloss quality against frequency), so they keep it; the others are ranked here.
  const collect = (rows: DictionaryRow[], tier: number, preRanked = false): void => {
    for (const row of rows) {
      const score = preRanked
        ? tier * 10
        : tier * 10 + (LOW_VALUE_GLOSS.test(row.english) ? 12 : 0) - (common.has(row.simplified) ? 1 : 0)
      const existing = scored.get(row.id)
      if (!existing || score < existing.score) scored.set(row.id, { row, score, order: existing?.order ?? order++ })
    }
  }

  // Rank over a wide slice rather than the first `limit` rows: the 5th 'mao' entry by rowid is
  // an obsolete variant, while 猫 is much further down the table.
  const window = Math.max(60, limit * 5)
  const run = (sql: string, params: Record<string, unknown>): DictionaryRow[] =>
    db.prepare(sql).all({ window, ...params }) as DictionaryRow[]

  if (HAS_HANZI.test(trimmed)) {
    collect(
      run(
        `${DICTIONARY_SELECT} WHERE simplified = @q OR traditional = @q ORDER BY LENGTH(simplified), id LIMIT @window`,
        { q: trimmed }
      ),
      0
    )
    collect(
      run(`${DICTIONARY_SELECT} WHERE simplified LIKE @prefix ORDER BY LENGTH(simplified), id LIMIT @window`, {
        prefix: `${trimmed}%`
      }),
      1
    )
  } else {
    const pinyin = normalizePinyin(trimmed)
    if (pinyin) {
      collect(
        run(`${DICTIONARY_SELECT} WHERE pinyin_normalized = @pinyin ORDER BY LENGTH(simplified), id LIMIT @window`, {
          pinyin
        }),
        0
      )
      collect(
        run(`${DICTIONARY_SELECT} WHERE pinyin_normalized LIKE @prefix ORDER BY LENGTH(simplified), id LIMIT @window`, {
          prefix: `${pinyin}%`
        }),
        1
      )
    }
    collect(searchEnglish(trimmed, limit), 2, true)
  }

  return [...scored.values()]
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((entry) => dictionaryFromRow(entry.row))
}

/** CC-CEDICT headwords run up to about this many characters (idioms aside); bounds the segmenter's backtracking. */
const MAX_WORD_LEN = 6

let exactSimplifiedStmt: Database.Statement | null = null

/**
 * A polyphonic headword has one row per reading (吧: bar/particle/onomatopoeia). CC-CEDICT
 * lists them in roughly decreasing frequency, which the table preserves as insertion order, so
 * the lowest id is the best guess at the reading a learner is actually hearing.
 */
function lookupExactSimplified(word: string): DictionaryRow | null {
  exactSimplifiedStmt ??= db.prepare(`${DICTIONARY_SELECT} WHERE simplified = @word ORDER BY id LIMIT 1`)
  return (exactSimplifiedStmt.get({ word }) as DictionaryRow | undefined) ?? null
}

/**
 * Best-effort pinyin for arbitrary tutor speech, with no AI call: a greedy longest-match
 * segmentation against the local CC-CEDICT table (same dictionary the search box and card
 * lookups use). Good enough for a caption; it has no context to disambiguate rare polyphonic
 * characters or unseeded words, which just pass through as bare hanzi. English is a separate,
 * sentence-level translation (see `translateToEnglish`) — per-word gloss concatenation reads
 * as word salad for anything longer than a single term.
 */
export function pinyinForText(text: string): string {
  const pinyinParts: string[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (!HAS_HANZI.test(ch)) {
      pinyinParts.push(ch)
      i++
      continue
    }
    let matched: DictionaryRow | null = null
    let matchedLen = 1
    for (let len = Math.min(MAX_WORD_LEN, text.length - i); len >= 1; len--) {
      const row = lookupExactSimplified(text.slice(i, i + len))
      if (row) {
        matched = row
        matchedLen = len
        break
      }
    }
    pinyinParts.push(matched ? matched.pinyin : ch)
    i += matchedLen
  }
  return pinyinParts
    .join(' ')
    .replace(/\s*([，。！？、,.!?…])\s*/g, '$1 ')
    .trim()
}

// --- Lessons ---

interface LessonRow {
  id: string
  name: string
  level: number
  sort_order: number
  words: string
  status: LessonStatus | null
  correct: number | null
  total: number | null
  completed_at: string | null
}

const LESSON_SELECT = `
  SELECT l.id, l.name, l.level, l.sort_order, l.words,
         p.status, p.correct, p.total, p.completed_at
  FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id = l.id`

function lessonSummaryFromRow(row: LessonRow, status: LessonStatus): LessonSummary {
  const words = JSON.parse(row.words) as LessonWord[]
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    order: row.sort_order,
    wordCount: words.length,
    status,
    correct: row.correct,
    total: row.total,
    completedAt: row.completed_at,
    previewExample: words[0]?.examples[0] ?? null
  }
}

export function upsertLesson(record: LessonRecord): void {
  db.prepare(
    `INSERT INTO lessons (id, name, level, sort_order, words) VALUES (@id, @name, @level, @order, @words)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, level = excluded.level,
       sort_order = excluded.sort_order, words = excluded.words`
  ).run({ ...record, words: JSON.stringify(record.words) })
}

/**
 * Lessons unlock in order: the next one opens when the previous is finished. Availability is
 * derived rather than stored so re-seeded or reordered content can never leave it stale.
 */
export function listLessons(): LessonSummary[] {
  const rows = db.prepare(`${LESSON_SELECT} ORDER BY l.sort_order ASC`).all() as LessonRow[]
  let previousCompleted = true
  return rows.map((row) => {
    const status: LessonStatus = row.status ?? (previousCompleted ? 'available' : 'locked')
    previousCompleted = row.status === 'completed'
    return lessonSummaryFromRow(row, status)
  })
}

export function getLesson(id: string): LessonDetail | null {
  const summary = listLessons().find((lesson) => lesson.id === id)
  if (!summary) return null
  const rows = db.prepare(`SELECT id, words FROM lessons WHERE level = ? ORDER BY sort_order ASC`).all(summary.level) as {
    id: string
    words: string
  }[]

  const words: LessonWord[] = []
  const distractorPool: LessonWord[] = []
  for (const row of rows) {
    const parsed = JSON.parse(row.words) as LessonWord[]
    if (row.id === id) words.push(...parsed)
    else distractorPool.push(...parsed)
  }
  return { ...summary, words, distractorPool }
}

/** Every lesson's vocabulary for a level, in lesson order — the source for the "see summary"
 *  overview linked off each level card. */
export function getLevelWords(level: number): LevelWordGroup[] {
  const rows = db.prepare(`SELECT id, name, words FROM lessons WHERE level = ? ORDER BY sort_order ASC`).all(level) as {
    id: string
    name: string
    words: string
  }[]
  return rows.map((row) => ({
    lessonId: row.id,
    lessonName: row.name,
    words: JSON.parse(row.words) as LessonWord[]
  }))
}

/**
 * Wipes all lesson progress. Called from seeding when a new SEED_VERSION regroups words into
 * different lessons: progress is keyed by positional id (hsk1-03…), so old rows would otherwise
 * attach a "completed" flag to a lesson that now teaches entirely different words.
 */
export function clearLessonProgress(): void {
  db.prepare(`DELETE FROM lesson_progress`).run()
}

export function markLessonStarted(id: string): void {
  db.prepare(
    `INSERT INTO lesson_progress (lesson_id, status, started_at) VALUES (?, 'in_progress', ?)
     ON CONFLICT(lesson_id) DO NOTHING`
  ).run(id, new Date().toISOString())
}

export function markLessonCompleted(id: string, correct: number, total: number): void {
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO lesson_progress (lesson_id, status, correct, total, started_at, completed_at)
     VALUES (@id, 'completed', @correct, @total, @now, @now)
     ON CONFLICT(lesson_id) DO UPDATE SET status = 'completed', correct = @correct, total = @total, completed_at = @now`
  ).run({ id, correct, total, now })
}

/** True if this specific deck already has a card for the hanzi. */
export function cardExistsInDeck(deckId: number, hanzi: string): boolean {
  return db.prepare(`SELECT 1 FROM cards WHERE deck_id = ? AND hanzi = ? LIMIT 1`).get(deckId, hanzi) !== undefined
}

// --- Streak ---

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * A day counts as "active" if the learner touched any of the three study surfaces — reviews,
 * lessons, or the tutor. Timestamps are stored as UTC ISO strings, so `date(..., 'localtime')`
 * converts each one to the machine's local calendar day before it's compared.
 */
export function getStreak(): StreakInfo {
  const rows = db
    .prepare(
      `SELECT DISTINCT date(activity_at, 'localtime') AS day FROM (
         SELECT reviewed_at AS activity_at FROM review_log
         UNION ALL
         SELECT started_at FROM lesson_progress
         UNION ALL
         SELECT completed_at FROM lesson_progress WHERE completed_at IS NOT NULL
         UNION ALL
         SELECT created_at FROM tutor_sessions
         UNION ALL
         SELECT updated_at FROM tutor_sessions
       )`
    )
    .all() as { day: string }[]
  const activeDays = new Set(rows.map((r) => r.day))

  const today = new Date()
  const activeToday = activeDays.has(localDateKey(today))

  // If today has no activity yet, the streak is still "alive" as long as yesterday was active —
  // it just hasn't been extended today. Counting starts from there instead.
  const cursor = new Date(today)
  if (!activeToday) cursor.setDate(cursor.getDate() - 1)

  let current = 0
  while (activeDays.has(localDateKey(cursor))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }

  return { current, activeToday }
}
