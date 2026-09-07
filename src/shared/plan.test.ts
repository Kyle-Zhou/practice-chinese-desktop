import { describe, expect, it } from 'vitest'
import { mergeCompleted, nextCheckpoint, planProgress, remainingCheckpoints } from './plan'
import type { PlanCheckpoint } from './types'

const plan: PlanCheckpoint[] = [
  { id: 'greet', description: 'Greet' },
  { id: 'order', description: 'Order' },
  { id: 'pay', description: 'Pay' }
]

describe('plan helpers', () => {
  it('computes progress as a rounded percentage of completed checkpoints', () => {
    expect(planProgress(plan, [])).toBe(0)
    expect(planProgress(plan, ['greet'])).toBe(33)
    expect(planProgress(plan, ['greet', 'order', 'pay'])).toBe(100)
    expect(planProgress([], [])).toBe(100)
  })

  it('ignores ids that are not in the plan', () => {
    expect(planProgress(plan, ['bogus', 'greet'])).toBe(33)
    expect(mergeCompleted(plan, ['bogus'], ['pay'])).toEqual(['pay'])
  })

  it('returns completed ids in plan order without duplicates', () => {
    expect(mergeCompleted(plan, ['pay'], ['greet', 'pay'])).toEqual(['greet', 'pay'])
  })

  it('picks the first incomplete checkpoint as next', () => {
    expect(nextCheckpoint(plan, ['greet'])?.id).toBe('order')
    expect(nextCheckpoint(plan, ['greet', 'order', 'pay'])).toBeNull()
    expect(remainingCheckpoints(plan, ['order']).map((c) => c.id)).toEqual(['greet', 'pay'])
  })
})
