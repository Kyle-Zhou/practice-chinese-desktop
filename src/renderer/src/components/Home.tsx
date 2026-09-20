import { useEffect, useState } from 'react'
import type { Deck, LessonSummary, TutorSessionSummaryRow } from '@shared/types'

interface Props {
  onStudyAll: () => void
  onOpenLesson: (lessonId: string) => void
  onGoLearn: () => void
  onOpenTutor: () => void
  onResumeTutor: (sessionId: number) => void
}

// Kept in sync with PROGRESS_DECK_NAME in src/main/lessons.ts (main-process constant, not importable here).
const PROGRESS_DECK_NAME = 'My Words'

interface HomeData {
  dueCount: number
  wordsLearned: number
  lessons: LessonSummary[]
  lastSession: TutorSessionSummaryRow | null
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Home({
  onStudyAll,
  onOpenLesson,
  onGoLearn,
  onOpenTutor,
  onResumeTutor
}: Props): React.JSX.Element {
  const [data, setData] = useState<HomeData | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.decks.list(),
      window.api.decks.allDueCount(),
      window.api.lessons.list(),
      window.api.tutor.listSessions()
    ]).then(([decks, dueCount, lessons, sessions]: [Deck[], number, LessonSummary[], TutorSessionSummaryRow[]]) => {
      const progressDeck = decks.find((d) => d.name === PROGRESS_DECK_NAME)
      setData({
        dueCount,
        wordsLearned: progressDeck?.cardCount ?? 0,
        lessons,
        lastSession: sessions[0] ?? null
      })
    })
  }, [])

  if (!data) return <p>Loading…</p>

  const { dueCount, wordsLearned, lessons, lastSession } = data
  const completed = lessons.filter((l) => l.status === 'completed').length
  // The frontier lesson: whatever is mid-flight, otherwise the next one unlocked.
  const nextLesson =
    lessons.find((l) => l.status === 'in_progress') ?? lessons.find((l) => l.status === 'available') ?? null
  const levels = [1, 2, 3, 4].map((level) => {
    const group = lessons.filter((l) => l.level === level)
    return { level, done: group.filter((l) => l.status === 'completed').length, total: group.length }
  })
  const resumeSession = lastSession?.status === 'active' ? lastSession : null

  return (
    <div className="home">
      <div className="home-greeting">
        <h2>{greeting()}!</h2>
        <p className="deck-description">Ready to practice some Mandarin?</p>
      </div>

      <div className="home-hero">
        <section className="home-action">
          <span className="home-action-label">Due for review</span>
          <p className="home-action-figure">
            {dueCount} <span>card{dueCount === 1 ? '' : 's'}</span>
          </p>
          <p className="deck-description">
            {dueCount === 0 ? "You're all caught up — nice work." : 'Spaced-repetition cards ready across your decks.'}
          </p>
          <button className="btn btn-primary" disabled={dueCount === 0} onClick={onStudyAll}>
            Study now
          </button>
        </section>

        <section className="home-action">
          <span className="home-action-label">Continue learning</span>
          {nextLesson ? (
            <>
              <p className="home-action-title">{nextLesson.name}</p>
              <p className="deck-description">
                HSK {nextLesson.level} · {nextLesson.wordCount} words
                {nextLesson.status === 'in_progress' ? ' · in progress' : ''}
              </p>
              {nextLesson.previewExample && (
                <div className="lesson-preview-bubble">
                  <span className="lesson-preview-pinyin">{nextLesson.previewExample.pinyin}</span>
                  <span className="lesson-preview-hanzi">{nextLesson.previewExample.hanzi}</span>
                  <span className="lesson-preview-english">{nextLesson.previewExample.english}</span>
                </div>
              )}
              <button className="btn btn-primary" onClick={() => onOpenLesson(nextLesson.id)}>
                {nextLesson.status === 'in_progress' ? 'Resume lesson' : 'Start lesson'}
              </button>
            </>
          ) : (
            <>
              <p className="home-action-title">All lessons complete 🎉</p>
              <p className="deck-description">You've finished every lesson. Keep your words fresh with review.</p>
              <button className="btn" onClick={onGoLearn}>
                Review lessons
              </button>
            </>
          )}
        </section>
      </div>

      <section className="home-section">
        <h3>Your progress</h3>
        <div className="home-stats">
          <div className="home-stat">
            <span className="home-stat-value">{wordsLearned}</span>
            <span className="home-stat-label">Words learned</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-value">
              {completed}
              <span className="home-stat-total"> / {lessons.length}</span>
            </span>
            <span className="home-stat-label">Lessons done</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-value">{dueCount}</span>
            <span className="home-stat-label">Cards due</span>
          </div>
        </div>

        <div className="home-levels">
          {levels.map(({ level, done, total }) => (
            <button key={level} className="home-level" onClick={onGoLearn}>
              <span className="home-level-heading">
                <span className="home-level-name">HSK {level}</span>
                {total > 0 && done === total && <span className="lesson-level-status-pill">Done</span>}
              </span>
              <span className="home-level-count">
                {done} of {total} lessons
              </span>
              <div className="lesson-level-bar">
                <div
                  className="lesson-level-fill"
                  style={{ '--progress': total ? done / total : 0 } as React.CSSProperties}
                />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="home-tutor">
        <div>
          <h3>Practice speaking</h3>
          <p className="deck-description">
            {resumeSession
              ? `Pick up your conversation: ${resumeSession.scenarioName}.`
              : 'Have a free-flowing conversation with your AI tutor.'}
          </p>
        </div>
        {resumeSession ? (
          <button className="btn btn-primary" onClick={() => onResumeTutor(resumeSession.id)}>
            Resume conversation
          </button>
        ) : (
          <button className="btn btn-primary" onClick={onOpenTutor}>
            Start a conversation
          </button>
        )}
      </section>
    </div>
  )
}
