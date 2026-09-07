import type { PlanCheckpoint } from './types'

/** Percentage of plan checkpoints completed. An empty plan counts as fully complete. */
export function planProgress(plan: PlanCheckpoint[], completedIds: string[]): number {
  if (plan.length === 0) return 100
  const completed = plan.filter((c) => completedIds.includes(c.id)).length
  return Math.round((completed / plan.length) * 100)
}

export function completedCheckpoints(plan: PlanCheckpoint[], completedIds: string[]): PlanCheckpoint[] {
  return plan.filter((c) => completedIds.includes(c.id))
}

export function remainingCheckpoints(plan: PlanCheckpoint[], completedIds: string[]): PlanCheckpoint[] {
  return plan.filter((c) => !completedIds.includes(c.id))
}

/** The checkpoint the tutor should steer toward next: the first incomplete one in plan order. */
export function nextCheckpoint(plan: PlanCheckpoint[], completedIds: string[]): PlanCheckpoint | null {
  return remainingCheckpoints(plan, completedIds)[0] ?? null
}

/** Keeps only ids that exist in the plan, in plan order, without duplicates. */
export function mergeCompleted(plan: PlanCheckpoint[], existing: string[], added: string[]): string[] {
  const set = new Set([...existing, ...added])
  return plan.filter((c) => set.has(c.id)).map((c) => c.id)
}
