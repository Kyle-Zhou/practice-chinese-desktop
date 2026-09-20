import { describe, expect, it } from 'vitest'
import {
  BLANK,
  buildEnglishToPinyinChoice,
  buildEnglishToPinyinType,
  buildFillBlank,
  buildListening,
  buildMultipleChoice,
  buildQuiz,
  buildTypePinyin,
  checkAnswer,
  expectedAnswer,
  makeRandom,
  seedFromId
} from './quiz'
import type { LessonWord } from './types'

function word(hanzi: string, pinyin: string, english: string, sentence?: string): LessonWord {
  return {
    hanzi,
    pinyin,
    english,
    examples: sentence ? [{ hanzi: sentence, pinyin: 'pin yin', english: 'translation' }] : []
  }
}

const target = word('猫', 'māo', 'cat', '我有一只猫。')
const pool = [target, word('狗', 'gǒu', 'dog'), word('鸟', 'niǎo', 'bird'), word('鱼', 'yú', 'fish')]
const random = (): (() => number) => makeRandom(42)

describe('buildMultipleChoice', () => {
  it('offers four options with exactly one correct answer', () => {
    const question = buildMultipleChoice(target, pool, 'hanziToEnglish', random())!
    expect(question.prompt).toBe('猫')
    expect(question.options).toHaveLength(4)
    expect(question.options[question.answerIndex]).toBe('cat')
    expect(new Set(question.options).size).toBe(4)
  })

  it('reverses the direction', () => {
    const question = buildMultipleChoice(target, pool, 'englishToHanzi', random())!
    expect(question.prompt).toBe('cat')
    expect(question.options[question.answerIndex]).toBe('猫')
  })

  it('returns null when the pool cannot supply distractors', () => {
    expect(buildMultipleChoice(target, [target, word('狗', 'gǒu', 'dog')], 'hanziToEnglish', random())).toBeNull()
  })

  it('never uses a synonym as a distractor', () => {
    const synonym = word('猫咪', 'māo mī', 'cat')
    const question = buildMultipleChoice(target, [...pool, synonym], 'hanziToEnglish', random())!
    expect(question.options.filter((option) => option === 'cat')).toHaveLength(1)
  })
})

describe('buildFillBlank', () => {
  it('blanks the word out of its own example sentence', () => {
    const question = buildFillBlank(target, pool, random())!
    expect(question.prompt).toBe(`我有一只${BLANK}。`)
    expect(question.options[question.answerIndex]).toBe('猫')
    expect(question.example?.hanzi).toBe('我有一只猫。')
  })

  it('is unavailable without an example sentence', () => {
    expect(buildFillBlank(word('猫', 'māo', 'cat'), pool, random())).toBeNull()
  })
})

describe('buildListening', () => {
  it('asks with audio and answers with hanzi', () => {
    const question = buildListening(target, pool, random())!
    expect(question.speak).toBe('猫')
    expect(question.prompt).toBe('')
    expect(question.options[question.answerIndex]).toBe('猫')
  })
})

describe('buildTypePinyin', () => {
  it('prompts with hanzi and expects the reading', () => {
    expect(buildTypePinyin(target)).toMatchObject({ prompt: '猫', answer: 'māo' })
  })
})

describe('buildEnglishToPinyinChoice', () => {
  it('prompts with the English gloss and offers pinyin options', () => {
    const question = buildEnglishToPinyinChoice(target, pool, random())!
    expect(question.prompt).toBe('cat')
    expect(question.options).toHaveLength(4)
    expect(question.options[question.answerIndex]).toBe('māo')
    expect(new Set(question.options).size).toBe(4)
  })

  it('never offers a homophone as a distractor', () => {
    const homophone = word('猫猫', 'māo', 'kitty')
    const question = buildEnglishToPinyinChoice(target, [...pool, homophone], random())!
    expect(question.options.filter((option) => option === 'māo')).toHaveLength(1)
  })

  it('returns null when the pool cannot supply distractors', () => {
    expect(buildEnglishToPinyinChoice(target, [target, word('狗', 'gǒu', 'dog')], random())).toBeNull()
  })
})

describe('buildEnglishToPinyinType', () => {
  it('prompts with the English gloss and expects the reading', () => {
    expect(buildEnglishToPinyinType(target)).toMatchObject({ prompt: 'cat', answer: 'māo' })
  })
})

describe('checkAnswer', () => {
  it('grades typed pinyin with or without tones', () => {
    const question = buildTypePinyin(target)
    expect(checkAnswer(question, 'mao')).toBe(true)
    expect(checkAnswer(question, 'MĀO')).toBe(true)
    expect(checkAnswer(question, 'mao1')).toBe(true)
    expect(checkAnswer(question, 'gou')).toBe(false)
  })

  it('grades typed pinyin from an English prompt the same way', () => {
    const question = buildEnglishToPinyinType(target)
    expect(checkAnswer(question, 'mao')).toBe(true)
    expect(checkAnswer(question, 'gou')).toBe(false)
    expect(expectedAnswer(question)).toBe('māo')
  })

  it('grades choice questions by index', () => {
    const question = buildMultipleChoice(target, pool, 'hanziToEnglish', random())!
    expect(checkAnswer(question, question.answerIndex)).toBe(true)
    expect(checkAnswer(question, (question.answerIndex + 1) % 4)).toBe(false)
    expect(expectedAnswer(question)).toBe('cat')
  })
})

describe('buildQuiz', () => {
  const words = [target, word('狗', 'gǒu', 'dog', '这是狗。'), word('鸟', 'niǎo', 'bird')]
  const rest = [word('鱼', 'yú', 'fish'), word('马', 'mǎ', 'horse'), word('羊', 'yáng', 'sheep')]

  it('asks two questions per word and mixes formats', () => {
    const questions = buildQuiz(words, rest, seedFromId('hsk1-01'))
    expect(questions).toHaveLength(6)
    for (const w of words) {
      expect(questions.filter((q) => q.word.hanzi === w.hanzi)).toHaveLength(2)
    }
    expect(new Set(questions.map((q) => q.kind)).size).toBeGreaterThan(1)
  })

  it('is deterministic for a given seed', () => {
    const seed = seedFromId('hsk1-01')
    expect(buildQuiz(words, rest, seed)).toEqual(buildQuiz(words, rest, seed))
    expect(buildQuiz(words, rest, seed)).not.toEqual(buildQuiz(words, rest, seedFromId('hsk1-02')))
  })

  it('still produces questions when no distractors exist', () => {
    // Both pinyin-production kinds need no distractors, so they alone fill the perWord quota.
    const questions = buildQuiz([target], [], seedFromId('solo'))
    expect(questions).toHaveLength(2)
    expect(new Set(questions.map((q) => q.kind))).toEqual(new Set(['typePinyin', 'englishToPinyinType']))
  })
})
