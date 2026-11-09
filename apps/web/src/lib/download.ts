/** Saves `blob` as a file named `fileName` through a temporary `<a download>`. */
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Opens `blob` in a new tab (e.g. a PDF with the browser's viewer) through a temporary
 * `<a target="_blank">`, without a `window.opener`.
 */
export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // The new tab loads the URL after the click: keep it alive for a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
