import { useEffect, useMemo, useRef, useState } from 'react'
import { useTtsPlayer } from '../hooks/useTtsPlayer'
import { buildQuiz, checkAnswer, expectedAnswer, seedFromId } from '@shared/quiz'
import { shortGloss } from '@shared/text'
import type { QuizQuestion } from '@shared/quiz'
import type { AppSettings, LessonCompletion, LessonDetail, LessonWord } from '@shared/types'

interface Props {
  lessonId: string
  onExit: () => void
  onStudy: (deckId: number) => void
}

type Phase = 'teach' | 'quiz' | 'summary'

interface Verdict {
  correct: boolean
  expected: string
}

const QUESTION_TITLE: Record<QuizQuestion['kind'], string> = {
  hanziToEnglish: 'What does this mean?',
  englishToHanzi: 'Which word is this?',
  fillBlank: 'Fill in the blank',
  listening: 'Which word did you hear?',
  typePinyin: 'Type the pinyin'
}

export default function LessonView({ lessonId, onExit, onStudy }: Props): React.JSX.Element {
  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [phase, setPhase] = useState<Phase>('teach')
  const [wordIndex, setWordIndex] = useState(0)

  const [queue, setQueue] = useState<QuizQuestion[]>([])
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [typed, setTyped] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const attempted = useRef(new Set<string>())
  const [completion, setCompletion] = useState<LessonCompletion | null>(null)

  const { speak, cancel } = useTtsPlayer({ enabled: true, provider: settings?.ttsProvider ?? 'system' })

  useEffect(() => {
    window.api.settings.get().then(setSettings)
  }, [])

  useEffect(() => {
    setLesson(null)
    setPhase('teach')
    setWordIndex(0)
    setQueue([])
    setVerdict(null)
    setTyped('')
    setPicked(null)
    setFirstTryCorrect(0)
    setCompletion(null)
    attempted.current = new Set()
    window.api.lessons.get(lessonId).then(setLesson)
    window.api.lessons.start(lessonId)
  }, [lessonId])

  const questions = useMemo(
    () => (lesson ? buildQuiz(lesson.words, lesson.distractorPool, seedFromId(lesson.id)) : []),
    [lesson]
  )
  const question = queue[0] ?? null

  // The listening round has no written prompt, so play it as soon as it comes up.
  useEffect(() => {
    if (question?.kind === 'listening' && question.speak) speak(question.speak)
  }, [question?.id])

  useEffect(() => cancel, [cancel])

  if (!lesson) return <p>Loading lesson…</p>

  function startQuiz(): void {
    setQueue(questions)
    setPhase('quiz')
  }

  function answer(response: number | string): void {
    if (!question || verdict) return
    const correct = checkAnswer(question, response)
    if (correct && !attempted.current.has(question.id)) setFirstTryCorrect((n) => n + 1)
    attempted.current.add(question.id)
    if (typeof response === 'number') setPicked(response)
    setVerdict({ correct, expected: expectedAnswer(question) })
  }

  async function next(): Promise<void> {
    if (!question || !verdict) return
    // Wrong answers go to the back of the queue and come round again until they're right.
    const rest = verdict.correct ? queue.slice(1) : [...queue.slice(1), question]
    setVerdict(null)
    setTyped('')
    setPicked(null)

    if (rest.length > 0) {
      setQueue(rest)
      return
    }
    setQueue([])
    setPhase('summary')
    setCompletion(await window.api.lessons.complete(lessonId, { correct: firstTryCorrect, total: questions.length }))
  }

  if (phase === 'teach') {
    const word = lesson.words[wordIndex]
    const last = wordIndex === lesson.words.length - 1
    return (
      <div className="lesson-view">
        <Toolbar lesson={lesson} onExit={onExit} progress={`Word ${wordIndex + 1} of ${lesson.words.length}`} />

        <div className="lesson-teach">
          <div className="lesson-word">
            <span className="hanzi">{word.hanzi}</span>
            <button className="btn btn-small lesson-speak" onClick={() => speak(word.hanzi)}>
              🔊 Play
            </button>
          </div>
          <p className="pinyin">{word.pinyin}</p>
          <p className="english">{word.english}</p>

          {word.examples.length > 0 && (
            <ul className="lesson-examples">
              {word.examples.map((example) => (
                <li key={example.hanzi}>
                  <button className="lesson-example-hanzi" onClick={() => speak(example.hanzi)}>
                    {example.hanzi}
                  </button>
                  <span className="lesson-example-pinyin">{example.pinyin}</span>
                  <span className="lesson-example-english">{example.english}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lesson-nav">
          <button className="btn" disabled={wordIndex === 0} onClick={() => setWordIndex((i) => i - 1)}>
            ← Previous
          </button>
          {last ? (
            <button className="btn btn-primary" onClick={startQuiz}>
              Start quiz →
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setWordIndex((i) => i + 1)}>
              Next word →
            </button>
          )}
        </div>
      </div>
    )
  }

  if (phase === 'quiz' && question) {
    const answeredCount = questions.length - queue.length
    return (
      <div className="lesson-view">
        <Toolbar lesson={lesson} onExit={onExit} progress={`${queue.length} to go`} />

        <div className="lesson-level-bar">
          <div className="lesson-level-fill" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>

        <div className="quiz-card">
          <p className="quiz-kind">{QUESTION_TITLE[question.kind]}</p>

          {question.kind === 'listening' ? (
            <button className="btn btn-primary quiz-replay" onClick={() => speak(question.speak ?? question.word.hanzi)}>
              🔊 Play again
            </button>
          ) : (
            <p className={question.kind === 'englishToHanzi' ? 'quiz-prompt-english' : 'quiz-prompt-hanzi'}>
              {question.prompt}
            </p>
          )}

          {question.kind === 'typePinyin' ? (
            <form
              className="quiz-type-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (verdict) void next()
                else answer(typed)
              }}
            >
              <input
                autoFocus
                value={typed}
                readOnly={verdict !== null}
                placeholder="pinyin — tones optional"
                onChange={(e) => setTyped(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={!typed.trim() && !verdict}>
                {verdict ? 'Continue' : 'Check'}
              </button>
            </form>
          ) : (
            <div className="quiz-options">
              {question.options.map((option, index) => (
                <button
                  key={option}
                  className={`quiz-option ${optionClass(index, question.answerIndex, picked, verdict)}`}
                  disabled={verdict !== null}
                  onClick={() => answer(index)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {verdict && (
            <div className={`quiz-verdict ${verdict.correct ? 'quiz-verdict-right' : 'quiz-verdict-wrong'}`}>
              <div>
                <strong>{verdict.correct ? 'Correct' : 'Not quite'}</strong>
                {!verdict.correct && <span> — {verdict.expected}</span>}
                <p className="quiz-verdict-word">
                  {question.word.hanzi} · {question.word.pinyin} · {shortGloss(question.word.english)}
                </p>
              </div>
              {/* The typed-pinyin round already has a Continue button in its form, where
                  the Enter key also lands. */}
              {question.kind !== 'typePinyin' && (
                <button className="btn btn-primary" onClick={() => void next()}>
                  Continue
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const score = questions.length > 0 ? Math.round((firstTryCorrect / questions.length) * 100) : 100
  return (
    <div className="lesson-view lesson-summary">
      <h2>{lesson.name} complete</h2>
      <p className="lesson-score">
        {firstTryCorrect} / {questions.length} right first time ({score}%)
      </p>

      {completion && (
        <div className="settings-card">
          <h3>
            {completion.added.length} word{completion.added.length === 1 ? '' : 's'} added to {completion.deckName}
          </h3>
          {completion.alreadyInDeck > 0 && (
            <p className="deck-stats">{completion.alreadyInDeck} were already in the deck.</p>
          )}
          <ul className="tutor-vocab-list">
            {completion.added.map((word) => (
              <li key={word.hanzi}>
                <span className="hanzi-inline">{word.hanzi}</span> {word.pinyin} — {shortGloss(word.english)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="lesson-nav">
        <button className="btn" onClick={onExit}>
          Back to lessons
        </button>
        {completion && (
          <button className="btn btn-primary" onClick={() => onStudy(completion.deckId)}>
            Review them now
          </button>
        )}
      </div>
    </div>
  )
}

function optionClass(index: number, answerIndex: number, picked: number | null, verdict: Verdict | null): string {
  if (!verdict) return ''
  if (index === answerIndex) return 'quiz-option-right'
  if (index === picked) return 'quiz-option-wrong'
  return 'quiz-option-dim'
}

function Toolbar({
  lesson,
  onExit,
  progress
}: {
  lesson: { name: string; words: LessonWord[] }
  onExit: () => void
  progress: string
}): React.JSX.Element {
  return (
    <div className="study-toolbar">
      <button className="btn" onClick={onExit}>
        ← Exit
      </button>
      <span className="lesson-title">{lesson.name}</span>
      <span className="study-remaining">{progress}</span>
    </div>
  )
}
