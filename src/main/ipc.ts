import { ipcMain } from 'electron'
import * as db from './db'
import * as tutor from './tutor'
import type { Grade, NewCardInput, NewDeckInput } from '../shared/types'

export function registerIpcHandlers(): void {
  ipcMain.handle('decks:list', () => db.listDecks())
  ipcMain.handle('decks:create', (_e, input: NewDeckInput) => db.createDeck(input))
  ipcMain.handle('decks:delete', (_e, id: number) => db.deleteDeck(id))
  ipcMain.handle('decks:allDueCount', () => db.getAllDueCount())

  ipcMain.handle('cards:listForDeck', (_e, deckId: number) => db.getCardsForDeck(deckId))
  ipcMain.handle('cards:add', (_e, input: NewCardInput) => db.addCard(input))
  ipcMain.handle(
    'cards:update',
    (_e, id: number, fields: Parameters<typeof db.updateCard>[1]) => db.updateCard(id, fields)
  )
  ipcMain.handle('cards:delete', (_e, id: number) => db.deleteCard(id))

  ipcMain.handle('study:dueCards', (_e, deckId: number | null, limit?: number) => db.getDueCards(deckId, limit))
  ipcMain.handle('study:submitReview', (_e, cardId: number, grade: Grade) => db.submitReview(cardId, grade))

  ipcMain.handle('settings:hasApiKey', () => db.hasApiKey())
  ipcMain.handle('settings:setApiKey', (_e, key: string) => db.setApiKey(key))
  ipcMain.handle('settings:clearApiKey', () => db.clearApiKey())

  ipcMain.handle('tutor:listScenarios', () => db.listScenarios())
  ipcMain.handle('tutor:startSession', (_e, scenarioId: number) => db.createTutorSession(scenarioId))
  ipcMain.handle('tutor:getSession', (_e, sessionId: number) => db.getTutorSession(sessionId))
  ipcMain.handle('tutor:sendMessage', (event, sessionId: number, message: string) =>
    tutor.processTurn(sessionId, message, (chunk) => {
      event.sender.send('tutor:streamChunk', { sessionId, chunk })
    })
  )
  ipcMain.handle('tutor:endSession', (_e, sessionId: number, vocabAddedCount: number) =>
    tutor.generateSummary(sessionId, vocabAddedCount)
  )
}
