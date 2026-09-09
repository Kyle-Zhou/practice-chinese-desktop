/**
 * Offline generator for seed/lessons.json.
 *
 * Lessons are static content shipped with the app, so this runs during development and its
 * output is committed. It attaches example sentences mined from Tatoeba (pinyin from CC-CEDICT)
 * to each HSK word, then groups the words into situational themed lessons via lessons-shared.mjs
 * (themes live in seed/lesson-themes.json). To re-theme without re-mining, use
 * regroup-lessons.mjs instead — it reshuffles the already-committed lessons.json offline.
 *
 * Download the inputs into a scratch directory first (they are far too large to commit):
 *   cedict_ts.u8         https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip
 *   cmn_sentences.tsv    https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2
 *   eng_sentences.tsv    https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2
 *   cmn-eng_links.tsv    https://downloads.tatoeba.org/exports/per_language/cmn/cmn-eng_links.tsv.bz2
 *
 * Usage: node scripts/build-lessons.mjs --data .context/work
 *
 * Sentence data is CC-BY 2.0 FR (Tatoeba); readings come from CC-BY-SA 4.0 CC-CEDICT. Both are
 * credited in the app's Settings screen.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { numberedToToneMarks } from '../src/shared/pinyin.ts'
import { buildThemedLessons, loadThemes } from './lessons-shared.mjs'

const LEVELS = [
  { level: 1, file: 'hsk1.json', maxSentenceChars: 12 },
  { level: 2, file: 'hsk2.json', maxSentenceChars: 16 },
  { level: 3, file: 'hsk3.json', maxSentenceChars: 20 }
]
const EXAMPLES_PER_WORD = 2
const MIN_INTERESTING_CHARS = 4

/**
 * CC-CEDICT lists heteronyms in arbitrary order, so a greedy lookup picks the wrong reading for
 * the handful of characters that carry most of the traffic in short sentences. Pin those down.
 */
const READING_OVERRIDES = new Map(
  Object.entries({
    的: 'de5', 了: 'le5', 着: 'zhe5', 地: 'de5', 得: 'de5', 不: 'bu4', 一: 'yi1', 个: 'ge4',
    们: 'men5', 吗: 'ma5', 呢: 'ne5', 吧: 'ba5', 啊: 'a5', 么: 'me5', 是: 'shi4', 好: 'hao3',
    会: 'hui4', 要: 'yao4', 还: 'hai2', 长: 'chang2', 为: 'wei4', 都: 'dou1', 只: 'zhi3',
    中: 'zhong1', 和: 'he2', 没: 'mei2', 大: 'da4', 干: 'gan4', 觉: 'jue2', 行: 'xing2',
    教: 'jiao1', 少: 'shao3', 差: 'cha4', 空: 'kong4', 数: 'shu4', 便: 'bian4', 假: 'jia4',
    应: 'ying1', 相: 'xiang1', 这: 'zhe4', 那: 'na4', 哪: 'na3', 看: 'kan4', 上: 'shang4',
    下: 'xia4', 听: 'ting1', 说: 'shuo1', 喝: 'he1', 别: 'bie2', 给: 'gei3', 比: 'bi3',
    几: 'ji3', 远: 'yuan3', 猫: 'mao1', 累: 'lei4', 更: 'geng4', 读: 'du2', 见: 'jian4',
    喂: 'wei2', 写: 'xie3', 红: 'hong2', 车: 'che1', 过: 'guo4', 难: 'nan2', 雨: 'yu3',
    六: 'liu4', 打: 'da3', 发: 'fa1', 分: 'fen1', 种: 'zhong3', 藏: 'cang2', 尽: 'jin3',
    多少: 'duo1 shao3', 不是: 'bu4 shi4', 东西: 'dong1 xi5', 便宜: 'pian2 yi5',
    告诉: 'gao4 su5', 女人: 'nu:3 ren2', 到了: 'dao4 le5'
  })
)

function parseArgs() {
  const index = process.argv.indexOf('--data')
  if (index === -1 || !process.argv[index + 1]) {
    console.error('Usage: node scripts/build-lessons.mjs --data <dir-with-raw-downloads>')
    process.exit(1)
  }
  return process.argv[index + 1]
}

/** Parses CC-CEDICT into a simplified-headword index plus the traditional-only character set. */
function loadCedict(path) {
  const bySimplified = new Map()
  const simplifiedChars = new Set()
  const traditionalChars = new Set()

  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/$/.exec(line.trim())
    if (!match) continue
    const [, traditional, simplified, pinyin, glosses] = match
    for (const char of simplified) simplifiedChars.add(char)
    for (const char of traditional) traditionalChars.add(char)
    const entry = { traditional, simplified, pinyin, english: glosses.split('/') }
    const existing = bySimplified.get(simplified)
    if (existing) existing.push(entry)
    else bySimplified.set(simplified, [entry])
  }

  const traditionalOnly = new Set([...traditionalChars].filter((c) => !simplifiedChars.has(c)))
  return { bySimplified, traditionalOnly }
}

function loadTsv(path) {
  return readFileSync(path, 'utf-8').split('\n')
}

/** Tatoeba ships sentences and translation links separately; join them into cmn → best English. */
function loadSentencePairs(dir) {
  const english = new Map()
  for (const line of loadTsv(join(dir, 'eng_sentences.tsv'))) {
    const tab = line.indexOf('\t')
    if (tab === -1) continue
    english.set(line.slice(0, tab), line.slice(line.indexOf('\t', tab + 1) + 1))
  }

  const translations = new Map()
  for (const line of loadTsv(join(dir, 'cmn-eng_links.tsv'))) {
    const [cmnId, engId] = line.split('\t')
    const text = english.get(engId)
    if (!text) continue
    const best = translations.get(cmnId)
    // Shorter translations are usually the plainer, more literal ones.
    if (!best || text.length < best.length) translations.set(cmnId, text)
  }

  const pairs = []
  for (const line of loadTsv(join(dir, 'cmn_sentences.tsv'))) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const translation = translations.get(parts[0])
    if (translation) pairs.push({ hanzi: parts[2].trim(), english: translation.trim() })
  }
  return pairs
}

const HANZI = /[一-鿿]/
const ALLOWED_PUNCTUATION = /[，。！？、；：“”‘’（）《》…—～·\s]/

/** Romanised sentences read better with ASCII punctuation than with the full-width originals. */
const PUNCTUATION = new Map(
  Object.entries({
    '，': ',', '。': '.', '！': '!', '？': '?', '、': ',', '；': ';', '：': ':',
    '“': '"', '”': '"', '‘': "'", '’': "'", '（': '(', '）': ')', '《': '"', '》': '"', '～': '~'
  })
)

function isCleanSentence(text, traditionalOnly) {
  let hanziCount = 0
  for (const char of text) {
    if (HANZI.test(char)) {
      if (traditionalOnly.has(char)) return 0
      hanziCount++
      continue
    }
    if (!ALLOWED_PUNCTUATION.test(char)) return 0
  }
  return hanziCount
}

/** Greedy longest-match segmentation against CC-CEDICT headwords. */
function segment(text, bySimplified) {
  const tokens = []
  let i = 0
  while (i < text.length) {
    if (!HANZI.test(text[i])) {
      tokens.push({ text: text[i], word: false })
      i++
      continue
    }
    let length = Math.min(6, text.length - i)
    for (; length > 1; length--) {
      if (bySimplified.has(text.slice(i, i + length))) break
    }
    tokens.push({ text: text.slice(i, i + length), word: true })
    i += length
  }
  return tokens
}

function readingFor(word, bySimplified) {
  const override = READING_OVERRIDES.get(word)
  if (override) return override
  const entries = bySimplified.get(word)
  if (!entries) return null
  // Proper nouns are capitalised in CC-CEDICT; prefer a common-noun reading when one exists.
  const common = entries.find((e) => e.pinyin === e.pinyin.toLowerCase())
  return (common ?? entries[0]).pinyin
}

function sentencePinyin(text, bySimplified) {
  let out = ''
  for (const token of segment(text, bySimplified)) {
    if (!token.word) {
      if (!token.text.trim()) continue
      out += PUNCTUATION.get(token.text) ?? token.text
      continue
    }
    const reading = readingFor(token.text, bySimplified)
    if (!reading) return null
    if (out) out += ' '
    out += numberedToToneMarks(reading)
  }
  return out.trim()
}

function main() {
  const dir = parseArgs()
  const { bySimplified, traditionalOnly } = loadCedict(join(dir, 'cedict_ts.u8'))
  const pairs = loadSentencePairs(dir)

  const levelWords = LEVELS.map((level) => ({
    ...level,
    words: JSON.parse(readFileSync(join('seed', level.file), 'utf-8'))
  }))

  // A sentence is "level appropriate" when its characters are ones the learner has already met,
  // so the known-character set grows as we walk up the levels.
  const knownChars = new Set()
  const usedSentences = new Set()
  const wordDataByLevel = {}
  let missingExamples = 0

  for (const level of levelWords) {
    for (const word of level.words) for (const char of word.hanzi) knownChars.add(char)

    // Index candidate sentences by the hanzi they contain so each word is a map lookup.
    const candidates = new Map()
    for (const pair of pairs) {
      const hanziCount = isCleanSentence(pair.hanzi, traditionalOnly)
      if (hanziCount === 0 || hanziCount > level.maxSentenceChars) continue
      if (pair.english.length > 90) continue
      let unknown = 0
      for (const char of pair.hanzi) if (HANZI.test(char) && !knownChars.has(char)) unknown++
      for (const word of level.words) {
        if (!pair.hanzi.includes(word.hanzi)) continue
        const list = candidates.get(word.hanzi)
        const entry = { ...pair, hanziCount, unknown }
        if (list) list.push(entry)
        else candidates.set(word.hanzi, [entry])
      }
    }

    for (const [, list] of candidates) {
      // Fewest unfamiliar characters first, then real sentences over two-word fragments,
      // then shortest — all proxies for "easy to read but still worth reading".
      list.sort(
        (a, b) =>
          a.unknown - b.unknown ||
          (a.hanziCount < MIN_INTERESTING_CHARS) - (b.hanziCount < MIN_INTERESTING_CHARS) ||
          a.hanziCount - b.hanziCount ||
          a.hanzi.localeCompare(b.hanzi)
      )
    }

    // Mine examples per word, keyed by hanzi. Grouping into themed lessons happens afterwards
    // via the shared grouper, but examples are chosen here in seed order so the "used sentence"
    // dedupe is deterministic and independent of how words are later grouped.
    const data = new Map()
    for (const word of level.words) {
      const examples = []
      for (const candidate of candidates.get(word.hanzi) ?? []) {
        if (examples.length === EXAMPLES_PER_WORD) break
        if (usedSentences.has(candidate.hanzi)) continue
        const pinyin = sentencePinyin(candidate.hanzi, bySimplified)
        if (!pinyin) continue
        usedSentences.add(candidate.hanzi)
        examples.push({ hanzi: candidate.hanzi, pinyin, english: candidate.english })
      }
      if (examples.length === 0) missingExamples++
      data.set(word.hanzi, { ...word, examples })
    }
    wordDataByLevel[level.level] = data
  }

  const lessons = buildThemedLessons(loadThemes(), wordDataByLevel)

  writeFileSync(join('seed', 'lessons.json'), `${JSON.stringify(lessons, null, 2)}\n`)
  const wordCount = lessons.reduce((n, l) => n + l.words.length, 0)
  const exampleCount = lessons.reduce((n, l) => n + l.words.reduce((m, w) => m + w.examples.length, 0), 0)
  console.log(`${lessons.length} lessons, ${wordCount} words, ${exampleCount} examples`)
  console.log(`${missingExamples} words have no example sentence`)
}

main()
