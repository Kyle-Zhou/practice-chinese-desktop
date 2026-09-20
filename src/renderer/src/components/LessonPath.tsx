import { useEffect, useMemo, useRef, useState } from 'react'
import type { LessonSummary } from '@shared/types'

interface Props {
  onOpenLesson: (lessonId: string) => void
  onExit: () => void
}

type LevelStatus = 'completed' | 'active' | 'locked'

const LEVEL_STATUS_LABEL: Record<LevelStatus, string> = {
  completed: 'Completed',
  active: 'In progress',
  locked: 'Locked'
}

const STEP_META: Record<LessonSummary['status'], (lesson: LessonSummary) => string> = {
  completed: (lesson) => (lesson.total ? `${lesson.correct}/${lesson.total} correct` : `${lesson.wordCount} words`),
  in_progress: (lesson) => `${lesson.wordCount} words · in progress`,
  available: (lesson) => `${lesson.wordCount} words`,
  locked: (lesson) => `${lesson.wordCount} words`
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function PlayIcon(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4.5v15l13-7.5z" />
    </svg>
  )
}

function LockIcon(): React.JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function StepMarker({ status }: { status: LessonSummary['status'] }): React.JSX.Element {
  if (status === 'completed') return <CheckIcon />
  if (status === 'locked') return <LockIcon />
  return <PlayIcon />
}

export default function LessonPath({ onOpenLesson, onExit }: Props): React.JSX.Element {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const didInitExpanded = useRef(false)

  useEffect(() => {
    window.api.lessons.list().then(setLessons)
  }, [])

  const levels = useMemo(() => {
    if (!lessons) return []
    const numbers = [...new Set(lessons.map((lesson) => lesson.level))].sort((a, b) => a - b)
    return numbers.map((level) => {
      const group = lessons.filter((lesson) => lesson.level === level)
      const done = group.filter((lesson) => lesson.status === 'completed').length
      const frontier = group.find((lesson) => lesson.status === 'in_progress' || lesson.status === 'available')
      const status: LevelStatus = frontier ? 'active' : done === group.length ? 'completed' : 'locked'
      return { level, group, done, total: group.length, frontier, status }
    })
  }, [lessons])

  // Default open state: the one level with the learning frontier, so the page lands on
  // "what's next" rather than a wall of collapsed cards. Runs once, so collapsing it back
  // manually doesn't get overridden on the next render.
  useEffect(() => {
    if (didInitExpanded.current || levels.length === 0) return
    didInitExpanded.current = true
    const activeLevel = levels.find((l) => l.status === 'active')
    if (activeLevel) setExpanded(new Set([activeLevel.level]))
  }, [levels])

  function toggle(level: number): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  if (lessons === null) return <p>Loading lessons…</p>

  return (
    <div className="lesson-path">
      <div className="study-toolbar">
        <button className="btn" onClick={onExit}>
          ← Back to decks
        </button>
        <span className="study-remaining">
          {lessons.filter((lesson) => lesson.status === 'completed').length} / {lessons.length} lessons done
        </span>
      </div>

      <h2>Learn</h2>
      <p className="lesson-path-intro">
        Each lesson introduces a handful of words with example sentences, then quizzes you on them. Finishing a lesson
        files its words into your <strong>My Words</strong> deck, where they come back for review.
      </p>

      {levels.map(({ level, group, done, total, frontier, status }) => {
        const isOpen = expanded.has(level)
        const ctaLabel = frontier?.status === 'in_progress' ? 'Continue lesson' : 'Start lesson'

        return (
          <section key={level} className={`lesson-level-card lesson-level-card--${status}`}>
            <button
              className="lesson-level-header"
              onClick={() => toggle(level)}
              aria-expanded={isOpen}
            >
              <span className="lesson-level-heading">
                <h3>HSK {level}</h3>
                <span className="lesson-level-status-pill">{LEVEL_STATUS_LABEL[status]}</span>
              </span>
              <span className="lesson-level-header-right">
                <span className="lesson-level-count">
                  {done} / {total} lessons
                </span>
                <span className={`lesson-level-chevron ${isOpen ? 'lesson-level-chevron-open' : ''}`}>
                  <ChevronIcon />
                </span>
              </span>
            </button>

            <div className="lesson-level-bar">
              <div
                className="lesson-level-fill"
                style={{ '--progress': total ? done / total : 0 } as React.CSSProperties}
              />
            </div>

            {isOpen && (
              <div className="lesson-level-body">
                {frontier && (
                  <div className="lesson-level-frontier">
                    {frontier.previewExample && (
                      <div className="lesson-preview-bubble">
                        <span className="lesson-preview-pinyin">{frontier.previewExample.pinyin}</span>
                        <span className="lesson-preview-hanzi">{frontier.previewExample.hanzi}</span>
                        <span className="lesson-preview-english">{frontier.previewExample.english}</span>
                      </div>
                    )}
                    <button className="btn btn-primary lesson-level-cta" onClick={() => onOpenLesson(frontier.id)}>
                      {ctaLabel} · {frontier.name.replace(/^HSK \d+ · /, '')}
                    </button>
                  </div>
                )}

                <ul className="lesson-steps">
                  {group.map((lesson) => (
                    <li key={lesson.id} className={`lesson-step lesson-step-${lesson.status}`}>
                      <button className="lesson-step-btn" onClick={() => onOpenLesson(lesson.id)}>
                        <span className="lesson-step-marker">
                          <StepMarker status={lesson.status} />
                        </span>
                        <span className="lesson-step-name">{lesson.name.replace(/^HSK \d+ · /, '')}</span>
                        <span className="lesson-step-meta">{STEP_META[lesson.status](lesson)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
