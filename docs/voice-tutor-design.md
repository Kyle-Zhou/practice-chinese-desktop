# Voice AI Tutor: design

Goal: a spoken Mandarin conversation that feels like talking to a person on the phone — you
just talk, it talks back — while staying a *lesson*: it speaks Chinese, sticks to a theme,
corrects every mistake, tracks what you've covered, ends with a summary, and turns new words
into flashcards.

This document describes the architecture as implemented on this branch and the reasoning
behind each choice. Sections marked **Later** are designed but not built.

## 1. Constraints that shape the design

- **Claude has no audio input or output.** Speech-to-text (STT) and text-to-speech (TTS) must
  come from somewhere else. Everything language-related (reply, corrections, goal tracking,
  vocab, summary) stays on Claude.
- **Latency is the product.** A voice turn feels natural under ~1.5 s from the end of your
  sentence to the first spoken word. Every serial step in that path is felt directly.
- **Cost per turn must be small.** A 20-minute session is 30 to 60 turns. The per-turn calls
  use Haiku 4.5 and prompt caching; the once-per-session summary and the theme designer use
  Sonnet 5.
- **Personal desktop app.** Simplicity wins over generality. One user, one machine, no server.

## 2. Two shapes of lesson

A scenario has a `kind`, and it changes the prompt, the progress model, and the UI:

| | `conversation` (default) | `roleplay` |
|---|---|---|
| Tutor is | 小李, a Mandarin teacher | a character (waiter, doctor, interviewer) |
| Plan is | 4–6 **unordered goals** | 5–6 **ordered steps** |
| Steering | works a goal in when it fits | drives toward the next step |
| Feels like | a phone call with a tutor | a scene you play out |

`conversation` is what makes the experience free-flowing: the model is never told "do step 3
next", only "here are the goals still open, bring one in when it's natural". Four themes ship
seeded (Your Weekend, Food and Cooking, Daily Routine and Work, Hometown and Travel) alongside
the five original role-plays.

### Custom themes

Typing a theme ("my trip to Chengdu", "practice 把 sentences") into the picker calls
`createTheme` (`src/main/tutor/theme.ts`): Sonnet 5 with a strict `define_lesson` tool returns
a title, a description, and 4–6 conversational goals with key phrases. The result is saved as
a `custom` conversation scenario and the session starts immediately. Goals are required to be
things the learner *does* (describe, compare, narrate), not grammar labels, because the
progress model scores accomplishment, not exposure.

## 3. Turn pipeline

```
    voice activity detector (renderer, every ~85 ms frame)
                 │ speech onset → capture (with pre-roll)
                 │ 750 ms silence → utterance done
                 ▼
          16 kHz mono WAV ──► IPC voice:transcribe
                                    │
                                    ▼
                             STT provider (main)          ~0.6–1.2 s
                                    │  text
                                    ▼
                 ┌──────────────────┴──────────────────┐
                 │ reply stream (Haiku)                │ analysis call (Haiku, parallel)
                 │ chunk → sentence → replyDone        │ corrections + goals met + vocab
                 ▼                                     ▼
   per sentence: voice:synthesize → MP3          side panel updates, cards added
   decoded and scheduled gaplessly               (never blocks the conversation)
                 └──────────────────┬──────────────────┘
                                    ▼
                     appendTutorTurn (one SQLite transaction)
```

Key decisions:

1. **The tutor speaks first.** `openSession` streams a greeting on an empty transcript, like
   answering a call, so there is no blank screen waiting for you to start. It is idempotent
   (guarded by an in-flight set) because React strict mode double-invokes effects.
2. **Reply and analysis run concurrently.** Analysis only needs your message and the tutor's
   previous line, so the critical path is `max(reply, analysis)` rather than the sum. Analysis
   failure is caught and logged; the turn still succeeds with no corrections.
3. **Sentence-level streaming to TTS.** `SentenceSplitter` (`src/shared/text.ts`) emits on
   every Chinese terminator (。！？；). Each sentence is synthesized as it arrives, so sentence
   N+1 is being fetched while sentence N plays. Speech starts after the first sentence instead
   of the whole reply.
4. **Turns are serialized, not dropped.** `turnRef` in `TutorChat` holds the in-flight turn;
   an utterance that lands mid-turn waits for it rather than racing it into the transcript.
5. **The transcript is shown before it is answered.** Recognized text appears as your bubble
   with a mic icon, so STT errors are visible.

### Latency budget (Apple Silicon, typical)

| Step | Time |
|---|---|
| End of speech → VAD fires → WAV encoded | ~770 ms (750 ms of it is the silence window) |
| STT (OpenAI gpt-4o-mini-transcribe) | 600–1200 ms |
| STT (local whisper.cpp, small model, Metal) | 400–900 ms |
| Reply first token (Haiku, cached prefix) | 300–600 ms |
| First sentence synthesized and playing | +400–700 ms (OpenAI TTS), ~0 ms (system) |
| Analysis complete (parallel) | 800–1500 ms, off the critical path |

The silence window is the dominant tunable: shorter feels snappier but cuts you off when you
pause to think. 750 ms is the compromise for a learner speaking a second language.

## 4. Hands-free turn-taking

`voiceMode` is `handsFree` (default) or `pushToTalk`. Hands-free is what makes it feel like
talking to a person, and it rests on a voice activity detector plus echo cancellation.

**The VAD** (`src/shared/vad.ts`) is a pure state machine over per-frame RMS, so it is unit
tested without audio. It calibrates a noise floor for the first 600 ms, then treats
`max(0.012, floor × 3)` as the speech threshold, updating the floor only from quiet frames so
speech can't drag it up. 150 ms of sustained speech starts a capture; 750 ms of silence ends
it; utterances under 350 ms are discarded as noise (a cough, a door).

**Barge-in.** Starting to talk over the tutor cuts it off mid-sentence, which is the single
thing that most makes a voice UI feel real. This is only safe because it is deliberately
harder to trigger than a normal utterance: while TTS is playing the threshold is multiplied
by 2.5 and the onset requirement doubles to 300 ms. When it fires, the player is cancelled and
the *remaining* sentences of that reply are suppressed rather than queued behind the
interruption.

**Why the tutor's voice doesn't interrupt itself.** Cloud TTS is played through Web Audio, so
Chromium's echo canceller (enabled on the mic stream) subtracts it from the input. The
system `speechSynthesis` voice bypasses that path — the OS plays it, Chromium never sees it —
so with the system provider on speakers the tutor can hear itself. That is the real reason
cloud TTS is the default and the system voice is the fallback, not just quality.

**Push-to-talk** remains for noisy rooms: hold Space or the mic button, release to send, with
a 300 ms minimum to swallow accidental taps. Both modes share one microphone that stays open
for the life of the session (`useVoiceLoop`), so there is no per-turn device acquisition delay.

## 5. The voice UI

Hands-free sessions open in `VoiceOverlay`: a full-screen view with a single orb that scales
with your input level while you talk and pulses while the tutor talks, a status line
(Listening / Got it / Thinking / Speaking), captions for the last thing each of you said, the
most recent correction, and three controls — mute, switch to the chat transcript, end session.
There is nothing to click to take a turn.

The chat view is still there behind the keyboard button, with the transcript, the goal list,
all corrections, and the new-card list, and you can type instead of speak at any point.

## 6. Speech-to-text

Provider selection lives in Settings, implemented in `src/main/tutor/stt.ts`.

| Provider | Setup | Cost | Offline | Mandarin quality |
|---|---|---|---|---|
| **OpenAI `gpt-4o-mini-transcribe`** (default) | paste one key | ~$0.003/min | no | excellent |
| **Local whisper.cpp** (`whisper-cli`) | `brew install whisper-cpp` + a ggml model | free | yes | good with `small`, very good with `medium` |

Both are called with `language=zh` and a short Mandarin prompt so the model does not drift into
Cantonese or English hallucinations on short clips. The renderer captures PCM via Web Audio,
downsamples to 16 kHz, and encodes WAV itself (`src/shared/wav.ts`), so the provider interface
is just `wav → text` with no transcoding or ffmpeg dependency.

Rejected: the Web Speech API does not work in Electron (Chromium's recognizer needs
Google-internal keys); Claude cannot take audio; bundling whisper.cpp as a native Node addon
adds a fragile native build step for no latency gain over the CLI.

## 7. Text-to-speech

| Provider | Voice | Cost | Notes |
|---|---|---|---|
| **OpenAI `gpt-4o-mini-tts`** (default) | 10 voices, `nova` default | ~$0.015/min | natural prosody; steerable via instructions |
| **System `speechSynthesis`** | macOS `zh-CN` voice | free | offline fallback; breaks hands-free on speakers (§4) |

The cloud voice is given a standing instruction — friendly tutor, standard 普通话, clear tones,
relaxed pace, "warm and encouraging, never theatrical" — which is what separates it from a
narrator reading text. Audio comes back as MP3 (~20 KB per sentence, small enough for IPC),
is decoded, and is scheduled on one `AudioContext` at `max(now, endOfPreviousSentence)` so
consecutive sentences play gaplessly instead of with a stutter between them.

A 200-entry LRU cache keyed by voice + text covers the phrases that repeat constantly
(greetings, 你可以说 recasts, 对！). If synthesis fails, that sentence degrades to the system
voice rather than going silent.

Replies are written to be *spoken*: the prompt forbids markdown, lists, pinyin, and stage
directions, and `speakableText` strips parenthetical asides so an English gloss is read on
screen but not aloud.

## 8. Guardrails

The free-flowing brief needs the model to stay a Chinese tutor without a rigid script. The
conversation prompt states them in explicit priority order, which is what keeps them stable
when they conflict:

1. **Language.** Mandarin only, simplified characters, never switch to English even if the
   learner does. If they ask how to say something, give them the Chinese and invite them to
   say it. At most one short parenthetical English gloss per reply.
2. **Theme.** Stay on the theme and goals. Follow a digression for at most one exchange, then
   steer back with a question. Anything that isn't practicing Chinese (code, homework, news)
   is declined in one friendly Chinese sentence.
3. **Tutor.** Adapt to the learner's level, model the goal vocabulary in your own sentences,
   encourage without gushing.

Plus the shape of speech itself: one to three sentences, one question at a time, so the
learner always has something to answer.

## 9. Progress without a script

Progress = completed goals / total, from `planProgress` (`src/shared/plan.ts`), the single
source of truth used by the engine, the session list, and both UIs.

How the tutor knows where to pick up:

- The reply system prompt holds the full goal list and is byte-identical for the whole
  session, so it stays cached.
- Per-turn state (what's covered, what's still open with key phrases) is appended to the
  newest user message as a bracketed tutor-state note, never persisted. History bytes stay
  identical between turns, so the cache breakpoint on the last history message keeps hitting
  as goals complete. Putting progress in the system prompt would invalidate the whole cache
  every time a goal completed.
- The analysis call decides which still-incomplete ids were actually accomplished, and is
  told to be strict: being *asked* about something is not doing it.
- Resuming loads `completedCheckpointIds` from SQLite, so a session left at 60% resumes at 60%
  and the tutor picks up from there.

## 10. Corrections

Two modes, chosen at session start:

- **inline** (default): when your last message has an error, the tutor opens with
  `你可以说：<corrected sentence>。` and continues in character. You hear every correction.
- **silent**: fully immersive; corrections only appear on screen.

In both modes the structured correction record comes from the analysis call, so the panel and
the summary are identical either way. The analysis prompt is told the input came from speech
recognition and to ignore missing punctuation and transcription artifacts — otherwise it
"corrects" the recognizer instead of the learner.

## 11. Vocabulary to flashcards

The analysis call proposes vocab from either speaker. `commitVocab` adds cards to the "Tutor
Vocabulary" deck, skipping any hanzi that already exists in **any** deck (an HSK word already
being studied is not new). Dedup is one indexed lookup per candidate (`idx_cards_hanzi`).
Added words are stored on the session (`vocab_added`), so the count survives resume.

## 12. Summary

`endSession` runs once: Sonnet 5 reads the transcript plus the correction list and returns key
mistake patterns and learnings via a strict tool. Coverage, vocab, and progress are computed
locally. The summary is persisted, so past sessions reopen from the picker without another
API call.

## 13. Models

| Call | Model | Why |
|---|---|---|
| Reply | Haiku 4.5 (`fast`, default) or Sonnet 5 (`smart`) | every turn; latency and cost dominate |
| Analysis | Haiku 4.5 | every turn, parallel, structured output |
| Theme design | Sonnet 5 | once per custom theme; quality of goals matters |
| Summary | Sonnet 5 | once per session |

Sonnet 5 runs adaptive thinking by default, which adds seconds before the first token — fatal
for a spoken reply — so wherever it is used interactively it gets `thinking: disabled` and
`effort: low`. Haiku 4.5 rejects `output_config.effort` and gets neither parameter.

## 14. Data model

`tutor_sessions` gains `vocab_added`, `correction_mode`, `summary`, `updated_at`; `scenarios`
gains `tutor_role`, `kind`, and `custom`. Columns are added with guarded `ALTER TABLE`, so
existing databases migrate in place (verified by booting against a pre-migration file via the
`CHINESE_ANKI_DB_PATH` override). Seeded scenarios are upserted by name on seed-version bump
so plan edits reach existing installs without orphaning sessions, which reference scenarios by
id; custom scenarios are never touched by seeding.

Settings are a JSON blob in `meta` (`app_settings`); secrets are per-provider entries
encrypted with `safeStorage`. The Anthropic key keeps its original meta key.

## 15. IPC contract

| Channel | Direction | Purpose |
|---|---|---|
| `voice:requestMicAccess` | invoke | macOS microphone TCC prompt |
| `voice:transcribe(wav)` | invoke | WAV → `{ text, durationMs }` |
| `voice:synthesize(text)` | invoke | sentence → MP3 `ArrayBuffer` |
| `tutor:listScenarios` / `createTheme` / `deleteScenario` | invoke | themes, including custom |
| `tutor:startSession` / `getSession` / `openSession` | invoke | start, load, tutor's opening line |
| `tutor:sendMessage(id, text, source)` | invoke | one turn; resolves when reply and analysis are done |
| `tutor:event` | push | `chunk` / `sentence` / `replyDone` / `analysis` |
| `tutor:listSessions` / `deleteSession` | invoke | resume and history |
| `tutor:endSession(id)` | invoke | summarize and persist |
| `settings:get` / `update` / `secretStatus` / `setSecret` / `clearSecret` | invoke | preferences and keys |

## 16. Cost per session (rough)

A 40-turn session: reply calls average ~2.5k cached input + ~150 output tokens; analysis ~1k
input + ~200 output. On Haiku 4.5 that is well under $0.10 for the conversation, plus one
Sonnet 5 summary (~$0.02), STT (~$0.06 for 20 minutes on OpenAI, $0 local), and TTS (~$0.10
for ~7 minutes of tutor speech, $0 with the system voice). Roughly $0.30 for a 20-minute
hands-free session, or ~$0.12 with local whisper and the system voice.

## 17. Later

- **Pronunciation feedback.** STT text hides tone errors. Options: word-level confidence from
  the STT provider, or a dedicated pronunciation scorer.
- **Semantic endpointing.** The 750 ms silence window is a fixed guess. A small model deciding
  "was that a complete thought?" would let short answers send instantly and long pauses
  survive.
- **Streaming STT.** Sending audio during the utterance rather than after would remove most of
  the recognition time from the critical path.
- **Spaced repetition on mistakes.** Recurring correction patterns into grammar cards, the way
  vocab flows into "Tutor Vocabulary".
- **Editing a generated theme.** Custom themes are generated once; the goals aren't editable
  afterwards. The data model already supports it.
