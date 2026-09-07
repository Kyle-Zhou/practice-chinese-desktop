import { describe, expect, it } from 'vitest'
import { VoiceActivityDetector } from './vad'

const cfg = { frameMs: 100, onsetMs: 200, silenceMs: 500, minSpeechMs: 300, minThreshold: 0.02, bargeInOnsetMs: 400, calibrationMs: 0 }

function feed(vad: VoiceActivityDetector, levels: number[], playing = false): string[] {
  return levels.map((l) => vad.process(l, playing)).filter((e): e is 'start' | 'end' | 'discard' => e !== null)
}

describe('VoiceActivityDetector', () => {
  it('starts after sustained speech and ends after sustained silence', () => {
    const vad = new VoiceActivityDetector(cfg)
    const events = feed(vad, [0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0, 0, 0, 0, 0])
    expect(events).toEqual(['start', 'end'])
  })

  it('ignores a single loud frame (a click) as onset', () => {
    const vad = new VoiceActivityDetector(cfg)
    expect(feed(vad, [0, 0.2, 0, 0, 0.2, 0, 0])).toEqual([])
  })

  it('discards utterances shorter than minSpeechMs', () => {
    const vad = new VoiceActivityDetector(cfg)
    // 200 ms of speech (onset) then immediately silent: total spoken 200 ms < 300 ms.
    expect(feed(vad, [0.1, 0.1, 0, 0, 0, 0, 0])).toEqual(['start', 'discard'])
  })

  it('requires louder and longer speech to interrupt while TTS is playing', () => {
    const vad = new VoiceActivityDetector({ ...cfg, bargeInMultiplier: 3 })
    // 0.03 is above the 0.02 threshold but below the 0.06 barge-in threshold.
    expect(feed(vad, [0.03, 0.03, 0.03, 0.03, 0.03], true)).toEqual([])
    // Loud enough, but only 300 ms < bargeInOnsetMs.
    expect(feed(vad, [0.5, 0.5, 0.5, 0], true)).toEqual([])
    expect(feed(vad, [0.5, 0.5, 0.5, 0.5], true)).toEqual(['start'])
  })

  it('calibrates to a noisy room so steady hum never becomes speech', () => {
    const vad = new VoiceActivityDetector({ ...cfg, calibrationMs: 600 })
    expect(feed(vad, new Array(200).fill(0.03))).toEqual([])
    expect(vad.threshold).toBeGreaterThan(0.05)
    // Real speech above the adapted threshold still registers.
    expect(feed(vad, [0.3, 0.3, 0.3, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03])).toEqual(['start', 'end'])
  })
})
