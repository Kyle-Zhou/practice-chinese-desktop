import { spawn } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getSecret, getSettings } from '../settings'
import type { TranscribeResult } from '../../shared/types'

/**
 * Speech-to-text providers. The renderer always sends 16 kHz mono 16-bit WAV, so every
 * provider is just `wav -> text`. Claude has no audio input, so this is the one place
 * the app talks to a non-Anthropic service (or a local whisper.cpp binary).
 */
export interface SttProviderImpl {
  transcribe(wav: Buffer): Promise<string>
}

/** OpenAI hosted transcription. `language: zh` + a domain prompt cut hallucinated English and wrong-dialect output. */
const openaiProvider: SttProviderImpl = {
  async transcribe(wav) {
    const apiKey = getSecret('openai')
    if (!apiKey) throw new Error('No OpenAI API key configured for speech recognition. Add one in Settings.')

    const form = new FormData()
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav')
    form.append('model', 'gpt-4o-mini-transcribe')
    form.append('language', 'zh')
    form.append('prompt', '普通话口语对话，简体中文。')
    form.append('response_format', 'json')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Speech recognition failed (${res.status}): ${detail.slice(0, 200)}`)
    }
    const data = (await res.json()) as { text: string }
    return data.text.trim()
  }
}

/** Local whisper.cpp (`brew install whisper-cpp`), fully offline. Needs a ggml model file. */
const whisperCliProvider: SttProviderImpl = {
  async transcribe(wav) {
    const { whisperCliPath, whisperModelPath } = getSettings()
    if (!whisperCliPath || !whisperModelPath) {
      throw new Error('Set the whisper.cpp binary and model paths in Settings to use local speech recognition.')
    }
    const dir = await mkdtemp(join(tmpdir(), 'chinese-anki-stt-'))
    const wavPath = join(dir, 'speech.wav')
    try {
      await writeFile(wavPath, wav)
      const args = ['-m', whisperModelPath, '-l', 'zh', '--no-timestamps', '--no-prints', '-f', wavPath]
      const text = await runProcess(whisperCliPath, args)
      return text.replace(/\s+/g, ' ').trim()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

function runProcess(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-300)}`))
    })
  })
}

const PROVIDERS = { openai: openaiProvider, 'whisper-cli': whisperCliProvider } as const

export async function transcribe(wav: Buffer): Promise<TranscribeResult> {
  const provider = PROVIDERS[getSettings().sttProvider]
  const started = Date.now()
  const text = await provider.transcribe(wav)
  return { text, durationMs: Date.now() - started }
}
