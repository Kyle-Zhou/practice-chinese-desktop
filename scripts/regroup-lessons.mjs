/**
 * Regenerates seed/lessons.json by re-grouping the already-mined words into the themes defined
 * in seed/lesson-themes.json — without re-downloading the Tatoeba/CC-CEDICT corpora.
 *
 * Each word keeps the example sentences it was mined with (grouping doesn't affect them), so
 * this is a pure, offline reshuffle. Use build-lessons.mjs instead when you need to re-mine
 * examples from the raw data.
 *
 * Usage: node scripts/regroup-lessons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { LEVELS, buildThemedLessons, loadThemes } from './lessons-shared.mjs'

const themes = loadThemes()
const existing = JSON.parse(readFileSync(join('seed', 'lessons.json'), 'utf-8'))

const wordDataByLevel = Object.fromEntries(LEVELS.map((level) => [level, new Map()]))
for (const lesson of existing) {
  for (const word of lesson.words) wordDataByLevel[lesson.level].set(word.hanzi, word)
}

// A level with no mined examples yet (e.g. a newly added HSK level) falls back to its plain
// seed/hskN.json vocabulary with no example sentences, rather than failing to regroup.
for (const level of LEVELS) {
  const deckWords = JSON.parse(readFileSync(join('seed', `hsk${level}.json`), 'utf-8'))
  for (const word of deckWords) {
    if (!wordDataByLevel[level].has(word.hanzi)) {
      wordDataByLevel[level].set(word.hanzi, { ...word, examples: [] })
    }
  }
}

const lessons = buildThemedLessons(themes, wordDataByLevel)
writeFileSync(join('seed', 'lessons.json'), `${JSON.stringify(lessons, null, 2)}\n`)

const words = lessons.reduce((n, l) => n + l.words.length, 0)
const examples = lessons.reduce((n, l) => n + l.words.reduce((m, w) => m + w.examples.length, 0), 0)
const withoutExamples = lessons.reduce((n, l) => n + l.words.filter((w) => w.examples.length === 0).length, 0)
console.log(`${lessons.length} lessons, ${words} words, ${examples} examples`)
console.log(`${withoutExamples} words have no example sentence`)
for (const level of LEVELS) {
  console.log(`  HSK${level}: ${lessons.filter((l) => l.level === level).length} lessons`)
}
