# Recall AI

Recall AI turns the screenshots already on your Android device into a searchable library. Text
recognition, image labeling, embeddings and ranking all run on-device: no image and no derived data
ever leaves the phone, and the app makes no network requests of its own.

The shipped manifest does still carry `INTERNET` and `ACCESS_NETWORK_STATE`, merged in from React
Native, plus `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED` and `FOREGROUND_SERVICE` from WorkManager — none
are requested by Recall's own code. See "Permissions and platform notes".

## What is in place

Five tabs — Home, Search, Categories, Stats, Settings — with the library, image viewer and
collection picker presented as full-screen modals, and the AI assistant in a side menu.

- **Home** — search entry, recent screenshots, category shortcuts. "See more" opens the library in
  grid or list layout, the choice persisted.
- **Search** — queries recognized text and image labels, narrowed by category, date range,
  has-text and folder. Filters are applied inside the native ranker before its candidate cut, so a
  narrow filter still returns a full page.
- **Categories** — categories the indexer names from the images themselves; create your own, add or
  remove images, disband a category.
- **Stats** — index progress and what the index occupies on disk.
- **Settings** — pause indexing, clear derived AI data, delete the database, choose which device
  folders are in scope.
- **Viewer** — the full image, with an overflow menu for similar images, recognized text and
  metadata, plus share and delete. Long-press in the library selects multiple images; delete raises
  one system confirmation for the whole selection.
- **Indexing** — a WorkManager pipeline discovers images through MediaStore and processes them in
  batches, surviving process death and respecting the pause switch.
- SQLite metadata for screenshots, collections, tags, recognized text and settings; React Query for
  caching and invalidation; Zustand for bootstrap state; MMKV for preferences.

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
- ML Kit text recognition and image labeling (bundled variants)
- ONNX Runtime with MobileCLIP2-B INT8 image and text encoders

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
    chat/             On-device assistant, opened as a modal from the side menu
    collections/      Categories screen and collection membership
    home/             Home dashboard
    library/          Full library browser, grid/list layouts
    screenshots/      Indexing, metadata repository, viewer, and the native bridge
    search/           Search screen, filters, and the native search repository
    settings/         Privacy, index controls, folder scope, storage
    stats/            Index and storage figures
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

### Provision the on-device models

The two MobileCLIP2-B ONNX graphs and the CLIP tokenizer vocabulary are about 151 MB and are **not
tracked in git**, so a fresh clone does not have them. Without them the app builds and installs but
every image fails to index and every search errors, because `MobileClipModel` cannot open its assets.

Apple's MobileCLIP2-B checkpoint is gated: accept the terms at
[huggingface.co/apple/MobileCLIP2-B](https://huggingface.co/apple/MobileCLIP2-B) and download it.
Then:

```sh
pip install open_clip_torch onnxruntime torch
python tools/mobileclip/setup_assets.py --checkpoint /path/to/mobileclip2_b.pt
```

To check an existing checkout without needing the checkpoint or torch:

```sh
python tools/mobileclip/setup_assets.py --verify
```

`assets/mobileclip/model.json` stays in git and records the expected checkpoint hash, so the script
refuses a checkpoint that would produce different embeddings than the ones the app was verified
against. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full pipeline.

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

Release builds target `arm64-v8a` only. The app memory-maps ~151 MB of INT8 ONNX graphs, which is
fragile in a 32-bit address space and slow on armeabi-v7a CPUs, and x86/x86_64 are emulator-only.
For an x86_64 emulator, override the ABI for that invocation:

```sh
cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=x86_64
```

## Current data model

Every screen reads real local data; there is no mock or sample path left in the app.

- Screenshot metadata comes from the device. `src/features/screenshots/services/screenshotService.ts`
  syncs MediaStore through the native bridge into SQLite via
  `src/features/screenshots/data/sqliteScreenshotMetadataRepository.ts`.
- Recognized text, image labels, categories and ranking are produced on-device by the Kotlin
  pipeline and read back through `ScreenshotMediaStore`. Search, the assistant, categories and the
  stats figures are all served from that index.
- Original images are never copied. The index stores a MediaStore URI plus one 384px JPEG thumbnail
  per image under the app cache directory, pruned oldest-first past 96 MB. Lists render the
  thumbnail; only the viewer decodes the full-resolution original.

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

