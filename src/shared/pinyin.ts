/**
 * Pinyin helpers shared by the dictionary importer, the lesson generator, and the quiz grader.
 *
 * CC-CEDICT stores readings as tone numbers with `u:` for ü (`nu:3 hai2`). Learners read tone
 * marks, so we convert on import; graders and search need a toneless form, so we also flatten
 * to bare letters. Both directions live here so the app and the offline generator agree.
 */

const TONE_MARKED_VOWELS: Record<string, string> = {
  a: 'aāáǎà',
  e: 'eēéěè',
  i: 'iīíǐì',
  o: 'oōóǒò',
  u: 'uūúǔù',
  ü: 'üǖǘǚǜ'
}

/** A syllable's tone mark goes on 'a'; else on 'o'/'e'; else on the last vowel (as in "liù", "guī"). */
function markedVowelIndex(letters: string): number {
  const lower = letters.toLowerCase()
  const a = lower.indexOf('a')
  if (a !== -1) return a
  const o = lower.indexOf('o')
  if (o !== -1) return o
  const e = lower.indexOf('e')
  if (e !== -1) return e
  for (let i = lower.length - 1; i >= 0; i--) {
    if (TONE_MARKED_VOWELS[lower[i]]) return i
  }
  return -1
}

function applyToneMark(letters: string, tone: number): string {
  if (tone < 1 || tone > 4) return letters
  const index = markedVowelIndex(letters)
  if (index === -1) return letters
  const vowel = letters[index]
  const marked = TONE_MARKED_VOWELS[vowel.toLowerCase()][tone]
  return letters.slice(0, index) + (vowel === vowel.toLowerCase() ? marked : marked.toUpperCase()) + letters.slice(index + 1)
}

/** `u:` and `v` are both ASCII stand-ins for ü in CC-CEDICT and in learner typing. */
function expandUmlaut(syllable: string): string {
  return syllable.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü')
}

const NUMBERED_SYLLABLE = /^([a-zA-ZüÜ:]+)([1-5])$/

/**
 * Converts one whitespace-separated token. Tokens that aren't numbered syllables
 * (punctuation, latin words inside a gloss) pass through untouched.
 */
function convertToken(token: string): string {
  const match = NUMBERED_SYLLABLE.exec(token)
  if (!match) return token
  const letters = expandUmlaut(match[1])
  return applyToneMark(letters, Number(match[2]))
}

/** `ni3 hao3` → `nǐ hǎo`. Already-marked or unmarked input is returned unchanged. */
export function numberedToToneMarks(numbered: string): string {
  return numbered.trim().split(/\s+/).map(convertToken).join(' ')
}

const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * Flattens pinyin to bare lowercase letters with no tones, spaces, or punctuation, so
 * `Nǐ hǎo`, `ni3hao3`, and `ni hao` all compare equal. Used for dictionary search and
 * for grading typed pinyin.
 */
export function normalizePinyin(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/u:/g, 'u')
    .replace(/[üv]/g, 'u')
    .replace(/[^a-z]/g, '')
}

/** True when two pinyin readings match ignoring tones, spacing, and case. */
export function pinyinMatches(a: string, b: string): boolean {
  const left = normalizePinyin(a)
  return left.length > 0 && left === normalizePinyin(b)
}
