import { describe, expect, it } from 'vitest'
import { concatFloat32, downsample, encodeWav } from './wav'

describe('wav helpers', () => {
  it('writes a valid 16-bit mono RIFF header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1])
    const buf = encodeWav(samples, 16000)
    const view = new DataView(buf)
    expect(String.fromCharCode(...new Uint8Array(buf.slice(0, 4)))).toBe('RIFF')
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(samples.length * 2)
    expect(view.getInt16(44 + 6, true)).toBe(0x7fff)
  })

  it('downsamples by the rate ratio', () => {
    const input = new Float32Array(48000)
    expect(downsample(input, 48000, 16000).length).toBe(16000)
    expect(downsample(input, 16000, 16000)).toBe(input)
  })

  it('concatenates frames in order', () => {
    const out = concatFloat32([new Float32Array([1, 2]), new Float32Array([3])])
    expect(Array.from(out)).toEqual([1, 2, 3])
  })
})
