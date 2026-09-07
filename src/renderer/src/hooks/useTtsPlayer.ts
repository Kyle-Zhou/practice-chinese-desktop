import { useCallback, useEffect, useRef, useState } from 'react'
import type { TtsProvider } from '@shared/types'

interface Options {
  enabled: boolean
  provider: TtsProvider
}

interface QueueItem {
  generation: number
  buffer: Promise<AudioBuffer | null>
}

/**
 * Sentence-level text-to-speech queue.
 *
 * With the OpenAI provider every sentence is requested the moment it arrives from the
 * reply stream (so sentence N+1 is fetched while sentence N plays), decoded, and scheduled
 * back-to-back on one AudioContext for gapless playback. Because the audio is rendered by
 * Chromium, its echo canceller subtracts it from the microphone, which is what makes
 * hands-free barge-in work without headphones. The system provider uses speechSynthesis,
 * whose output bypasses the echo canceller, so it is a fallback rather than the default.
 */
export function useTtsPlayer({ enabled, provider }: Options): {
  speaking: boolean
  error: string | null
  speak: (text: string) => void
  cancel: () => void
} {
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const queueRef = useRef<QueueItem[]>([])
  const drainingRef = useRef(false)
  const generationRef = useRef(0)
  const nextStartRef = useRef(0)
  const activeRef = useRef(new Set<AudioBufferSourceNode>())
  const pendingRef = useRef(0)
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const pick = (): void => {
      const zh = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('zh'))
      voiceRef.current = zh.find((v) => v.lang.toLowerCase().startsWith('zh-cn')) ?? zh[0] ?? null
    }
    pick()
    window.speechSynthesis.addEventListener('voiceschanged', pick)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick)
  }, [])

  const settle = useCallback((): void => {
    pendingRef.current = Math.max(0, pendingRef.current - 1)
    if (pendingRef.current === 0) setSpeaking(false)
  }, [])

  const speakSystem = useCallback(
    (text: string): void => {
      if (!('speechSynthesis' in window)) return settle()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      if (voiceRef.current) utterance.voice = voiceRef.current
      utterance.rate = 0.95
      utterance.onend = settle
      utterance.onerror = settle
      window.speechSynthesis.speak(utterance)
    },
    [settle]
  )

  const drain = useCallback(async (): Promise<void> => {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current.shift()!
        const buffer = await item.buffer
        if (item.generation !== generationRef.current) continue
        const ctx = contextRef.current
        if (!buffer || !ctx) {
          settle()
          continue
        }
        if (ctx.state === 'suspended') await ctx.resume()
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        const startAt = Math.max(ctx.currentTime, nextStartRef.current)
        source.start(startAt)
        nextStartRef.current = startAt + buffer.duration
        activeRef.current.add(source)
        source.onended = () => {
          activeRef.current.delete(source)
          settle()
        }
      }
    } finally {
      drainingRef.current = false
    }
  }, [settle])

  const speak = useCallback(
    (text: string): void => {
      const trimmed = text.trim()
      if (!enabled || !trimmed) return
      pendingRef.current += 1
      setSpeaking(true)

      if (provider === 'system') return speakSystem(trimmed)

      contextRef.current ??= new AudioContext()
      const ctx = contextRef.current
      const generation = generationRef.current
      const buffer = window.api.voice
        .synthesize(trimmed)
        .then((r) => ctx.decodeAudioData(r.audio.slice(0)))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
          // Degrade to the system voice for this sentence rather than going silent.
          if (generation === generationRef.current) {
            pendingRef.current += 1
            speakSystem(trimmed)
          }
          return null
        })
      queueRef.current.push({ generation, buffer })
      void drain()
    },
    [enabled, provider, speakSystem, drain]
  )

  const cancel = useCallback((): void => {
    generationRef.current += 1
    queueRef.current = []
    for (const source of activeRef.current) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // already stopped
      }
    }
    activeRef.current.clear()
    nextStartRef.current = 0
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    pendingRef.current = 0
    setSpeaking(false)
  }, [])

  useEffect(() => {
    return () => {
      cancel()
      contextRef.current?.close()
    }
  }, [cancel])

  return { speaking, error, speak, cancel }
}
