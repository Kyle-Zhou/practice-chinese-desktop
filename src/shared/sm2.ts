import type { Grade } from './types'

export interface SchedulingState {
  easeFactor: number
  intervalDays: number
  repetitions: number
}

export interface SchedulingResult extends SchedulingState {
  dueAt: Date
}

const MIN_EASE = 1.3
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * SM-2-derived scheduler. "again" sets intervalDays to 0 so the card is
 * immediately due again — this is what makes a missed card resurface within
 * the same study session instead of needing a separate "do again" action.
 */
export function schedule(state: SchedulingState, grade: Grade, now: Date = new Date()): SchedulingResult {
  const { easeFactor, intervalDays, repetitions } = state

  switch (grade) {
    case 'again': {
      const nextEase = Math.max(MIN_EASE, easeFactor - 0.2)
      return { easeFactor: nextEase, intervalDays: 0, repetitions: 0, dueAt: now }
    }
    case 'hard': {
      const nextEase = Math.max(MIN_EASE, easeFactor - 0.15)
      const nextInterval = repetitions === 0 ? 1 : Math.max(intervalDays * 1.2, intervalDays + 1)
      return {
        easeFactor: nextEase,
        intervalDays: nextInterval,
        repetitions: repetitions + 1,
        dueAt: addDays(now, nextInterval)
      }
    }
    case 'good': {
      const nextRepetitions = repetitions + 1
      const nextInterval = nextRepetitions === 1 ? 1 : nextRepetitions === 2 ? 6 : Math.round(intervalDays * easeFactor)
      return {
        easeFactor,
        intervalDays: nextInterval,
        repetitions: nextRepetitions,
        dueAt: addDays(now, nextInterval)
      }
    }
    case 'easy': {
      const nextEase = easeFactor + 0.15
      const nextRepetitions = repetitions + 1
      const base = nextRepetitions === 1 ? 4 : nextRepetitions === 2 ? 8 : Math.round(intervalDays * easeFactor)
      const nextInterval = Math.round(base * 1.3)
      return {
        easeFactor: nextEase,
        intervalDays: nextInterval,
        repetitions: nextRepetitions,
        dueAt: addDays(now, nextInterval)
      }
    }
  }
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

export const NEW_CARD_STATE: SchedulingState = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0
}
