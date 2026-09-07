import { describe, expect, it } from 'vitest'
import { SentenceSplitter, shortGloss, speakableText, splitSentences } from './text'

describe('SentenceSplitter', () => {
  it('emits sentences as soon as a terminator arrives across chunks', () => {
    const s = new SentenceSplitter()
    expect(s.push('你好')).toEqual([])
    expect(s.push('！请问几位')).toEqual(['你好！'])
    expect(s.push('？')).toEqual(['请问几位？'])
    expect(s.flush()).toBeNull()
  })

  it('keeps closing quotes attached to the sentence', () => {
    expect(splitSentences('他说“好。”然后走了。')).toEqual(['他说“好。”', '然后走了。'])
  })

  it('flushes a trailing fragment without a terminator', () => {
    expect(splitSentences('好的。我们走吧')).toEqual(['好的。', '我们走吧'])
  })

  it('strips parenthetical asides for speech', () => {
    expect(speakableText('你可以说：我要一杯茶（wǒ yào yī bēi chá）。')).toBe('你可以说：我要一杯茶。')
  })
})

describe('shortGloss', () => {
  it('keeps the first senses only', () => {
    expect(shortGloss('to love; to be fond of; to like; affection')).toBe('to love; to be fond of')
    expect(shortGloss('cat')).toBe('cat')
  })
})
