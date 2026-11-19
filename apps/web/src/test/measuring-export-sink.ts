import type { OpenExportSink } from '@/lib/data-source/local/export-sink';
import type { DeviceFile } from '@/lib/data-source/types';

export type MeasuringSinkEvent = 'open' | 'write' | 'close' | 'abort';

/** A target of the local export that keeps what it gets «on disk» and counts it. */
export interface MeasuringExportSink {
  open: OpenExportSink;
  /** Every byte written so far, in order: the zip «on disk». */
  written(): Uint8Array;
  /** Bytes written so far (they are on disk: they no longer count as memory). */
  readonly received: number;
  /** Whether the export discarded its target. */
  readonly aborted: boolean;
  /** Calls in order. */
  events: MeasuringSinkEvent[];
  /** Called when a piece is handed over, before it lands: the moment the export holds the most. */
  onWrite: (() => void) | null;
  /** Writes reject from now on, to simulate a full disk. */
  failWrites: boolean;
}

/**
 * The device target of the export in the tests. Each `write` lands on a later macrotask, so an export
 * that did not wait for its writes would run ahead (and hold more) than one that does.
 */
export function createMeasuringExportSink(): MeasuringExportSink {
  let disk: Uint8Array[] = [];
  let received = 0;
  let aborted = false;
  const sink: MeasuringExportSink = {
    events: [],
    onWrite: null,
    failWrites: false,
    get received() {
      return received;
    },
    get aborted() {
      return aborted;
    },
    written() {
      const out = new Uint8Array(disk.reduce((total, chunk) => total + chunk.length, 0));
      let offset = 0;
      for (const chunk of disk) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
      return out;
    },
    async open(fileName) {
      sink.events.push('open');
      disk = [];
      received = 0;
      aborted = false;
      return {
        async write(chunk) {
          sink.events.push('write');
          sink.onWrite?.();
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (sink.failWrites) throw new Error('No space left on device');
          disk.push(chunk.slice());
          received += chunk.length;
        },
        async close(): Promise<DeviceFile> {
          sink.events.push('close');
          return { fileName, uri: `file:///cache/exports/${fileName}`, path: `exports/${fileName}` };
        },
        async abort() {
          sink.events.push('abort');
          aborted = true;
          disk = [];
        },
      };
    },
  };
  return sink;
}
