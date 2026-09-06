import { describe, expect, it } from 'vitest'
import { NEW_CARD_STATE, schedule } from './sm2'

describe('schedule', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('again resets repetitions and is immediately due', () => {
    const result = schedule({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 'again', now)
    expect(result.repetitions).toBe(0)
    expect(result.intervalDays).toBe(0)
    expect(result.dueAt.getTime()).toBe(now.getTime())
    expect(result.easeFactor).toBeCloseTo(2.3)
  })

  it('good grows interval through the classic 1 / 6 / ease*interval steps', () => {
    let state = NEW_CARD_STATE
    let result = schedule(state, 'good', now)
    expect(result.intervalDays).toBe(1)

    state = result
    result = schedule(state, 'good', now)
    expect(result.intervalDays).toBe(6)

    state = result
    result = schedule(state, 'good', now)
    expect(result.intervalDays).toBe(Math.round(6 * state.easeFactor))
  })

  it('easy grants a bigger jump and raises ease factor', () => {
    const result = schedule(NEW_CARD_STATE, 'easy', now)
    expect(result.easeFactor).toBeCloseTo(2.65)
    expect(result.intervalDays).toBeGreaterThan(schedule(NEW_CARD_STATE, 'good', now).intervalDays)
  })

  it('never drops ease factor below the floor', () => {
    const result = schedule({ easeFactor: 1.35, intervalDays: 1, repetitions: 1 }, 'again', now)
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3)
  })

  it('hard grows slower than good', () => {
    const state = { easeFactor: 2.5, intervalDays: 10, repetitions: 3 }
    const hard = schedule(state, 'hard', now)
    const good = schedule(state, 'good', now)
    expect(hard.intervalDays).toBeLessThan(good.intervalDays)
  })
})
