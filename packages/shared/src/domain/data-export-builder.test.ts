import { describe, expect, it } from 'vitest';
import { dataExportSchema } from '../schemas/data-export';
import { DEFAULT_USER_SETTINGS } from '../schemas/settings';
import { type BuildDataExportInput, buildDataExport, type DataExportInputRows } from './data-export-builder';

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 10, minute));
const SHA = 'a'.repeat(64);

const vehicle = (id: string, photo: string | null) => ({
  id,
  ownerId: 'owner-1',
  name: null,
  make: 'Seat',
  model: id,
  version: null,
  year: 2020,
  plate: null,
  vin: null,
  type: 'car' as const,
  fuelType: 'gasoline' as const,
  purchaseDate: null,
  purchasePrice: null,
  purchaseOdometer: null,
  notes: null,
  photo,
  soldAt: null,
  archivedAt: null,
  createdAt: at(0),
  updatedAt: at(1),
});

const reading = (id: string, vehicleId: string, value: number) => ({
  id,
  vehicleId,
  date: '2026-01-01',
  value,
  source: 'manual' as const,
  createdAt: at(2),
});

const record = (id: string, vehicleId: string, odometerReadingId: string | null = null) => ({
  id,
  vehicleId,
  date: '2026-01-02',
  odometer: null,
  odometerReadingId,
  category: 'oil_change' as const,
  title: id,
  description: null,
  workshop: null,
  cost: 50,
  includeInReport: true,
  scheduleId: null,
  createdAt: at(3),
  updatedAt: at(3),
});

const attachment = (id: string, entityId: string) => ({
  id,
  ownerId: 'owner-1',
  entityType: 'maintenance' as const,
  entityId,
  originalName: `${id}.pdf`,
  mimeType: 'application/pdf' as const,
  size: 10,
  sha256: SHA,
  storageKey: `attachments/key-${id}.pdf`,
  createdAt: at(4),
});

function rows(): DataExportInputRows {
  return {
    vehicles: [vehicle('v1', 'photos/key-v1.webp'), vehicle('v2', null)],
    odometerReadings: [reading('r2', 'v1', 200), reading('r1', 'v1', 100), reading('r3', 'v2', 50)],
    maintenanceSchedules: [
      {
        id: 's1',
        vehicleId: 'v1',
        title: 'Oil',
        category: 'oil_change',
        intervalMonths: 12,
        intervalDistance: null,
        warnDays: 30,
        warnDistance: 1000,
        lastDoneDate: '2025-06-01',
        lastDoneOdometer: null,
        createdAt: at(5),
        updatedAt: at(5),
      },
    ],
    maintenanceRecords: [record('m2', 'v1', 'r2'), record('m1', 'v1'), record('m3', 'v2')],
    fuelLogs: [
      {
        id: 'f1',
        vehicleId: 'v2',
        date: '2026-01-03',
        odometer: 50,
        odometerReadingId: 'r3',
        quantity: 40,
        totalPrice: 60,
        pricePerUnit: 1.5,
        fullTank: true,
        missedPrevious: false,
        createdAt: at(6),
        updatedAt: at(6),
      },
    ],
    attachments: [attachment('a2', 'm1'), attachment('a1', 'm1'), attachment('a3', 'm3')],
    notificationChannels: [
      {
        type: 'ntfy',
        enabled: true,
        config: { serverUrl: 'https://ntfy.sh', topic: 'cars', token: 'secret-token' },
        createdAt: at(7),
        updatedAt: at(7),
      },
      {
        type: 'webhook',
        enabled: false,
        config: { url: 'https://example.com/hook' },
        createdAt: at(8),
        updatedAt: at(8),
      },
    ],
  };
}

function input(overrides: Partial<BuildDataExportInput> = {}): BuildDataExportInput {
  return {
    rows: rows(),
    settings: DEFAULT_USER_SETTINGS,
    appVersion: '1.2.3',
    exportedAt: at(30),
    present: {
      attachmentIds: new Set(['a1', 'a2', 'a3']),
      photoVehicleIds: new Set(['v1']),
    },
    ...overrides,
  };
}

describe('buildDataExport', () => {
  it('builds a document that satisfies dataExportSchema', () => {
    const { document } = buildDataExport(input());
    expect(dataExportSchema.safeParse(document).success).toBe(true);
    expect(document).toMatchObject({
      formatVersion: 1,
      appVersion: '1.2.3',
      exportedAt: '2026-01-01T10:30:00.000Z',
      settings: DEFAULT_USER_SETTINGS,
    });
  });

  it('nests rows under their vehicle and record in input order', () => {
    const { document } = buildDataExport(input());
    const [v1, v2] = document.vehicles;
    expect(document.vehicles.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(v1?.odometerReadings.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(v2?.odometerReadings.map((r) => r.id)).toEqual(['r3']);
    expect(v1?.maintenanceSchedules.map((s) => s.id)).toEqual(['s1']);
    expect(v2?.maintenanceSchedules).toEqual([]);
    expect(v1?.maintenanceRecords.map((r) => r.id)).toEqual(['m2', 'm1']);
    expect(v1?.maintenanceRecords[1]?.attachments.map((a) => a.id)).toEqual(['a2', 'a1']);
    expect(v1?.maintenanceRecords[0]?.attachments).toEqual([]);
    expect(v2?.maintenanceRecords[0]?.attachments.map((a) => a.id)).toEqual(['a3']);
    expect(v1?.fuelLogs).toEqual([]);
    expect(v2?.fuelLogs.map((f) => f.id)).toEqual(['f1']);
    expect(v1?.createdAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('drops owner ids and storage keys', () => {
    const { document } = buildDataExport(input());
    const json = JSON.stringify(document);
    expect(json).not.toContain('owner-1');
    expect(json).not.toContain('ownerId');
    expect(json).not.toContain('storageKey');
    expect(json).not.toContain('key-');
    expect(json).not.toContain('vehicleId');
    expect(json).not.toContain('entityId');
  });

  it('skips attachments and photos whose file is missing', () => {
    const { document, files } = buildDataExport(
      input({ present: { attachmentIds: new Set(['a1']), photoVehicleIds: new Set() } }),
    );
    expect(document.vehicles[0]?.photoPath).toBeNull();
    expect(document.vehicles[0]?.maintenanceRecords[1]?.attachments.map((a) => a.id)).toEqual(['a1']);
    expect(document.vehicles[1]?.maintenanceRecords[0]?.attachments).toEqual([]);
    expect(files).toEqual([{ key: 'attachments/key-a1.pdf', path: 'attachments/a1.pdf' }]);
  });

  it('never includes a channel token', () => {
    const { document } = buildDataExport(input());
    expect(JSON.stringify(document)).not.toContain('secret-token');
    expect(document.notificationChannels).toEqual([
      {
        type: 'ntfy',
        enabled: true,
        hasToken: true,
        config: { serverUrl: 'https://ntfy.sh', topic: 'cars' },
        createdAt: '2026-01-01T10:07:00.000Z',
        updatedAt: '2026-01-01T10:07:00.000Z',
      },
      {
        type: 'webhook',
        enabled: false,
        hasToken: false,
        config: { url: 'https://example.com/hook' },
        createdAt: '2026-01-01T10:08:00.000Z',
        updatedAt: '2026-01-01T10:08:00.000Z',
      },
    ]);
  });

  it('lists the files to copy with their export paths', () => {
    const { document, files } = buildDataExport(input());
    expect(document.vehicles[0]?.photoPath).toBe('photos/v1.webp');
    expect(document.vehicles[1]?.photoPath).toBeNull();
    expect(document.vehicles[0]?.maintenanceRecords[1]?.attachments[0]?.path).toBe('attachments/a2.pdf');
    expect(files).toEqual([
      { key: 'photos/key-v1.webp', path: 'photos/v1.webp' },
      { key: 'attachments/key-a2.pdf', path: 'attachments/a2.pdf' },
      { key: 'attachments/key-a1.pdf', path: 'attachments/a1.pdf' },
      { key: 'attachments/key-a3.pdf', path: 'attachments/a3.pdf' },
    ]);
  });
});
