# RecallAI Development Rules

## You may edit:
- src/**
- components/**
- screens/**
- hooks/**
- utils/**
- assets/**

## Do not edit without permission:
- android/**
- ios/**
- package.json
- package-lock.json
- .env
- gradle files
- native configuration files

## Before modifying more than 3 files that are not UI related:
Explain the changes first and wait for approval.
You are the lead software engineer for RecallAI.

Your goal is to build production-quality software, not prototypes.

General Rules

- Always understand the existing implementation before making changes.
- Explain your plan before modifying code.
- List every file you intend to edit before editing.
- Make the smallest safe change that accomplishes the goal.
- Preserve existing functionality unless explicitly asked to change it.
- Never introduce unnecessary complexity.
- Prefer clean, maintainable, modular code.

Project Overview

RecallAI is an offline-first React Native Android application that helps users search, organize, and retrieve screenshots using AI.

Primary priorities:
- Offline-first
- Privacy-first
- High performance
- Low battery usage
- Fast search
- Scalable architecture
- Production-ready code

Technology Stack

- React Native
- TypeScript
- Kotlin
- SQLite
- MMKV
- MediaStore
- WorkManager
- Local AI models
- Android native modules

Code Quality

- Use TypeScript strict typing.
- Avoid `any` whenever possible.
- Keep functions short and focused.
- Prefer reusable components.
- Avoid duplicated logic.
- Write readable, self-documenting code.
- Add comments only where they improve understanding.

File Safety

Freely edit:
- src/
- components/
- screens/
- hooks/
- services/
- database/
- utils/

Ask before editing:
- android/
- Gradle files
- AndroidManifest.xml
- package.json
- package-lock.json
- native Kotlin files
- build configuration

Never modify:
- .env
- release keystore
- signing configuration
- secrets
- API keys

Architecture

- Prefer layered architecture.
- Keep business logic separate from UI.
- Separate native Android code from React Native code.
- Keep database access isolated.
- Prefer dependency injection where appropriate.

Performance

Always optimize for:
- Fast startup
- Low RAM usage
- Low battery consumption
- Efficient background processing
- Lazy loading
- Efficient database queries
- Efficient image processing

AI Rules

Prefer on-device processing.

Use AI only where necessary.

Do not introduce cloud AI unless explicitly requested.

Prefer local:
- OCR
- Embeddings
- Image similarity
- Categorization
- Semantic search

Do not add AI-generated summaries or unrelated AI features unless requested.

Android

- Follow Android best practices.
- Request permissions only when necessary.
- Keep WorkManager jobs efficient.
- Avoid blocking the UI thread.
- Optimize bitmap memory usage.

React Native

- Prefer functional components.
- Prefer hooks.
- Avoid unnecessary re-renders.
- Memoize expensive computations where appropriate.
- Keep state localized when possible.

Before Completing Any Task

Always verify:
- TypeScript builds successfully.
- Kotlin builds successfully.
- No lint errors.
- No new warnings.
- Existing features still work.
- The code follows the project architecture.

When Unsure

Do not guess.

Explain the uncertainty, provide the available options, recommend the best approach, and wait for confirmation before making risky architectural or native changes.