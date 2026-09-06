import { contextBridge, ipcRenderer } from 'electron'
import type {
  Card,
  Deck,
  Grade,
  NewCardInput,
  NewDeckInput,
  Scenario,
  TutorSession,
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
  settings: {
    hasApiKey: (): Promise<boolean> => ipcRenderer.invoke('settings:hasApiKey'),
    setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('settings:setApiKey', key),
    clearApiKey: (): Promise<void> => ipcRenderer.invoke('settings:clearApiKey')
  },
  tutor: {
    listScenarios: (): Promise<Scenario[]> => ipcRenderer.invoke('tutor:listScenarios'),
    startSession: (scenarioId: number): Promise<TutorSession> => ipcRenderer.invoke('tutor:startSession', scenarioId),
    getSession: (sessionId: number): Promise<TutorSession> => ipcRenderer.invoke('tutor:getSession', sessionId),
    sendMessage: (sessionId: number, message: string): Promise<TutorTurnResult> =>
      ipcRenderer.invoke('tutor:sendMessage', sessionId, message),
    endSession: (sessionId: number, vocabAddedCount: number): Promise<TutorSummary> =>
      ipcRenderer.invoke('tutor:endSession', sessionId, vocabAddedCount),
    onStreamChunk: (callback: (sessionId: number, chunk: string) => void): (() => void) => {
      const listener = (_e: unknown, payload: { sessionId: number; chunk: string }): void =>
        callback(payload.sessionId, payload.chunk)
      ipcRenderer.on('tutor:streamChunk', listener)
      return () => ipcRenderer.removeListener('tutor:streamChunk', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
