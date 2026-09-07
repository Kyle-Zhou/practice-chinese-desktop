import { useCallback, useEffect, useRef, useState } from 'react'
import { VoiceActivityDetector } from '@shared/vad'
import { STT_SAMPLE_RATE, concatFloat32, downsample, encodeWav, rmsLevel } from '@shared/wav'
import type { VoiceMode } from '@shared/types'

export type MicState = 'off' | 'starting' | 'listening' | 'capturing'

interface Options {
  mode: VoiceMode
  /** Whether the microphone should be open at all. */
  enabled: boolean
  /** Whether new utterances may start right now (false while transcribing, for example). */
  listening: boolean
  /** Whether the tutor's voice is playing, which raises the bar for a barge-in. */
  ttsSpeaking: boolean
  onUtterance: (wav: ArrayBuffer) => void
  /** Fired when the learner starts talking over the tutor. */
  onBargeIn: () => void
}

const FRAME_SIZE = 4096
const MIN_PTT_SECONDS = 0.3
const PREROLL_FRAMES = 4

/**
 * Owns the microphone for the life of a tutoring session and turns audio into utterances.
 *
 * Hands-free mode runs the voice-activity detector on every frame: speech onset starts a
 * capture (with a short pre-roll so the first syllable isn't clipped) and, if the tutor
 * is talking, fires onBargeIn; sustained silence ends the capture and hands over a WAV.
 * Push-to-talk mode captures between pressStart and pressEnd instead.
 */
export function useVoiceLoop(options: Options): {
  micState: MicState
  level: number
  error: string | null
  pressStart: () => void
  pressEnd: () => void
} {
  const [micState, setMicState] = useState<MicState>('off')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const vadRef = useRef<VoiceActivityDetector | null>(null)
  const capturingRef = useRef(false)
  const chunksRef = useRef<Float32Array[]>([])
  const prerollRef = useRef<Float32Array[]>([])
  const levelTickRef = useRef(0)

  const finishCapture = useCallback((minSeconds: number): void => {
    capturingRef.current = false
    setMicState('listening')
    const ctx = contextRef.current
    const samples = concatFloat32(chunksRef.current)
    chunksRef.current = []
    if (!ctx || samples.length / ctx.sampleRate < minSeconds) return
    const wav = encodeWav(downsample(samples, ctx.sampleRate, STT_SAMPLE_RATE), STT_SAMPLE_RATE)
    optionsRef.current.onUtterance(wav)
  }, [])

  const beginCapture = useCallback((withPreroll: boolean): void => {
    capturingRef.current = true
    chunksRef.current = withPreroll ? [...prerollRef.current] : []
    setMicState('capturing')
  }, [])

  const handleFrame = useCallback(
    (frame: Float32Array): void => {
      const opts = optionsRef.current
      const rms = rmsLevel(frame)
      // Throttle level updates to ~15 Hz so the meter doesn't re-render on every frame.
      if (++levelTickRef.current % 2 === 0) setLevel(Math.min(1, rms * 6))

      if (capturingRef.current) chunksRef.current.push(new Float32Array(frame))
      prerollRef.current.push(new Float32Array(frame))
      if (prerollRef.current.length > PREROLL_FRAMES) prerollRef.current.shift()

      if (opts.mode !== 'handsFree') return
      const vad = vadRef.current
      if (!vad) return
      if (!opts.listening && !capturingRef.current) {
        vad.reset()
        return
      }
      const event = vad.process(rms, opts.ttsSpeaking)
      if (event === 'start') {
        if (opts.ttsSpeaking) opts.onBargeIn()
        beginCapture(true)
      } else if (event === 'end') {
        finishCapture(0)
      } else if (event === 'discard') {
        capturingRef.current = false
        chunksRef.current = []
        setMicState('listening')
      }
    },
    [beginCapture, finishCapture]
  )

  useEffect(() => {
    if (!options.enabled) return
    let cancelled = false
    setMicState('starting')
    setError(null)

    async function open(): Promise<void> {
      try {
        const granted = await window.api.voice.requestMicAccess()
        if (!granted) throw new Error('Microphone access was denied. Enable it in System Settings → Privacy → Microphone.')
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const ctx = new AudioContext()
        const source = ctx.createMediaStreamSource(stream)
        // ScriptProcessorNode is deprecated but needs no separate worklet bundle; the ~85 ms
        // frame latency is irrelevant next to speech recognition time.
        const processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1)
        processor.onaudioprocess = (e) => handleFrame(e.inputBuffer.getChannelData(0))
        const mute = ctx.createGain()
        mute.gain.value = 0
        source.connect(processor)
        processor.connect(mute)
        mute.connect(ctx.destination)

        streamRef.current = stream
        contextRef.current = ctx
        processorRef.current = processor
        vadRef.current = new VoiceActivityDetector({ frameMs: (FRAME_SIZE / ctx.sampleRate) * 1000 })
        setMicState('listening')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setMicState('off')
      }
    }
    void open()

    return () => {
      cancelled = true
      capturingRef.current = false
      chunksRef.current = []
      processorRef.current?.disconnect()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      void contextRef.current?.close()
      processorRef.current = null
      streamRef.current = null
      contextRef.current = null
      vadRef.current = null
      setMicState('off')
      setLevel(0)
    }
  }, [options.enabled, handleFrame])

  const pressStart = useCallback((): void => {
    if (optionsRef.current.mode !== 'pushToTalk' || capturingRef.current || !contextRef.current) return
    if (optionsRef.current.ttsSpeaking) optionsRef.current.onBargeIn()
    beginCapture(false)
  }, [beginCapture])

  const pressEnd = useCallback((): void => {
    if (optionsRef.current.mode !== 'pushToTalk' || !capturingRef.current) return
    finishCapture(MIN_PTT_SECONDS)
  }, [finishCapture])

  return { micState, level, error, pressStart, pressEnd }
}
