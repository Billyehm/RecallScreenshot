# Architecture

Recall AI is organized around feature modules with a thin app shell. Screens stay focused on presentation and call hooks. Hooks call services. Services delegate persistence or native access to repositories and bridges.

## App shell

`src/App.tsx` does three things:

1. Runs bootstrap work with `useAppBootstrap`.
2. Wraps the tree in `AppProviders`.
3. Renders `AppNavigator`.

`src/app/providers/AppProviders.tsx` installs the safe area provider and React Query provider.

`src/app/navigation/AppNavigator.tsx` defines the five main tabs:

- Home
- Search
- Categories
- Stats
- Settings

The assistant is not a tab. It opens as a full-screen modal, from the "Ask Recall" entry in the side
menu or the ask panel near the bottom of Home. The shared header sits above the tab content and can
open the side menu or the assistant directly.

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

For search and the assistant:

```text
SearchScreen / ChatScreen
  -> useSearch / useConversation
  -> searchService
  -> ScreenshotMediaStore.searchText (native ranker)
```

For categories and stats:

```text
CollectionsScreen        StatsScreen
  -> collection hooks      -> useIndexStatus / useStorageInfo / useCategoryCounts
  -> collectionService     -> screenshotService
  -> SQLiteCollectionRepository       -> ScreenshotMediaStore + SQLite
   + NativeCollectionSuggestionRepository
```

## Offline image intelligence

The Android pipeline is local-only. No component declares a network requirement, sends media to a service, or copies original images into app storage.

```text
MediaStore ContentObserver / permission grant / 12-hour fallback
  -> RecallIndexScheduler
  -> RecallIndexWorker
  -> MediaStoreScanner (cursor streamed into SQLite)
  -> batches of 4 Pending rows
  -> sampled bitmap decode
  -> bundled ML Kit OCR + bundled ML Kit image labeling
  -> category rules + MobileCLIP2-B image embedding
  -> app-cache thumbnail + recall_ai.db metadata
```

`MediaStoreScanner` queries the whole `MediaStore.Images` collection and admits a row only if two
independent gates pass: its folder is one the user allowed, and its kind matches the index scope
(`screenshotsOnly` or `allImages`). Until the user picks folders there is no folder restriction, so
the scope is what keeps a fresh install from reading an entire photo library. It stores the original
`content://` URI and metadata only. The MediaStore ID is the stable primary key, the URI is unique,
and changed size/date or embedding version requeues a row. A scan token marks removed images without
loading the library into memory. Deletion marking is disabled when Android grants only selected-photo
access.

`RecallIndexWorker` runs unique, resumable work, processed sequentially in batches of four — small
because MobileCLIP2-B is substantially heavier than the descriptor this pipeline originally computed,
and a batch has to finish inside WorkManager's execution window on a low-end phone. Pause cancels
immediate chains and workers also check the pause flag between images. Once the queue drains, a capped
repair pass regenerates thumbnails the platform reclaimed from `cacheDir` without re-running OCR or
the embedding.

Only the 12-hour periodic scan carries battery-not-low and storage-not-low constraints. Immediate and
continuation work is deliberately unconstrained: gating it made the UI report "Running" while
WorkManager waited indefinitely on a constraint the user could not see.

### Model selection

Text recognition and image labeling use the bundled variants of Google ML Kit Latin Text Recognition
and Image Labeling — Android-optimized, no runtime model download, CPU inference.

Embeddings come from **MobileCLIP2-B**, exported to two ONNX graphs and dynamically quantized to
per-tensor INT8. Both towers are memory-mapped straight out of the APK, which is why `noCompress`
covers `onnx` — compressing them would force a second ~146 MB copy through the heap before inference.
`ClipTokenizer` is the OpenAI CLIP byte-pair tokenizer feeding the 77-token text tower.

Each image stores one normalized 512-float vector. Image and text embeddings occupy the same shared
multimodal space, so a natural-language query is compared against image vectors directly rather than
against a proxy built from OCR text and labels. That is what makes open-vocabulary search work: a
query can describe something no label vocabulary contains.

The graphs and the tokenizer vocabulary are about 151 MB and are not tracked in git. See
[DEVELOPMENT.md](DEVELOPMENT.md#on-device-models) for how the directory is provisioned and which
constants are a contract between the Kotlin and Python sides.

`embedding_version` keeps the boundary explicit: raising it requeues every indexed row automatically,
without changing discovery, storage, WorkManager or the React Native API. It is currently 5.

### Local schema

`screenshot_metadata` is shared by native Android SQLite and Nitro SQLite through `recall_ai.db` with WAL enabled. Originals are never stored. Relevant index columns are:

- Identity: `id`, unique `media_store_uri`, `file_name`, `relative_path`.
- Media metadata: size, dimensions, MIME type, created/modified timestamps.
- Intelligence: `ocr_text`, `image_labels`, `category`, thumbnail cache path, float embedding BLOB, dimensions, and version.
- Queue state: processing/OCR/embedding status, attempts, error, indexed/updated timestamps, scan token, and soft-delete flag.
- User state: favorites, hidden/archive flags, notes, tags, and collection references.

Queue and category indexes avoid table scans for worker claims and grouping. Embeddings are
little-endian float BLOBs at 512 dimensions, so 2 KiB per image: 10,000 vectors use about 19.5 MiB
before SQLite overhead.

### Search workflows

Text search runs in two stages, for two different reasons.

Stage one streams the index and scores **content evidence only** — cosine against the MobileCLIP text
vector, plus a coverage-weighted match from the token table — keeping a bounded candidate heap sized
from the page rather than the library. Context signals are excluded here on purpose: recency inside
the cut would let a brand-new unrelated screenshot displace an older exact match before anything got
a chance to rank it.

Stage two rescores the surviving slice with the full picture. Weights differ by query kind, because a
phrase and a similarity probe weigh the same features very differently:

| Profile | semantic | lexical | category | recency | engagement |
|---|---|---|---|---|---|
| `TEXT` — a real phrase | 0.44 | 0.36 | 0.10 | 0.07 | 0.03 |
| `SIMILARITY` — image probe | 0.88 | — | 0.05 | 0.05 | 0.02 |
| `BROWSE` — no usable terms | 0.28 | — | 0.10 | 0.56 | 0.06 |

On top of that, falling inside a date window the phrase named adds 0.14, and a verbatim phrase hit in
the recognized text adds 0.10. OCR is hydrated last, for the winning page only, because one
text-heavy screenshot can approach SQLite's 2 MB CursorWindow limit.

The explicit search-screen filters — category, date window, has-text, folder — are hard exclusions
applied per streamed row *before* the candidate cut, so a narrow filter still returns a full page
rather than a trimmed one. An inferred category is only evidence and stays a soft signal; a filter is
an instruction.

Image similarity reuses the stored vector when the source is indexed, and embeds an unindexed image on
demand otherwise. Both paths land in the same 512-dimensional space, and the selected URI is excluded.
Neither workflow loads all rows or vectors into a collection.

Categorization combines OCR, filename, and learned labels against fixed on-device vocabularies for Finance, Shopping, Travel, Work, Documents, Education, Social Media, and Entertainment, with `Other` as fallback.

### React Native boundary

`src/features/screenshots/native/ScreenshotMediaStore.ts` exposes paged discovery, index
start/pause/resume/status, text search with filters, image similarity, collection suggestions, folder
listing and scope, index scope, storage figures, single and batch delete, single and batch share,
clearing derived AI data, dropping the database, SHA-256 hashing, and MediaStore change subscriptions.
Every method returns a safe default when the native module is absent, so `isAvailable` being false
degrades the UI rather than throwing. `ScreenshotService` keeps screens independent from the native
implementation. The existing JS repository remains responsible for gallery paging and user metadata in
the shared database.

### Performance and privacy

- MediaStore rows stream directly into SQLite; image results are paged.
- Only one sampled bitmap is live at a time and is recycled after processing.
- Thumbnails have a 384-pixel maximum edge and replace stale versions.
- Search keeps only `limit` results in RAM; limits are capped at 100.
- Failed work is bounded to three attempts and abandoned processing is recovered after 30 minutes.
- Bundled ML Kit artifacts and the memory-mapped MobileCLIP2-B graphs all infer on-device. No
  analytics, cloud API, remote model download, or network worker is used, and the ONNX graphs are read
  from the APK rather than fetched.

## Database

`src/core/database/sqliteDatabase.ts` owns the Nitro SQLite connection for `recall_ai.db`.

`src/core/database/migrations.ts` defines migrations 1 through 5, applied in order and tracked in
`schema_migrations`.

Version 1 creates the base tables:

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

The later versions build out the intelligence and query surface:

- **2** — the derived columns on `screenshot_metadata` (`ocr_text`, `image_labels`, `category`,
  `thumbnail_path`, `embedding_vector`, `embedding_version`, processing status and attempts), plus the
  processing-queue and category indexes.
- **3** — the `screenshot_ocr` table, `auto_tags` and `category_confidence`.
- **4** — the `screenshot_embeddings` table indexed by `model_version`, which is what lets a new model
  requeue only the rows it invalidates.
- **5** — covering indexes for the visible-library, per-category and category-count queries, so the
  gallery and the counts on Home and Stats avoid table scans.

Both layers open `recall_ai.db`, and both set `PRAGMA foreign_keys = ON` on their own connection —
per-connection state, so `ON DELETE CASCADE` would silently stop firing if either side skipped it.
Native access resolves the file under `filesDir` through `FilesDirContext`, because
react-native-nitro-sqlite roots every connection there; without that the two layers open two different
inodes of the same filename and never observe each other's rows.

## Query state

React Query is used for async feature data.

Query keys live in `src/shared/utils/queryKeys.ts`, and the shared client lives in `src/core/query/queryClient.ts`.

## App state

Zustand currently stores only `hasCompletedBootstrap` in `src/core/state/useAppStore.ts`.

This is enough to track whether startup migrations finished. Future global UI or session state can live here when it is truly app-wide.

## Data sources

No screen renders mock or sample data. Every figure and list resolves to one of three sources:

- **SQLite** — screenshot metadata, categories, collection membership, tags, settings.
- **The native index** — recognized text, image labels, embeddings, ranking, similarity, category
  suggestions, index progress and storage figures, all reached through `ScreenshotMediaStore`.
- **MediaStore** — the device library itself, scanned for discovery and never copied.

The assistant is not a generative model. `useConversation` answers by running the question through
`searchService` and describing what the index returned, so an answer can always be traced to
specific indexed images.

## Native and platform boundaries

The TypeScript layer expects a native `ScreenshotMediaStore` module when screenshot sync is available. If it is not registered, `ScreenshotMediaStore.isAvailable` is false and calls return safe defaults.

Android permission logic is isolated in `src/features/screenshots/services/androidMediaPermissionService.ts`.

