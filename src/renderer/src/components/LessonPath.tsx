import { useEffect, useMemo, useState } from 'react'
import type { LessonSummary, LevelWordGroup } from '@shared/types'

interface Props {
  onOpenLesson: (lessonId: string) => void
}

type LevelStatus = 'completed' | 'active' | 'locked'

function CheckIcon({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function PlayIcon({ size = 12 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 4.5v15l13-7.5z" />
    </svg>
  )
}

function LockIcon({ size = 13 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

interface LevelGroup {
  level: number
  group: LessonSummary[]
  done: number
  total: number
  frontier: LessonSummary | undefined
  status: LevelStatus
}

function LevelCard({
  level,
  group,
  done,
  total,
  frontier,
  status,
  onOpenDetail,
  onOpenSummary
}: LevelGroup & { onOpenDetail: () => void; onOpenSummary: () => void }): React.JSX.Element {
  const ctaLabel = frontier?.status === 'in_progress' ? 'Continue' : 'Start lesson'
  const pct = total ? Math.round((done / total) * 100) : 0
  const totalWords = group.reduce((sum, lesson) => sum + lesson.wordCount, 0)

  return (
    <div className={`lesson-level-card lesson-level-card--${status}`}>
      <div className="lesson-level-main">
        <div className="lesson-level-header">
          <div className="lesson-level-heading-group">
            <h3>HSK {level}</h3>
            <button className="lesson-level-subtitle" onClick={onOpenSummary}>
              {totalWords} words · See summary
            </button>
          </div>
          <button className="lesson-level-chevron-btn" onClick={onOpenDetail} aria-label={`View HSK ${level} lessons`}>
            <span className="lesson-level-chevron">
              <ChevronIcon />
            </span>
          </button>
        </div>

        {status === 'completed' && (
          <div className="lesson-level-status-row lesson-level-status-row--completed">
            <CheckIcon /> Completed!
          </div>
        )}

        {status === 'active' && (
          <>
            <div className="lesson-level-bar">
              <div className="lesson-level-fill" style={{ '--progress': pct / 100 } as React.CSSProperties} />
              <span className="lesson-level-pct">{pct}%</span>
            </div>
            {frontier && (
              <button className="btn btn-primary lesson-level-cta" onClick={onOpenDetail}>
                {frontier.status === 'in_progress' ? ctaLabel : `${ctaLabel} · ${frontier.name.replace(/^HSK \d+ · /, '')}`}
              </button>
            )}
          </>
        )}

        {status === 'locked' && (
          <div className="lesson-level-status-row lesson-level-status-row--locked">
            <LockIcon /> {total} lessons locked
          </div>
        )}
      </div>

      {status === 'completed' && (
        <button className="btn lesson-level-review" onClick={onOpenDetail}>
          Review
        </button>
      )}
    </div>
  )
}

export default function LessonPath({ onOpenLesson }: Props): React.JSX.Element {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null)
  const [openLevel, setOpenLevel] = useState<number | null>(null)
  const [summaryLevel, setSummaryLevel] = useState<number | null>(null)
  const [summaryWords, setSummaryWords] = useState<LevelWordGroup[] | null>(null)
  const [summaryError, setSummaryError] = useState(false)

  useEffect(() => {
    window.api.lessons.list().then(setLessons)
  }, [])

  useEffect(() => {
    if (summaryLevel === null) {
      setSummaryWords(null)
      setSummaryError(false)
      return
    }
    setSummaryError(false)
    Promise.resolve()
      .then(() => window.api.lessons.levelWords(summaryLevel))
      .then(setSummaryWords)
      .catch((err) => {
        console.error('Failed to load level word summary:', err)
        setSummaryError(true)
      })
  }, [summaryLevel])

  const levels = useMemo<LevelGroup[]>(() => {
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

  if (lessons === null) return <p>Loading lessons…</p>

  if (summaryLevel !== null) {
    return (
      <div className="lesson-path">
        <button className="lesson-level-banner-back" onClick={() => setSummaryLevel(null)}>
          <ChevronIcon />
          HSK {summaryLevel}
        </button>
        <h2>HSK {summaryLevel} word summary</h2>
        <p className="lesson-path-intro">Every word taught across all of HSK {summaryLevel}, lesson by lesson.</p>

        {summaryError ? (
          <p className="deck-description">
            Couldn't load the word summary. If the app was already open, try restarting it — the summary view needs
            a fresh app restart to pick up.
          </p>
        ) : summaryWords === null ? (
          <p>Loading…</p>
        ) : (
          summaryWords.map((group) => (
            <section key={group.lessonId} className="lesson-summary-group">
              <h3>
                {group.lessonName.replace(/^HSK \d+ · /, '')}
                <span className="lesson-summary-group-count">{group.words.length} words</span>
              </h3>
              <ul className="lesson-summary-word-list">
                {group.words.map((word, i) => (
                  <li key={i} className="lesson-summary-word">
                    <span className="lesson-summary-word-hanzi">{word.hanzi}</span>
                    <span className="lesson-summary-word-pinyin">{word.pinyin}</span>
                    <span className="lesson-summary-word-english">{word.english}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    )
  }

  const openLevelGroup = openLevel === null ? null : levels.find((l) => l.level === openLevel) ?? null

  if (openLevelGroup) {
    const { level, group, frontier, status } = openLevelGroup
    const bannerTitle = frontier ? frontier.name.replace(/^HSK \d+ · /, '') : `HSK ${level} review`

    return (
      <div className="lesson-path">
        <div className={`lesson-level-banner lesson-level-banner--${status}`}>
          <button className="lesson-level-banner-back" onClick={() => setOpenLevel(null)}>
            <ChevronIcon />
            HSK {level}
          </button>
          <h2 className="lesson-level-banner-title">{bannerTitle}</h2>
        </div>

        <ul className="lesson-steps">
          {group.map((lesson) => {
            const isCurrent = lesson.id === frontier?.id
            return (
              <li key={lesson.id} className={`lesson-step lesson-step-${lesson.status} ${isCurrent ? 'lesson-step-current' : ''}`}>
                <button className="lesson-step-btn" onClick={() => onOpenLesson(lesson.id)}>
                  <span className="lesson-step-marker">
                    <StepMarker status={lesson.status} />
                  </span>
                  <span className="lesson-step-name">{lesson.name.replace(/^HSK \d+ · /, '')}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="lesson-path">
      <div className="lesson-path-header">
        <h2>Learn</h2>
        <span className="study-remaining">
          {lessons.filter((lesson) => lesson.status === 'completed').length} / {lessons.length} lessons done
        </span>
      </div>
      <p className="lesson-path-intro">
        Each lesson introduces a handful of words with example sentences, then quizzes you on them. Finishing a lesson
        files its words into your <strong>My Words</strong> deck, where they come back for review.
      </p>

      {levels.map((levelGroup) => (
        <LevelCard
          key={levelGroup.level}
          {...levelGroup}
          onOpenDetail={() => setOpenLevel(levelGroup.level)}
          onOpenSummary={() => setSummaryLevel(levelGroup.level)}
        />
      ))}
    </div>
  )
}
