# Recall AI

Recall AI is a React Native app for turning local screenshots into a searchable, organized digital memory. The current app shell includes a polished tabbed interface, local screenshot indexing, SQLite metadata storage, and mock AI/memory data that can be replaced by real services over time.

## What is in place

Recall AI is a React Native app for turning local screenshots into a searchable, organized digital memory. The current app shell includes a polished tabbed interface, local screenshot indexing, SQLite metadata storage, and mock AI/memory data that can be replaced by real services over time.

- Home dashboard with search entry, smart suggestion chips, recent screenshots, quick metrics, and an AI prompt shortcut.
- Chat tab with a conversational UI backed by mock memory messages.
- Collections tab with mock collection summaries plus recently indexed screenshots.
- Stats tab with mock insight and processing metrics.
- Local screenshot discovery through a `ScreenshotMediaStore` native module bridge.
- SQLite metadata persistence for screenshot records, collections, notes, tags, search history, favorites, and app settings.
- React Query for async data loading and cache invalidation.
- Zustand for lightweight app bootstrap state.

## Tech stack

- React Native `0.81.5`
- React `19.1.0`
- TypeScript with strict mode
- React Navigation bottom tabs
- TanStack React Query
- Zustand
- Nitro SQLite
- MMKV
- React Native vector icons

## Project structure

```text
src/
  App.tsx
  app/
    bootstrap/        App startup work, including database migrations
    navigation/       Tab navigator and navigation types
    providers/        App-level providers
  core/
    database/         SQLite connection and migrations
    query/            React Query client
    state/            Global app state
    storage/          Key-value storage wrapper
  features/
    chat/             Chat screen
    collections/      Collections screen
    home/             Home dashboard
    memory/           Mock memory repository, hooks, and service
    screenshots/      Screenshot sync, metadata repository, and native bridge
    stats/            Stats screen
  shared/
    components/       Reusable UI components
    hooks/            Shared hooks
    theme/            Colors and shared styles
    types/            Shared domain/UI types
    utils/            Shared utilities
```

## Getting started

Install dependencies:

```sh
npm install
```

Start Metro:

```sh
npm start
```

Run the TypeScript checker:

```sh
npm run typecheck
```

Run on a device or emulator:

```sh
npm run android
```

```sh
npm run ios
```

Build a fresh release APK after UI or native changes:

```sh
npm run android:apk
```

The command cleans Android outputs before Gradle creates and embeds a new JavaScript bundle. The APK is written to `android/app/build/outputs/apk/release/app-release.apk`. If Metro is showing stale code during development, restart it with `npm run start:reset`.

## Current data model

The app currently has two data paths:

- Screenshot metadata is real local data. `src/features/screenshots/services/screenshotService.ts` syncs screenshots from the native media store bridge into SQLite through `src/features/screenshots/data/sqliteScreenshotMetadataRepository.ts`.
- AI memory content is mocked. `src/features/memory/data/mockMemoryRepository.ts` provides sample screenshots, collections, efficiency metrics, and chat messages for the dashboard-style screens.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for more detail.

## Permissions and platform notes

Screenshot discovery depends on Android media permissions handled in `src/features/screenshots/services/androidMediaPermissionService.ts`.

On Android 14 and newer, the service supports both full image access and the limited visual selection permission. On Android 13, it requests `READ_MEDIA_IMAGES`. On older Android versions, it requests `READ_EXTERNAL_STORAGE`.

If the native `ScreenshotMediaStore` module is unavailable, the TypeScript bridge safely returns empty results.

## Development notes

- Keep feature code grouped under `src/features/<feature-name>`.
- Keep reusable UI and app-wide types under `src/shared`.
- Keep infrastructure code under `src/core`.
- Prefer repository/service boundaries for data access instead of calling native modules directly from screens.
- Run `npm run typecheck` before handing off meaningful source changes.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Guide](docs/DEVELOPMENT.md)

