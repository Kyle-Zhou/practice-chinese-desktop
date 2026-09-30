import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  Card,
  CorrectionMode,
  Deck,
  DictionaryEntry,
  Grade,
  LessonCompletion,
  LessonDetail,
  LessonResultInput,
  LessonSummary,
  LevelWordGroup,
  NewCardInput,
  NewDeckInput,
  Scenario,
  SecretName,
  StartSessionInput,
  StreakInfo,
  SynthesizeResult,
  TranscribeResult,
  TutorEvent,
  TutorMessage,
  TutorSession,
  TutorSessionSummaryRow,
  TutorSummary,
  TutorTurnResult
} from '../shared/types'

const api = {
  decks: {
    list: (): Promise<Deck[]> => ipcRenderer.invoke('decks:list'),
    create: (input: NewDeckInput): Promise<Deck> => ipcRenderer.invoke('decks:create', input),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('decks:delete', id),
    allDueCount: (): Promise<number> => ipcRenderer.invoke('decks:allDueCount')
  },
  progress: {
    streak: (): Promise<StreakInfo> => ipcRenderer.invoke('progress:streak')
  },
  cards: {
    listForDeck: (deckId: number): Promise<Card[]> => ipcRenderer.invoke('cards:listForDeck', deckId),
    add: (input: NewCardInput): Promise<Card> => ipcRenderer.invoke('cards:add', input),
    update: (
      id: number,
      fields: Partial<Pick<Card, 'hanzi' | 'pinyin' | 'english' | 'audioPath' | 'notes'>>
    ): Promise<Card> => ipcRenderer.invoke('cards:update', id, fields),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('cards:delete', id)
  },
  study: {
    dueCards: (deckId: number | null, limit?: number): Promise<Card[]> =>
      ipcRenderer.invoke('study:dueCards', deckId, limit),
    submitReview: (cardId: number, grade: Grade): Promise<Card> =>
      ipcRenderer.invoke('study:submitReview', cardId, grade)
  },
  dictionary: {
    ready: (): Promise<boolean> => ipcRenderer.invoke('dictionary:ready'),
    search: (query: string, limit?: number): Promise<DictionaryEntry[]> =>
      ipcRenderer.invoke('dictionary:search', query, limit),
    // Split so a slow translation never blocks the (near-instant, local) pinyin lookup.
    pinyin: (text: string): Promise<string> => ipcRenderer.invoke('dictionary:pinyin', text),
    translate: (text: string): Promise<string> => ipcRenderer.invoke('dictionary:translate', text)
  },
  lessons: {
    list: (): Promise<LessonSummary[]> => ipcRenderer.invoke('lessons:list'),
    get: (id: string): Promise<LessonDetail | null> => ipcRenderer.invoke('lessons:get', id),
    levelWords: (level: number): Promise<LevelWordGroup[]> => ipcRenderer.invoke('lessons:levelWords', level),
    start: (id: string): Promise<void> => ipcRenderer.invoke('lessons:start', id),
    complete: (id: string, result: LessonResultInput): Promise<LessonCompletion> =>
      ipcRenderer.invoke('lessons:complete', id, result)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:update', patch),
    secretStatus: (): Promise<Record<SecretName, boolean>> => ipcRenderer.invoke('settings:secretStatus'),
    setSecret: (name: SecretName, value: string): Promise<void> => ipcRenderer.invoke('settings:setSecret', name, value),
    clearSecret: (name: SecretName): Promise<void> => ipcRenderer.invoke('settings:clearSecret', name)
  },
  voice: {
    requestMicAccess: (): Promise<boolean> => ipcRenderer.invoke('voice:requestMicAccess'),
    transcribe: (wav: ArrayBuffer): Promise<TranscribeResult> => ipcRenderer.invoke('voice:transcribe', wav),
    synthesize: (text: string): Promise<SynthesizeResult> => ipcRenderer.invoke('voice:synthesize', text)
  },
  tutor: {
    listScenarios: (): Promise<Scenario[]> => ipcRenderer.invoke('tutor:listScenarios'),
    createTheme: (prompt: string): Promise<Scenario> => ipcRenderer.invoke('tutor:createTheme', prompt),
    deleteScenario: (id: number): Promise<void> => ipcRenderer.invoke('tutor:deleteScenario', id),
    listSessions: (): Promise<TutorSessionSummaryRow[]> => ipcRenderer.invoke('tutor:listSessions'),
    startSession: (input: StartSessionInput): Promise<TutorSession> => ipcRenderer.invoke('tutor:startSession', input),
    getSession: (sessionId: number): Promise<TutorSession> => ipcRenderer.invoke('tutor:getSession', sessionId),
    openSession: (sessionId: number): Promise<TutorSession> => ipcRenderer.invoke('tutor:openSession', sessionId),
    deleteSession: (sessionId: number): Promise<void> => ipcRenderer.invoke('tutor:deleteSession', sessionId),
    sendMessage: (sessionId: number, message: string, source: TutorMessage['source']): Promise<TutorTurnResult> =>
      ipcRenderer.invoke('tutor:sendMessage', sessionId, message, source),
    endSession: (sessionId: number): Promise<TutorSummary> => ipcRenderer.invoke('tutor:endSession', sessionId),
    setCorrectionMode: (sessionId: number, mode: CorrectionMode): Promise<TutorSession> =>
      ipcRenderer.invoke('tutor:setCorrectionMode', sessionId, mode),
    onEvent: (callback: (sessionId: number, event: TutorEvent) => void): (() => void) => {
      const listener = (_e: unknown, payload: { sessionId: number; event: TutorEvent }): void =>
        callback(payload.sessionId, payload.event)
      ipcRenderer.on('tutor:event', listener)
      return () => ipcRenderer.removeListener('tutor:event', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
