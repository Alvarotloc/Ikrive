## Mobile app: Capacitor setup, camera flow and memory (Ikrive)

The mobile app is in `apps/mobile`. The web app is built with `--mode native` into `apps/web/dist-native`.

### 1. Capacitor and plugins
`apps/mobile/package.json:12-22` pins all versions exactly:
- Capacitor packages, all 8.6.0: `@capacitor/core`, `@capacitor/android`, and `@capacitor/cli` (devDependency).
- Official plugins:
  - **`@capacitor/app` 8.1.2 is already installed.** It is used only for `backButton` (`apps/web/src/lib/native-back-button.ts:13`) and `resume` (`apps/web/src/lib/native-app-state.ts:13`). Nothing listens for `appRestoredResult`.
  - `@capacitor/filesystem` 8.1.5, `@capacitor/local-notifications` 8.3.1, `@capacitor/share` 8.0.3.
- Community plugins: `@capacitor-community/sqlite` 8.1.1, `@capacitor-community/file-opener` 8.0.1, `@ebarooni/capacitor-calendar` 8.10.0.
- **`@capacitor/camera` is not installed.**

Config is in `apps/mobile/capacitor.config.json`: `webDir ../web/dist-native`, `androidScheme https`, `allowMixedContent true`.

How plugins get registered and synced:
- Run `pnpm --filter @ikrive/mobile build:web`, then `cap sync android` (`package.json:7-8`).
- Sync generates `android/app/src/main/assets/capacitor.plugins.json` and `android/app/capacitor.build.gradle:10-16`.
- The one local plugin is registered by hand in `MainActivity` (see section 2).

### 2. Android project
- **Native code:** `android/app/src/main/java/com/ikrive/app/MainActivity.java` extends `BridgeActivity` and calls `registerPlugin(CameraPermissionPlugin.class)` before `super.onCreate`. `CameraPermissionPlugin.java:13-14` is an empty plugin (`@CapacitorPlugin(name="CameraPermission")`) that only exposes `checkPermissions()` for CAMERA. It has no `onActivityResult` or saved-state handling. There are no other custom plugins.
- **`AndroidManifest.xml`:**
  - Activity: `launchMode="singleTask"` (l.21), with the usual long `configChanges` list (l.17).
  - **No `android:largeHeap`.**
  - FileProvider `${applicationId}.fileprovider` (l.31-39), backed by `res/xml/file_paths.xml` (`external-path .` and `cache-path .`).
  - Permissions: INTERNET, CAMERA (l.46), and SCHEDULE_EXACT_ALARM removed with `tools:node="remove"` (l.48).
  - `<queries>` for `IMAGE_CAPTURE` (l.51-55).
  - `usesCleartextTraffic="true"`, `allowBackup="true"`.
- **SDK levels** (`android/variables.gradle`): `minSdk` 24, `compileSdk` and `targetSdk` 36. `app/build.gradle:23` has `minifyEnabled false`.

### 3. File chooser / `<input capture>`
There is no custom WebChromeClient. The app relies on Capacitor's stock `BridgeWebChromeClient`, which writes each photo to `getExternalFilesDir(PICTURES)` as `JPEG_yyyyMMdd_HHmmss_*.jpg` (documented in `apps/web/src/lib/native-camera.ts:30-37`).
- `apps/web/src/components/camera-capture-button.tsx:56-71` renders a hidden `<input type=file accept=image/* capture=environment>`; lines 37-52 add a `cancel` listener that checks the permission.
- Used by `features/vehicles/photo-picker.tsx` and `features/maintenance/attachment-picker.tsx`.
- `removeCameraPhotos(startedAt)` (`native-camera.ts:49`, called from `features/mobile/camera-photo-cleanup.ts:17`) deletes photos left from earlier runs when the app starts.
  - **Risk:** after a process kill the JPEG is still in `Pictures/`, but this sweep may delete it before any recovery logic runs.

### 4. Docs
- `docs/mobile.md:63`: camera ("Hacer foto" button, permission-denied message, `Android/data/com.ikrive.app/files/Pictures` wiped on next start).
- `docs/mobile.md:107-113`: local build (`build:web`, `cap sync android`, `./gradlew assembleDebug`) and CI artifact `ikrive-debug-apk`.
- `docs/mobile.md:84-87` (Limitaciones conocidas) does not mention process death.
- No adb/logcat device-testing workflow is documented. `apps/mobile` has no README; `test/docs.test.mjs` checks the docs.

### 5. Likely memory contributors
- Bundle: `dist-native` 3.9 MB total (`sale-report-pdf-*.js` 1.6 MB, lazy; `_vehicleId-*.js` 474 KB; `index-*.js` 383 KB). Most of the ~427 MB RSS is probably the WebView/Chromium renderer itself.
- DB: native SQLite (`apps/web/src/lib/native-sqlite.ts:62-71`), not sql.js/WASM.
- Images: `apps/web/src/lib/data-source/local/canvas-images.ts:63-80` decodes full-res JPEG with `createImageBitmap`, canvas max 1600 px (photos) / 2000 (annexes), copies `Uint8Array`s. Other full-file copies: `local/files.ts:115`, `local/files-get.ts:58`, `native-storage.ts:44`. These are peaks after the photo, not while the camera is open. Before opening the camera only the app and unrevoked object URLs (`lib/api-files.ts:42`, `lib/download.ts:15,36`) are resident.
- Downloads and the sale report write whole blobs at once (`specs/mobile-local-export-streaming/design.md:127`); only the export is streamed.
