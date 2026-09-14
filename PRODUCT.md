# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user is Kyle Zhou, learning Mandarin Chinese and using the app as his own daily practice tool. Vocabulary content spans HSK 1–4, so the app supports a learner progressing from foundational to upper-intermediate vocabulary rather than a single fixed level. The app may be shared with other learners eventually, so it should not assume Kyle-specific knowledge is universal, but no other audience has been onboarded yet and no decisions should be over-generalized ahead of that.

## Product Purpose

A Chinese-learning tool built for personal daily practice, combining spaced-repetition flashcards with an AI-driven spoken conversation tutor. Success is sustained regular practice: reviewing cards on schedule and having spoken lessons that actually build conversational ability, not just vocabulary exposure.

## Positioning

The distinguishing mechanism is tight integration between the spoken AI tutor and the spaced-repetition system: vocabulary and corrections that surface during a live conversation flow directly into flashcards (deduped against existing decks) rather than living in a separate app or requiring manual entry. A generic pairing of Anki plus a conversation app does not close that loop — here the conversation is the source of new cards, and the decks are the record of what conversation already covered.

## Operating Context

- Desktop Electron app (React renderer, SQLite storage, no server), used solo on one machine.
- Two core loops: (1) reviewing/studying flashcard decks via SM-2 spaced repetition, including structured lessons grouped by situational theme; (2) live spoken conversation sessions with an AI tutor (hands-free voice or push-to-talk, or typed chat), organized as either free-flowing themed conversations or scripted roleplays, ending in a session summary.
- Vocabulary that comes up in tutor sessions is committed into a "Tutor Vocabulary" deck, deduplicated against words already in any deck.
- Requires user-supplied API keys (Anthropic for the tutor; OpenAI optionally for cloud speech-to-text/text-to-speech, with local whisper.cpp and system TTS as free/offline fallbacks), entered in Settings and encrypted via OS keychain (Electron `safeStorage`).

## Capabilities and Constraints

- Spaced repetition (SM-2) flashcard decks seeded from HSK 1–4 vocabulary, plus themed lesson content grouped by situational category (not alphabetically).
- AI voice tutor: hands-free voice-activity-detected turn-taking with barge-in, sentence-level streaming TTS for low-latency spoken replies, live corrections (inline or silent mode), goal/step progress tracking, and a per-session summary.
- Custom conversation themes can be generated on the fly from a short user prompt.
- Personal desktop app: current design favors simplicity over configurability or multi-user support, though some future sharing with other learners is not ruled out.
- No server component; all data is local SQLite, so there is no cross-device sync today.

## Brand Commitments

App is named "汉语 Chinese Anki" (per the current sidebar wordmark). No other binding brand assets or voice commitments have been established.

## Evidence on Hand

No user testimonials, case studies, or external evidence exist or should be fabricated. Seeded content (HSK 1–4 vocab lists, lesson themes, scenario scripts) lives under `seed/` and is real, structured learning content already in the app, not placeholder copy.

## Product Principles

- Close the loop between conversation and memorization: anything new that comes up while speaking should be easy to turn into a reviewable flashcard, not left to fade.
- Favor a natural, low-latency spoken experience over rigid scripting — the tutor should feel like talking to a person, with correction and structure happening underneath rather than interrupting the flow.
- Keep the personal-tool simplicity that lets one person self-host their own learning data and bring their own API keys, while not foreclosing eventual use by other learners.
- Structure learning content (lessons, decks, themes) around real situational use, not arbitrary ordering like alphabetization.
