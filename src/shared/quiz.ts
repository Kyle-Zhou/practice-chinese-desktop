/**
 * Lesson quizzes, derived at runtime from the static lesson content.
 *
 * Nothing quiz-specific is authored in seed/lessons.json: distractors come from other words at
 * the same HSK level, fill-in-the-blank hides the target word inside one of its own example
 * sentences, and the listening round speaks the word. Every builder takes an explicit random
 * source so a lesson's quiz is reproducible and testable.
 */
import { pinyinMatches } from './pinyin'
import { shortGloss } from './text'
import type { LessonExample, LessonWord } from './types'

export type QuizKind = 'hanziToEnglish' | 'englishToHanzi' | 'fillBlank' | 'listening' | 'typePinyin'

interface QuizBase {
  id: string
  kind: QuizKind
  word: LessonWord
  /** What the learner is asked. Empty for the listening round, which asks with audio. */
  prompt: string
}

export interface ChoiceQuestion extends QuizBase {
  kind: 'hanziToEnglish' | 'englishToHanzi' | 'fillBlank' | 'listening'
  options: string[]
  answerIndex: number
  /** Only set for fillBlank: the sentence the blank was cut from. */
  example?: LessonExample
  /** Only set for listening: the text to speak. */
  speak?: string
}

export interface TypePinyinQuestion extends QuizBase {
  kind: 'typePinyin'
  answer: string
}

export type QuizQuestion = ChoiceQuestion | TypePinyinQuestion

export const BLANK = '＿＿'
const OPTION_COUNT = 4

/** Deterministic PRNG so a lesson's quiz is stable across renders and easy to assert on. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable seed from a lesson id, so the same lesson always builds the same quiz. */
export function seedFromId(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Picks distractors that are actually distinguishable from the answer: never the same
 * characters, and never a synonym that would make two options both correct.
 */
function pickDistractors(word: LessonWord, pool: LessonWord[], random: () => number, count: number): LessonWord[] {
  const answerGloss = shortGloss(word.english).toLowerCase()
  const candidates = pool.filter(
    (other) => other.hanzi !== word.hanzi && shortGloss(other.english).toLowerCase() !== answerGloss
  )
  return shuffle(candidates, random).slice(0, count)
}

function choiceQuestion(
  base: Omit<ChoiceQuestion, 'options' | 'answerIndex'>,
  answer: string,
  distractors: string[],
  random: () => number
): ChoiceQuestion {
  const options = shuffle([answer, ...distractors], random)
  return { ...base, options, answerIndex: options.indexOf(answer) }
}

export function buildMultipleChoice(
  word: LessonWord,
  pool: LessonWord[],
  direction: 'hanziToEnglish' | 'englishToHanzi',
  random: () => number
): ChoiceQuestion | null {
  const distractors = pickDistractors(word, pool, random, OPTION_COUNT - 1)
  if (distractors.length < OPTION_COUNT - 1) return null
  const toEnglish = direction === 'hanziToEnglish'
  return choiceQuestion(
    {
      id: `${word.hanzi}:${direction}`,
      kind: direction,
      word,
      prompt: toEnglish ? word.hanzi : shortGloss(word.english)
    },
    toEnglish ? shortGloss(word.english) : word.hanzi,
    distractors.map((d) => (toEnglish ? shortGloss(d.english) : d.hanzi)),
    random
  )
}

export function buildFillBlank(word: LessonWord, pool: LessonWord[], random: () => number): ChoiceQuestion | null {
  const example = word.examples.find((candidate) => candidate.hanzi.includes(word.hanzi))
  if (!example) return null
  const distractors = pickDistractors(word, pool, random, OPTION_COUNT - 1)
  if (distractors.length < OPTION_COUNT - 1) return null
  return choiceQuestion(
    {
      id: `${word.hanzi}:fillBlank`,
      kind: 'fillBlank',
      word,
      prompt: example.hanzi.replace(word.hanzi, BLANK),
      example
    },
    word.hanzi,
    distractors.map((d) => d.hanzi),
    random
  )
}

export function buildListening(word: LessonWord, pool: LessonWord[], random: () => number): ChoiceQuestion | null {
  const distractors = pickDistractors(word, pool, random, OPTION_COUNT - 1)
  if (distractors.length < OPTION_COUNT - 1) return null
  return choiceQuestion(
    { id: `${word.hanzi}:listening`, kind: 'listening', word, prompt: '', speak: word.hanzi },
    word.hanzi,
    distractors.map((d) => d.hanzi),
    random
  )
}

export function buildTypePinyin(word: LessonWord): TypePinyinQuestion {
  return {
    id: `${word.hanzi}:typePinyin`,
    kind: 'typePinyin',
    word,
    prompt: word.hanzi,
    answer: word.pinyin
  }
}

/**
 * Builds `perWord` questions for every word, drawing distractors from the lesson's own words
 * plus the rest of the level. Kinds are chosen per word so a lesson mixes all four formats.
 */
export function buildQuiz(
  words: LessonWord[],
  distractorPool: LessonWord[],
  seed: number,
  perWord = 2
): QuizQuestion[] {
  const random = makeRandom(seed)
  const pool = [...words, ...distractorPool]
  const questions: QuizQuestion[] = []

  for (const word of words) {
    const builders: (() => QuizQuestion | null)[] = shuffle(
      [
        () => buildMultipleChoice(word, pool, 'hanziToEnglish', random),
        () => buildMultipleChoice(word, pool, 'englishToHanzi', random),
        () => buildFillBlank(word, pool, random),
        () => buildListening(word, pool, random),
        () => buildTypePinyin(word)
      ],
      random
    )
    const built: QuizQuestion[] = []
    for (const build of builders) {
      if (built.length === perWord) break
      const question = build()
      if (question) built.push(question)
    }
    // Every word gets at least the typed-pinyin question, which needs no distractors.
    if (built.length === 0) built.push(buildTypePinyin(word))
    questions.push(...built)
  }

  return shuffle(questions, random)
}

/** Grades a response: an option index for choice questions, typed text for pinyin. */
export function checkAnswer(question: QuizQuestion, response: number | string): boolean {
  if (question.kind === 'typePinyin') {
    return typeof response === 'string' && pinyinMatches(response, question.answer)
  }
  return response === question.answerIndex
}

/** The answer to show after a wrong response. */
export function expectedAnswer(question: QuizQuestion): string {
  return question.kind === 'typePinyin' ? question.answer : question.options[question.answerIndex]
}
