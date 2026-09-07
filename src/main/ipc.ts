import { ipcMain, systemPreferences } from 'electron'
import * as db from './db'
import * as lessons from './lessons'
import * as settings from './settings'
import * as tutor from './tutor'
import { dictionaryReady } from './dictionary'
import type {
  AppSettings,
  Grade,
  LessonResultInput,
  NewCardInput,
  NewDeckInput,
  SecretName,
  StartSessionInput,
  TutorMessage
} from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('decks:list', () => db.listDecks())
  ipcMain.handle('decks:create', (_e, input: NewDeckInput) => db.createDeck(input))
  ipcMain.handle('decks:delete', (_e, id: number) => db.deleteDeck(id))
  ipcMain.handle('decks:allDueCount', () => db.getAllDueCount())

  ipcMain.handle('cards:listForDeck', (_e, deckId: number) => db.getCardsForDeck(deckId))
  ipcMain.handle('cards:add', (_e, input: NewCardInput) => db.addCard(input))
  ipcMain.handle('cards:update', (_e, id: number, fields: Parameters<typeof db.updateCard>[1]) =>
    db.updateCard(id, fields)
  )
  ipcMain.handle('cards:delete', (_e, id: number) => db.deleteCard(id))

  ipcMain.handle('study:dueCards', (_e, deckId: number | null, limit?: number) => db.getDueCards(deckId, limit))
  ipcMain.handle('study:submitReview', (_e, cardId: number, grade: Grade) => db.submitReview(cardId, grade))

  ipcMain.handle('dictionary:ready', () => dictionaryReady())
  ipcMain.handle('dictionary:search', (_e, query: string, limit?: number) => db.searchDictionary(query, limit))

  ipcMain.handle('lessons:list', () => db.listLessons())
  ipcMain.handle('lessons:get', (_e, id: string) => db.getLesson(id))
  ipcMain.handle('lessons:start', (_e, id: string) => db.markLessonStarted(id))
  ipcMain.handle('lessons:complete', (_e, id: string, result: LessonResultInput) =>
    lessons.completeLesson(id, result)
  )

  ipcMain.handle('settings:get', () => settings.getSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => settings.updateSettings(patch))
  ipcMain.handle('settings:secretStatus', () => settings.listSecretStatus())
  ipcMain.handle('settings:setSecret', (_e, name: SecretName, value: string) => settings.setSecret(name, value))
  ipcMain.handle('settings:clearSecret', (_e, name: SecretName) => settings.clearSecret(name))

  ipcMain.handle('voice:requestMicAccess', async () => {
    // Only macOS gates the microphone behind a TCC prompt; elsewhere getUserMedia just works.
    if (process.platform !== 'darwin') return true
    return systemPreferences.askForMediaAccess('microphone')
  })
  ipcMain.handle('voice:transcribe', (_e, wav: ArrayBuffer) => tutor.transcribe(Buffer.from(wav)))
  ipcMain.handle('voice:synthesize', (_e, text: string) => tutor.synthesize(text))

  ipcMain.handle('tutor:listScenarios', () => db.listScenarios())
  ipcMain.handle('tutor:createTheme', (_e, prompt: string) => tutor.createTheme(prompt))
  ipcMain.handle('tutor:deleteScenario', (_e, id: number) => db.deleteScenario(id))
  ipcMain.handle('tutor:listSessions', () => db.listTutorSessions())
  ipcMain.handle('tutor:startSession', (_e, input: StartSessionInput) => tutor.startSession(input))
  ipcMain.handle('tutor:getSession', (_e, sessionId: number) => db.getTutorSession(sessionId))
  ipcMain.handle('tutor:openSession', (event, sessionId: number) =>
    tutor.openSession(sessionId, (tutorEvent) => {
      if (!event.sender.isDestroyed()) event.sender.send('tutor:event', { sessionId, event: tutorEvent })
    })
  )
  ipcMain.handle('tutor:deleteSession', (_e, sessionId: number) => db.deleteTutorSession(sessionId))
  ipcMain.handle(
    'tutor:sendMessage',
    (event, sessionId: number, message: string, source: TutorMessage['source']) =>
      tutor.processTurn(sessionId, message, source, (tutorEvent) => {
        if (!event.sender.isDestroyed()) event.sender.send('tutor:event', { sessionId, event: tutorEvent })
      })
  )
  ipcMain.handle('tutor:endSession', (_e, sessionId: number) => tutor.endSession(sessionId))
}
