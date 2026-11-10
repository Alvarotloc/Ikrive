// @vitest-environment jsdom
// The web path clicks a temporary `<a>`: it needs a DOM, unlike the rest of the pure-logic tests.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockObjectUrls } from '@/test/render';
import { downloadBlob, openBlob } from './download';

/** `loaded` turns true when `download.ts` imports `./native-files` for the first time. */
const native = vi.hoisted(() => ({ loaded: false, saveFile: vi.fn(), openFile: vi.fn() }));
vi.mock('./native-files', () => {
  native.loaded = true;
  return { saveFile: native.saveFile, openFile: native.openFile };
});

/** Captures the temporary links that are clicked, with their attributes at click time. */
function captureClicks() {
  const clicked: { href: string; download: string; target: string; rel: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({
      href: this.getAttribute('href') ?? '',
      download: this.download,
      target: this.target,
      rel: this.rel,
    });
  });
  return clicked;
}

const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  native.saveFile.mockReset();
  native.openFile.mockReset();
});

// The web tests go first: once loaded, the mocked module stays in the module cache.
describe('downloadBlob / openBlob on the web', () => {
  it('web: downloads through a temporary <a download> without loading the native module', async () => {
    const { createObjectURL } = mockObjectUrls();
    const clicked = captureClicks();

    await downloadBlob('invoice.pdf', pdf);

    expect(createObjectURL).toHaveBeenCalledWith(pdf);
    expect(clicked).toEqual([{ href: 'blob:1', download: 'invoice.pdf', target: '', rel: '' }]);
    expect(document.querySelector('a')).toBeNull();
    expect(native.loaded).toBe(false);
  });

  it('web: opens in a new tab without loading the native module', async () => {
    mockObjectUrls();
    const clicked = captureClicks();

    await openBlob(pdf, 'invoice.pdf');

    expect(clicked).toEqual([{ href: 'blob:1', download: '', target: '_blank', rel: 'noopener' }]);
    expect(document.querySelector('a')).toBeNull();
    expect(native.loaded).toBe(false);
  });
});

describe('downloadBlob / openBlob in the native app', () => {
  it('native: saves through native-files with the file name', async () => {
    vi.stubEnv('MODE', 'native');
    const clicked = captureClicks();
    native.saveFile.mockResolvedValue(undefined);

    await downloadBlob('invoice.pdf', pdf);

    expect(native.saveFile).toHaveBeenCalledExactlyOnceWith('invoice.pdf', pdf);
    expect(native.openFile).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it('native: opens through native-files with the file name', async () => {
    vi.stubEnv('MODE', 'native');
    const clicked = captureClicks();
    native.openFile.mockResolvedValue(undefined);

    await openBlob(pdf, 'invoice.pdf');

    expect(native.openFile).toHaveBeenCalledExactlyOnceWith('invoice.pdf', pdf);
    expect(native.saveFile).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it('native: rejects when the native module fails', async () => {
    vi.stubEnv('MODE', 'native');
    native.saveFile.mockRejectedValue(new Error('disk full'));
    native.openFile.mockRejectedValue(new Error('No app to open this file'));

    await expect(downloadBlob('invoice.pdf', pdf)).rejects.toThrow('disk full');
    await expect(openBlob(pdf, 'invoice.pdf')).rejects.toThrow('No app to open this file');
  });
});
