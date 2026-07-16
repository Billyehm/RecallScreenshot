# Development Guide

This guide captures the current project conventions and the safest places to extend the app.

## Common commands

Install dependencies:

```sh
npm install
```

Start Metro:

```sh
npm start
```

Type-check the project:

```sh
npm run typecheck
```

Run the app:

```sh
npm run android
```

```sh
npm run ios
```

## Coding conventions

- Use TypeScript for app source.
- Keep screens mostly presentational.
- Put data fetching and cache logic in feature hooks.
- Put orchestration logic in feature services.
- Put storage and native access behind repositories or bridge modules.
- Keep shared visual primitives in `src/shared/components`.
- Keep app-wide colors and styles in `src/shared/theme`.

## Adding a feature

Create a folder under `src/features/<feature-name>` and add only the layers needed:

```text
src/features/example/
  screens/
  hooks/
  services/
  data/
  domain/
```

Recommended flow:

1. Define domain types or repository interfaces in `domain/`.
2. Implement persistence or remote access in `data/`.
3. Add orchestration in `services/`.
4. Add React Query hooks in `hooks/`.
5. Keep the screen in `screens/`.

Small UI-only features may only need `screens/` and hooks.

## Working with screenshot data

Use `screenshotService` rather than calling `ScreenshotMediaStore` directly from UI code.

The service handles sync coordination, maps metadata rows into shared `Screenshot` UI objects, and exposes watcher subscription methods.

For new screenshot fields:

1. Add the field to the domain type in `src/features/screenshots/domain/screenshotMetadata.ts`.
2. Add a migration if SQLite needs a new persisted column.
3. Update row mapping in `sqliteScreenshotMetadataRepository.ts`.
4. Update service mapping in `screenshotService.ts` if the UI needs it.

## Replacing mock memory data

Mock memory data lives in `src/features/memory/data/mockMemoryRepository.ts`.

To replace it:

1. Implement the `MemoryRepository` interface from `src/features/memory/domain/memoryRepository.ts`.
2. Wire the new repository into `MemoryService`.
3. Keep existing hooks intact unless query behavior changes.

This keeps `HomeScreen`, `ChatScreen`, `CollectionsScreen`, and `StatsScreen` insulated from the data source change.

## Query keys

Add or update query keys in `src/shared/utils/queryKeys.ts`.

Use broad parent keys for invalidation and specific child keys for paged or filtered queries. The screenshot gallery already follows this pattern with `screenshots` and paged screenshot keys.

## Database changes

Database migrations live in `src/core/database/migrations.ts`.

For schema changes:

1. Add a new migration object with the next version number.
2. Keep migration statements idempotent where practical.
3. Avoid changing old migrations after they may have shipped to a device.
4. Update repository row types and mappers at the same time.

## Current limitations

- Search UI is present but does not execute a query yet.
- Chat composer stores draft text locally but does not send messages.
- Collection creation and suggestion actions are visual only.
- AI metrics are sample data.
- Screenshot OCR, embeddings, and semantic search are represented in schema fields but are not implemented in the TypeScript layer yet.

