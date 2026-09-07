import { readFileSync } from 'fs'
import { join } from 'path'
import { gunzipSync } from 'zlib'
import { dictionaryEntryCount, getMeta, replaceDictionary, setMeta } from './db'
import { normalizePinyin, numberedToToneMarks } from '../shared/pinyin'
import type { DictionaryImportRow } from './db'

/** Bump when seed/cedict.u8.gz is refreshed so existing installs re-import. */
const DICTIONARY_VERSION = '1'
const DICTIONARY_META_KEY = 'dictionary_version'

/** `traditional simplified [pin1 yin1] /gloss/gloss/` — the CC-CEDICT line format. */
const CEDICT_LINE = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/$/

let ready = false

export function dictionaryReady(): boolean {
  return ready
}

function parse(path: string): DictionaryImportRow[] {
  const text = gunzipSync(readFileSync(path)).toString('utf-8')
  const rows: DictionaryImportRow[] = []
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = CEDICT_LINE.exec(line.trimEnd())
    if (!match) continue
    const [, traditional, simplified, pinyin, glosses] = match
    rows.push({
      simplified,
      traditional,
      pinyin: numberedToToneMarks(pinyin),
      pinyinNormalized: normalizePinyin(pinyin),
      // Classifier notes ("CL:個|个[ge4]", inline or as their own gloss) are reference data
      // rather than a definition, and only add noise to a result list or a card's English side.
      english: glosses
        .split('/')
        .filter((gloss) => !gloss.startsWith('CL:'))
        .map((gloss) => gloss.replace(/\s*\(CL:[^)]*\)/g, ''))
        .join('; ')
    })
  }
  return rows
}

/**
 * Imports the bundled CC-CEDICT once (~125k entries), which takes a few seconds. It runs after
 * the window is up rather than during startup so the app is usable immediately; until it
 * finishes, `dictionaryReady()` is false and the quick-add search says so.
 */
export function importDictionaryIfNeeded(seedDir: string): void {
  if (getMeta(DICTIONARY_META_KEY) === DICTIONARY_VERSION && dictionaryEntryCount() > 0) {
    ready = true
    return
  }
  const started = Date.now()
  replaceDictionary(parse(join(seedDir, 'cedict.u8.gz')))
  setMeta(DICTIONARY_META_KEY, DICTIONARY_VERSION)
  ready = true
  console.log(`Imported ${dictionaryEntryCount()} dictionary entries in ${Date.now() - started}ms`)
}
