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

## On-device models

`android/app/src/main/assets/mobileclip/` holds the two MobileCLIP2-B INT8 ONNX graphs and the CLIP
BPE vocabulary — about 151 MB. The weights are **not** tracked in git; `model.json` and
`LICENSE_MODELS` are, so the expected checkpoint hash and the upstream licence stay in the repository
even though the binaries do not.

`tools/mobileclip/setup_assets.py` rebuilds the directory:

```sh
pip install open_clip_torch onnxruntime torch
python tools/mobileclip/setup_assets.py --checkpoint /path/to/mobileclip2_b.pt
```

The pipeline is: verify the checkpoint hash against `model.json` → export fp32 graphs with
`open_clip` → dynamic INT8 quantization → copy the BPE vocabulary out of the installed `open_clip`
→ refresh the manifest → verify. Nothing reaches the network; the gated checkpoint is downloaded by
hand from [huggingface.co/apple/MobileCLIP2-B](https://huggingface.co/apple/MobileCLIP2-B).

`--verify` alone needs neither torch nor the checkpoint, so it is the cheap pre-build gate:

```sh
python tools/mobileclip/setup_assets.py --verify
```

It checks the three files exist, that the vocabulary decompresses with at least the 48,894 merges
`ClipTokenizer` reads, and — when `onnxruntime` is installed — that each graph's input name and
shape and its `[1, 512]` output match what `MobileClipModel` binds.

Three constants are a contract across the Kotlin and Python sides. Changing one alone silently
degrades every embedding rather than failing:

- **Preprocessing range.** The graphs are exported with `image_mean=(0,0,0)`, `image_std=(1,1,1)`
  because `MobileClipModel.preprocess` feeds planar RGB in 0..1 with no mean subtraction.
- **Merge count.** `MERGE_COUNT` in the script and `ClipTokenizer.MERGE_COUNT` must agree, or every
  token id shifts.
- **`embedding_version`.** `MobileClipModel.EMBEDDING_VERSION` and the manifest's field must agree.
  Raising it requeues every indexed row, which is how a new model rolls out.

## Release builds

Signing reads four properties, which belong in `~/.gradle/gradle.properties` rather than the
repository so the keystore password is never committed:

```properties
RECALL_STORE_FILE=/absolute/path/to/upload-keystore.jks
RECALL_STORE_PASSWORD=...
RECALL_KEY_ALIAS=upload
RECALL_KEY_PASSWORD=...
```

`app/build.gradle` defines `hasReleaseSigning` from the presence of `RECALL_STORE_FILE`. When the
properties are absent the release build signs with the debug key instead of failing, so a fresh
clone still assembles — but such an APK cannot be published. Confirm which key was used:

```
apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

R8 and resource shrinking are both on (`enableProguardInReleaseBuilds`). The keep rules in
`app/proguard-rules.pro` cover what R8 cannot see by static analysis: Nitro's JNI classes, Fresco's
`@DoNotStrip` members, the ML Kit model registry, and `RecallIndexWorker`'s
`(Context, WorkerParameters)` constructor, which WorkManager resolves by name. Anything added later
that is reached reflectively needs its own rule, and the failure only shows up in release.

`shrinkResources` is safe here because the RN CLI generates `res/raw/keep.xml`, pinning the icon
fonts and drawables that are only ever named from JS.

Keep `app/build/outputs/mapping/release/mapping.txt` for any distributed build — it is the only way
to read an obfuscated production stack trace.

Verify in this order; each gate catches a different class of failure:

```
python tools/mobileclip/setup_assets.py --verify
npx tsc --noEmit
cd android && ./gradlew :app:testDebugUnitTest
./gradlew :app:assembleRelease
```

The asset check goes first because a missing model is invisible to every other gate: the APK
assembles, installs and opens, then fails on the first image it tries to index.

Release builds target `arm64-v8a` only (`reactNativeArchitectures` in `android/gradle.properties`).
Shipping all four ABIs cost 118 MB of emulator-only x86 libraries and a 36 MB armeabi-v7a slice whose
CPUs cannot run MobileCLIP2-B at a usable speed; the release APK is ~210 MB rather than 383 MB. That
is still dominated by the 151 MB of `noCompress` ONNX graphs, so getting materially below it means
moving them into a Play Asset Delivery install-time pack rather than trimming ABIs further. For an
x86_64 emulator, override the ABI per invocation with
`-PreactNativeArchitectures=x86_64`.

Since R8 never runs in debug, install and exercise the release APK — indexing, search, delete —
before trusting it.

## Current limitations

- No JavaScript test suite. `npx tsc --noEmit` is the only static gate on the TypeScript side; the
  Kotlin pipeline is covered by `OfflinePipelineTest`, and the ONNX graphs and tokenizer by
  `MobileClipIntegrationTest`, which is an instrumented test and needs a connected device.
- No lint configuration is checked in, so `npx eslint` fails outright.
- Search ranks MobileCLIP embeddings together with recognized text and image labels. The stats screen
  reports index and storage counts, not measured inference timings.
- Android only in practice. `ios/` holds the stock RN scaffold, but the indexing pipeline, search,
  OCR and thumbnails are all Kotlin — there is no iOS implementation of `ScreenshotMediaStore`.

