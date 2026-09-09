/**
 * Shared lesson-grouping logic, used by both build-lessons.mjs (full rebuild from raw corpora)
 * and regroup-lessons.mjs (re-shuffle the already-mined words without re-downloading).
 *
 * Words are grouped into situational themes rather than sliced alphabetically: a lesson is a
 * scene ("Food & drink", "Getting around") mixing nouns, verbs, and adjectives. Themes are
 * defined in seed/lesson-themes.json, ordered as a beginner curriculum within each HSK level,
 * and they spiral — Food/Family/Time recur at every level with deeper vocabulary. HSK level
 * stays the difficulty backbone, so example sentences can still assume earlier levels are known.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const LEVELS = [1, 2, 3]

export function loadThemes() {
  return JSON.parse(readFileSync(join('seed', 'lesson-themes.json'), 'utf-8'))
}

/** Splits a theme that is larger than one lesson into balanced, evenly-sized lessons. */
function splitIntoLessons(words, maxPerLesson) {
  if (words.length <= maxPerLesson) return [words]
  const parts = Math.ceil(words.length / maxPerLesson)
  const size = Math.ceil(words.length / parts)
  const chunks = []
  for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size))
  return chunks
}

/**
 * Turns theme definitions + per-word data into the flat lesson list written to lessons.json.
 * `wordDataByLevel` maps level → (hanzi → { hanzi, pinyin, english, examples }).
 */
export function buildThemedLessons(themesByLevel, wordDataByLevel, maxPerLesson = 10) {
  const lessons = []
  for (const level of LEVELS) {
    const themes = themesByLevel[String(level)]
    const data = wordDataByLevel[level]
    let lessonInLevel = 0
    for (const theme of themes) {
      const words = theme.words.map((hanzi) => {
        const entry = data.get(hanzi)
        if (!entry) throw new Error(`No word data for ${hanzi} (HSK${level})`)
        return entry
      })
      const chunks = splitIntoLessons(words, maxPerLesson)
      chunks.forEach((chunkWords, index) => {
        lessonInLevel++
        lessons.push({
          id: `hsk${level}-${String(lessonInLevel).padStart(2, '0')}`,
          name: chunks.length > 1 ? `${theme.name} (${index + 1})` : theme.name,
          level,
          order: lessons.length + 1,
          words: chunkWords
        })
      })
    }
  }
  return lessons
}
