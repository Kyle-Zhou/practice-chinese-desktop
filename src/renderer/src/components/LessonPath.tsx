import { useEffect, useState } from 'react'
import type { LessonSummary } from '@shared/types'

interface Props {
  onOpenLesson: (lessonId: string) => void
  onExit: () => void
}

const STATUS_LABEL: Record<LessonSummary['status'], string> = {
  locked: 'Locked',
  available: 'Ready',
  in_progress: 'In progress',
  completed: 'Done'
}

export default function LessonPath({ onOpenLesson, onExit }: Props): React.JSX.Element {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null)

  useEffect(() => {
    window.api.lessons.list().then(setLessons)
  }, [])

  if (lessons === null) return <p>Loading lessons…</p>

  const levels = [...new Set(lessons.map((lesson) => lesson.level))].sort((a, b) => a - b)

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

      {levels.map((level) => {
        const group = lessons.filter((lesson) => lesson.level === level)
        const done = group.filter((lesson) => lesson.status === 'completed').length
        return (
          <section key={level} className="lesson-level">
            <div className="lesson-level-head">
              <h3>HSK {level}</h3>
              <span className="lesson-level-count">
                {done} / {group.length}
              </span>
            </div>
            <div className="lesson-level-bar">
              <div
                className="lesson-level-fill"
                style={{ '--progress': group.length ? done / group.length : 0 } as React.CSSProperties}
              />
            </div>

            <ul className="lesson-grid">
              {group.map((lesson) => (
                <li key={lesson.id}>
                  {/* Locked lessons stay clickable: this is a personal app and the learner may
                      already know HSK 1 cold. */}
                  <button
                    className={`lesson-chip lesson-chip-${lesson.status}`}
                    onClick={() => onOpenLesson(lesson.id)}
                  >
                    <span className="lesson-chip-name">{lesson.name.replace(/^HSK \d+ · /, '')}</span>
                    <span className="lesson-chip-meta">
                      {lesson.status === 'completed' && lesson.total
                        ? `${STATUS_LABEL.completed} · ${lesson.correct}/${lesson.total}`
                        : `${lesson.wordCount} words · ${STATUS_LABEL[lesson.status]}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
