import { describe, expect, it } from 'vitest'
import { normalizePinyin, numberedToToneMarks, pinyinMatches } from './pinyin'

describe('numberedToToneMarks', () => {
  it('marks the vowel pinyin rules pick', () => {
    expect(numberedToToneMarks('ni3 hao3')).toBe('nǐ hǎo')
    expect(numberedToToneMarks('xie4 xie5')).toBe('xiè xie')
    expect(numberedToToneMarks('liu4')).toBe('liù')
    expect(numberedToToneMarks('gui1')).toBe('guī')
    expect(numberedToToneMarks('hao3')).toBe('hǎo')
    expect(numberedToToneMarks('zhong1 guo2')).toBe('zhōng guó')
  })

  it('keeps capitalisation and expands u: to ü', () => {
    expect(numberedToToneMarks('Bei3 jing1')).toBe('Běi jīng')
    expect(numberedToToneMarks('nu:3 hai2')).toBe('nǚ hái')
    expect(numberedToToneMarks('lu:4')).toBe('lǜ')
  })

  it('passes through tokens that are not numbered syllables', () => {
    expect(numberedToToneMarks('nǐ hǎo')).toBe('nǐ hǎo')
    expect(numberedToToneMarks('OK la5')).toBe('OK la')
  })
})

describe('normalizePinyin', () => {
  it('flattens tones, spacing and case', () => {
    expect(normalizePinyin('Nǐ hǎo')).toBe('nihao')
    expect(normalizePinyin('ni3hao3')).toBe('nihao')
    expect(normalizePinyin(' NI HAO ')).toBe('nihao')
  })

  it('treats ü, v and u: as the same vowel', () => {
    expect(normalizePinyin('nǚ')).toBe('nu')
    expect(normalizePinyin('nv')).toBe('nu')
    expect(normalizePinyin('nu:3')).toBe('nu')
  })
})

describe('pinyinMatches', () => {
  it('accepts either notation and rejects empty input', () => {
    expect(pinyinMatches('ni3 hao3', 'Nǐ hǎo')).toBe(true)
    expect(pinyinMatches('nihao', 'ni hao')).toBe(true)
    expect(pinyinMatches('ni hao', 'zai jian')).toBe(false)
    expect(pinyinMatches('', '')).toBe(false)
  })
})
