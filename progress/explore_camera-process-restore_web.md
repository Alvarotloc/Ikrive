## Web camera capture flow (Ikrive)

Paths relative to `apps/web/src`.

### 1. Camera capture
- One shared component opens the camera: `components/camera-capture-button.tsx`. `CameraCaptureButton` (l.27) renders a hidden `<input type="file" accept="image/*" capture="environment">` (l.56-60). `onChange` takes `files[0]`, clears `value`, calls `onFile(file)`.
  - A hand-added `cancel` listener (l.38-53), native only, dynamically imports `@/lib/native-camera` and calls `isCameraGranted()`; if false, `toast.error(t('camera.denied'))`.
- The button only shows when `useCanCapture()` is true (`lib/use-can-capture.ts:14`): `(pointer: coarse)` or `isNativeApp()`.
- **Vehicle photo:** `features/vehicles/photo-picker.tsx`, `PhotoPicker`. Gallery input (l.46) and `CameraCaptureButton` (l.67); both call `onFile` → `upload.mutateAsync(file)` → sonner toast.
  - Used only in `routes/_app/vehicles/$vehicleId/edit.tsx:28`.
  - Save path: `useUploadVehiclePhoto` (`features/vehicles/queries.ts:43`) → `dataSource().vehicles.setPhoto`.
- **Maintenance invoices:** `features/maintenance/attachment-picker.tsx`, `AttachmentPicker`. `multiple` file input (l.37) and `CameraCaptureButton` (l.64) as `onFiles([file])`. Used in:
  - **Create form:** `features/maintenance/maintenance-form.tsx:188`. Files held in memory in `pending` state (l.80), uploaded after the record is created (l.126-133, `uploadFiles`).
  - **Existing record dialog:** `features/maintenance/maintenance-attachments.tsx:71-89`. Uploaded immediately.
  - Both via `useAttachmentUpload` (`features/maintenance/use-attachment-upload.ts`) → `useUploadAttachment` (`features/maintenance/queries.ts:50`) → `dataSource().attachments.upload`.
- **Server vs local mode:** `dataSource()` / `setDataSource` in `lib/data-source/index.ts`. Local source installed in `features/mobile/local-mode.ts:52`. `isLocalMode()` in `lib/app-mode.ts:10` (native + `localStorage['ikrive.mode']==='local'`).
  - Server: `lib/data-source/http.ts:62` → `PUT /vehicles/:id/photo`.
  - Local photo: `lib/data-source/local/vehicles.ts:153` recodes to WebP, `files.save`.
  - Local invoice: `lib/data-source/local/attachments.ts:101` detects type, hashes, `files.save`, SQLite row.
  - Local files written by `lib/native-storage.ts` (`@capacitor/filesystem`, `Directory.Data`).

### 2. Camera photo cleanup (#79)
- No `specs/camera-photo-cleanup/` (`"sdd": false`); description/acceptance in `feature_list.json:1328-1341`.
- `features/mobile/camera-photo-cleanup.ts:12` (`cleanUpCameraPhotos`): returns early if `!isNativeApp()`, records `startedAt = Date.now()`, dynamically imports `lib/native-camera.ts`, calls `removeCameraPhotos(startedAt)`, swallows errors.
  - Runs once at startup: `main.tsx:31` (`void cleanUpCameraPhotos()`), both modes. Never on resume.
- `lib/native-camera.ts:49` (`removeCameraPhotos`): lists `Pictures` under `Directory.External` (`Android/data/<pkg>/files/Pictures`, where `BridgeWebChromeClient` writes); deletes files matching `/^JPEG_\d{8}_\d{6}_\d+\.jpg$/` (l.38) with `mtime > 0` and before `startedAt` (rounded down to the second); `Promise.allSettled`; returns count.
- Same file: `isCameraGranted()` via custom plugin `registerPlugin('CameraPermission')` (Java: `apps/mobile/android/app/src/main/java/com/ikrive/app/CameraPermissionPlugin.java`).
- **Conflict with #81:** after process death the cleanup deletes the photo on next start. `@capacitor/camera` is not installed in web or mobile `package.json`.

### 3. Native detection and toasts
- No `Capacitor.isNativePlatform`. Build flag: `lib/platform.ts:6`, `isNativeApp = () => import.meta.env.MODE === 'native'`.
- Native modules loaded only through `import()`; enforced by `features/pwa/native-only.test.ts` (checks `native-camera.ts` at l.122).
- `onAppResume` in `lib/native-app-state.ts` wraps `@capacitor/app` `resume`.
- Toasts: **sonner**, `<Toaster>` in `routes/__root.tsx:21`; `toast(...)`, `toast.success(...)`, `toast.error(t('key'))` (e.g. `maintenance-form.tsx:132`).

### 4. Tests (vitest + Testing Library)
- Setup `test/setup.ts`; helpers in `@/test/render`: `renderWithProviders`, `mockApi`, `mockMediaQuery`, `setServerMode`.
- Native mode: `vi.stubEnv('MODE', 'native')`.
- Plugins mocked with `vi.hoisted` + `vi.mock`: `lib/native-camera.test.ts:4-15` (`@capacitor/core` registerPlugin, `@capacitor/filesystem`), `lib/native-back-button.test.ts:8` and `lib/native-app-state.test.ts:5` (`@capacitor/app`), `lib/native-sqlite.test.ts:20`.
- Higher level tests mock the wrapper module: `features/mobile/camera-photo-cleanup.test.ts:5` (fake timers), `features/vehicles/photo-picker.test.tsx:10` (native cases l.141-167).
- `features/maintenance/maintenance-form.test.tsx:334`: invoice photo taken with the camera after creating the record.

### 5. State lost on reload
- TanStack Router, file routes.
- Maintenance form is not a route. `MaintenanceFormDialog` opened from `features/maintenance/maintenance-timeline.tsx`, which holds `formOpen`, `editing`, `attachmentsFor`, `attachmentsOpen` in `useState` (l.41-45, render l.108).
- Form: react-hook-form `useForm` with `defaultValues: defaultsFrom(record)` (`maintenance-form.tsx:83-86`), mounted only while open (l.48). Unsaved fields and `pending` invoices (l.80) are memory-only → process death loses dialog, fields and pending invoices.
- Re-injection points:
  - Invoices: reopen dialog via timeline state, then `setPending` / `acceptFiles`; existing record → `MaintenanceAttachments.onFiles`.
  - Vehicle photo: `PhotoPicker.onFile`. `/vehicles/$vehicleId/edit` survives reload via URL, but unsaved vehicle form edits do not.
- No URL search-param state for either dialog.
