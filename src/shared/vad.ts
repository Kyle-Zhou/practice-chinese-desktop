/**
 * Energy-based voice activity detector for hands-free turn-taking.
 *
 * Pure state machine over per-frame RMS levels so it can be unit-tested without audio.
 * The renderer feeds it one RMS value per audio frame and acts on the returned event:
 * 'start' when the learner begins talking (also used to interrupt the tutor), 'end' when
 * they have been silent long enough that the utterance is over.
 *
 * The threshold adapts to the ambient noise floor, and is raised while the tutor is
 * speaking so the tutor's own voice leaking into the mic doesn't count as a barge-in.
 */
export interface VadConfig {
  /** Duration of one frame in ms (frame length / sample rate). */
  frameMs: number
  /** Sustained speech needed before an utterance starts. */
  onsetMs: number
  /** Sustained silence that ends an utterance. */
  silenceMs: number
  /** Utterances shorter than this are discarded as noise. */
  minSpeechMs: number
  /** Absolute floor for the speech threshold. */
  minThreshold: number
  /** Speech threshold = noise floor × this. */
  floorMultiplier: number
  /** Extra multiplier applied while TTS is playing. */
  bargeInMultiplier: number
  /** Sustained speech needed to interrupt the tutor (longer than onsetMs to avoid false interrupts). */
  bargeInOnsetMs: number
  /** Initial window during which every frame is treated as background noise, so a noisy room calibrates the floor. */
  calibrationMs: number
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  frameMs: 85, // 4096 frames at 48 kHz
  onsetMs: 150,
  silenceMs: 750,
  minSpeechMs: 350,
  minThreshold: 0.012,
  floorMultiplier: 3,
  bargeInMultiplier: 2.5,
  bargeInOnsetMs: 300,
  calibrationMs: 600
}

export type VadEvent = 'start' | 'end' | 'discard' | null

export class VoiceActivityDetector {
  private readonly config: VadConfig
  private noiseFloor: number
  private speechMs = 0
  private silenceMs = 0
  private utteranceMs = 0
  private inSpeech = false
  private calibratedMs = 0

  constructor(config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config }
    this.noiseFloor = this.config.minThreshold / this.config.floorMultiplier
  }

  get active(): boolean {
    return this.inSpeech
  }

  get threshold(): number {
    return Math.max(this.config.minThreshold, this.noiseFloor * this.config.floorMultiplier)
  }

  reset(): void {
    this.speechMs = 0
    this.silenceMs = 0
    this.utteranceMs = 0
    this.inSpeech = false
  }

  /**
   * @param rms level of the current frame
   * @param ttsPlaying whether the tutor's voice is currently playing (raises the bar to start)
   */
  process(rms: number, ttsPlaying: boolean): VadEvent {
    const { frameMs } = this.config
    if (this.calibratedMs < this.config.calibrationMs) {
      this.calibratedMs += frameMs
      this.noiseFloor = this.noiseFloor * 0.8 + rms * 0.2
      return null
    }
    const threshold = this.threshold * (ttsPlaying && !this.inSpeech ? this.config.bargeInMultiplier : 1)
    const loud = rms > threshold

    if (!this.inSpeech) {
      // Track the noise floor only from quiet frames so speech doesn't drag it up.
      if (!loud) this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05
      this.speechMs = loud ? this.speechMs + frameMs : 0
      const onset = ttsPlaying ? this.config.bargeInOnsetMs : this.config.onsetMs
      if (this.speechMs >= onset) {
        this.inSpeech = true
        this.utteranceMs = this.speechMs
        this.silenceMs = 0
        this.speechMs = 0
        return 'start'
      }
      return null
    }

    this.utteranceMs += frameMs
    this.silenceMs = loud ? 0 : this.silenceMs + frameMs
    if (this.silenceMs >= this.config.silenceMs) {
      const spoken = this.utteranceMs - this.silenceMs
      this.reset()
      return spoken >= this.config.minSpeechMs ? 'end' : 'discard'
    }
    return null
  }
}
