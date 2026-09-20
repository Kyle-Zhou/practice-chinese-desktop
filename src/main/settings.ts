import { safeStorage } from 'electron'
import { deleteMeta, getMeta, setMeta } from './db'
import type { AppSettings, SecretName } from '../shared/types'

/**
 * Secrets are encrypted with the OS keychain (Electron safeStorage) and stored in the
 * meta table. The Anthropic key keeps its original meta key so existing installs
 * don't have to re-enter it.
 */
const SECRET_META_KEYS: Record<SecretName, string> = {
  anthropic: 'anthropic_api_key_encrypted',
  openai: 'secret:openai'
}

export function hasSecret(name: SecretName): boolean {
  return getMeta(SECRET_META_KEYS[name]) !== null
}

export function getSecret(name: SecretName): string | null {
  const stored = getMeta(SECRET_META_KEYS[name])
  if (!stored) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  return safeStorage.decryptString(Buffer.from(stored, 'base64'))
}

export function setSecret(name: SecretName, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-level credential encryption is not available on this machine')
  }
  setMeta(SECRET_META_KEYS[name], safeStorage.encryptString(value).toString('base64'))
}

export function clearSecret(name: SecretName): void {
  deleteMeta(SECRET_META_KEYS[name])
}

export function listSecretStatus(): Record<SecretName, boolean> {
  return { anthropic: hasSecret('anthropic'), openai: hasSecret('openai') }
}

const SETTINGS_META_KEY = 'app_settings'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  sttProvider: 'openai',
  whisperCliPath: '',
  whisperModelPath: '',
  autoSpeak: true,
  ttsProvider: 'openai',
  ttsVoice: 'nova',
  voiceMode: 'pushToTalk',
  replyModel: 'fast',
  showPinyin: true,
  voiceShowEnglish: false
}

export function getSettings(): AppSettings {
  const raw = getMeta(SETTINGS_META_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  setMeta(SETTINGS_META_KEY, JSON.stringify(next))
  return next
}
