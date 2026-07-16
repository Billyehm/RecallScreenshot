# Architecture

Recall AI is organized around feature modules with a thin app shell. Screens stay focused on presentation and call hooks. Hooks call services. Services delegate persistence or native access to repositories and bridges.

## App shell

`src/App.tsx` does three things:

1. Runs bootstrap work with `useAppBootstrap`.
2. Wraps the tree in `AppProviders`.
3. Renders `AppNavigator`.

`src/app/providers/AppProviders.tsx` installs the safe area provider and React Query provider.

`src/app/navigation/AppNavigator.tsx` defines the four main tabs:

- Home
- Chat
- Collections
- Stats

The shared header lives above the tab content and can navigate directly to Chat.

## Data flow

```text
Screen -> Feature hook -> Service -> Repository or native bridge -> SQLite/native API
```

For screenshot gallery data:

```text
HomeScreen / CollectionsScreen
  -> useScreenshotGallery
  -> screenshotService
  -> SQLiteScreenshotMetadataRepository
  -> ScreenshotMediaStore + SQLite
```

For mock memory data:

```text
ChatScreen / CollectionsScreen / StatsScreen
  -> memory hooks
  -> memoryService
  -> MockMemoryRepository
```

## Screenshot indexing

The screenshot pipeline is currently the most complete persistence path.

`src/features/screenshots/native/ScreenshotMediaStore.ts` wraps a native module and exposes:

- `queryScreenshots(limit, offset)`
- `getSha256(contentUri)`
- `startWatching()`
- `stopWatching()`
- `subscribe(listener)`

`src/features/screenshots/data/sqliteScreenshotMetadataRepository.ts` coordinates sync:

1. Runs migrations.
2. Requests Android image permissions.
3. Reads screenshot pages from the media store.
4. Hashes changed files when possible.
5. Upserts records into `screenshot_metadata`.
6. Marks missing records as deleted after a scan.

`src/features/screenshots/hooks/useScreenshotGallery.ts` uses `useInfiniteQuery` with a default page size of 40. It starts the watcher, syncs when media changes, invalidates screenshot queries, and deduplicates merged pages before returning them to screens.

## Database

`src/core/database/sqliteDatabase.ts` owns the Nitro SQLite connection for `recall_ai.db`.

`src/core/database/migrations.ts` currently defines migration version 1. It creates tables for:

- Screenshot metadata
- User collections
- Screenshot-to-collection links
- User notes
- User tags
- Screenshot-to-tag links
- Search history
- Favorites
- App settings
- Migration tracking

It also creates indexes for common screenshot sorting, filtering, hashing, scan, file name, and search history queries.

## Query state

React Query is used for async feature data.

Query keys live in `src/shared/utils/queryKeys.ts`, and the shared client lives in `src/core/query/queryClient.ts`.

## App state

Zustand currently stores only `hasCompletedBootstrap` in `src/core/state/useAppStore.ts`.

This is enough to track whether startup migrations finished. Future global UI or session state can live here when it is truly app-wide.

## Current mock boundaries

The following areas are mocked today:

- Chat message responses
- Collection counts and labels
- AI efficiency metrics
- Some dashboard stat values
- Search input behavior
- New collection and suggestion actions

The cleanest replacement path is to implement a real `MemoryRepository` and pass it into `MemoryService`, keeping screens and hooks mostly unchanged.

## Native and platform boundaries

The TypeScript layer expects a native `ScreenshotMediaStore` module when screenshot sync is available. If it is not registered, `ScreenshotMediaStore.isAvailable` is false and calls return safe defaults.

Android permission logic is isolated in `src/features/screenshots/services/androidMediaPermissionService.ts`.

