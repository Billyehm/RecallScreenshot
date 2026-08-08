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

## Offline image intelligence

The Android pipeline is local-only. No component declares a network requirement, sends media to a service, or copies original images into app storage.

```text
MediaStore ContentObserver / permission grant / 12-hour fallback
  -> RecallIndexScheduler
  -> RecallIndexWorker
  -> MediaStoreScanner (cursor streamed into SQLite)
  -> batches of 8 Pending rows
  -> sampled bitmap decode
  -> bundled ML Kit OCR + bundled ML Kit image labeling
  -> category rules + fused semantic/visual embedding
  -> app-cache thumbnail + recall_ai.db metadata
```

`MediaStoreScanner` reads `Screenshots`, `Pictures`, `DCIM`, and `Downloads`. It stores the original `content://` URI and metadata only. The MediaStore ID is the stable primary key, the URI is unique, and changed size/date or embedding version requeues a row. A scan token marks removed images without loading the library into memory. Deletion marking is disabled when Android grants only selected-photo access.

`RecallIndexWorker` uses WorkManager with battery-not-low, storage-not-low, and no-network constraints. Work is unique, resumable, and processed sequentially in batches of eight. Pause cancels immediate chains and workers also check the pause flag between images. A periodic scan covers changes received while the React Native process is not observing MediaStore.

### Model selection

The first production profile uses the bundled variants of Google ML Kit Latin Text Recognition and Image Labeling. They are Android-optimized learned models, require no runtime model download, run on CPU, and avoid shipping a large dual-encoder model before device profiling is available.

Each image stores a normalized 192-float embedding:

- 128 semantic dimensions derived deterministically from OCR text, learned image labels, filename, and category vocabulary.
- 64 visual dimensions containing a 4-by-4 spatial grid of RGB means and edge energy.

This profile is deliberately smaller and simpler than MobileCLIP. Natural-language search is strongest for screenshots because OCR and learned labels share the query's semantic space; image-to-image search additionally uses the visual dimensions. It does not claim full open-vocabulary CLIP quality. `embedding_version` makes the boundary explicit: a quantized MobileCLIP or MobileNet dual-encoder can replace the embedding provider later and automatically requeue old rows without changing discovery, storage, WorkManager, or React Native APIs.

### Local schema

`screenshot_metadata` is shared by native Android SQLite and Nitro SQLite through `recall_ai.db` with WAL enabled. Originals are never stored. Relevant index columns are:

- Identity: `id`, unique `media_store_uri`, `file_name`, `relative_path`.
- Media metadata: size, dimensions, MIME type, created/modified timestamps.
- Intelligence: `ocr_text`, `image_labels`, `category`, thumbnail cache path, float embedding BLOB, dimensions, and version.
- Queue state: processing/OCR/embedding status, attempts, error, indexed/updated timestamps, scan token, and soft-delete flag.
- User state: favorites, hidden/archive flags, notes, tags, and collection references.

Queue and category indexes avoid table scans for worker claims and grouping. Embeddings are little-endian float BLOBs; 10,000 current vectors use about 7.3 MiB before SQLite overhead.

### Search workflows

Text search tokenizes the prompt, produces the same deterministic semantic vector, obtains bounded lexical candidates from filename/OCR/labels/category, and streams completed embeddings through a fixed-size top-K heap. Ranking is 72 percent cosine similarity and 28 percent lexical overlap.

Image similarity reuses an indexed vector when available. For an external selected image it decodes a sampled bitmap and computes the visual subvector locally, then streams the index through the same top-K heap while excluding the selected URI. Neither workflow loads all rows or vectors into a collection.

Categorization combines OCR, filename, and learned labels against fixed on-device vocabularies for Finance, Shopping, Travel, Work, Documents, Education, Social Media, and Entertainment, with `Other` as fallback.

### React Native boundary

`src/features/screenshots/native/ScreenshotMediaStore.ts` exposes paged discovery, index start/pause/resume/status, text search, image similarity, hashing, and MediaStore change subscriptions. `ScreenshotService` keeps screens independent from the native implementation. The existing JS repository remains responsible for gallery paging and user metadata in the shared database.

### Performance and privacy

- MediaStore rows stream directly into SQLite; image results are paged.
- Only one sampled bitmap is live at a time and is recycled after processing.
- Thumbnails have a 384-pixel maximum edge and replace stale versions.
- Search keeps only `limit` results in RAM; limits are capped at 100.
- Failed work is bounded to three attempts and abandoned processing is recovered after 30 minutes.
- Bundled ML Kit artifacts perform inference on-device and no analytics, cloud API, remote model, or network worker is used.

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

