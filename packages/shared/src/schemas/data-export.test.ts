import { describe, expect, it } from 'vitest';
import { DATA_EXPORT_FORMAT_VERSION, type DataExport, dataExportSchema } from './data-export';

const V1 = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const READING = 'r-1';
const FUEL_READING = 'r-2';
const SCHEDULE = 's-1';
const RECORD = 'm-1';
const ATTACHMENT = 'a-1';
const AT = '2026-11-02T10:00:00.000Z';

type Vehicle = DataExport['vehicles'][number];
type MaintenanceRecord = Vehicle['maintenanceRecords'][number];
type Attachment = MaintenanceRecord['attachments'][number];

const settings: DataExport['settings'] = {
  currency: 'EUR',
  distanceUnit: 'km',
  volumeUnit: 'l',
  locale: 'es',
  timezone: 'Europe/Madrid',
  odometerReminderWeekday: 0,
  reminderHour: 8,
};

const reading = (id = READING, value = 1000): Vehicle['odometerReadings'][number] => ({
  id,
  date: '2024-01-01',
  value,
  source: 'maintenance',
  createdAt: AT,
});

const schedule = (): Vehicle['maintenanceSchedules'][number] => ({
  id: SCHEDULE,
  title: 'Aceite',
  category: 'oil_change',
  intervalMonths: 12,
  intervalDistance: 15000,
  warnDays: 30,
  warnDistance: 1000,
  lastDoneDate: '2024-01-01',
  lastDoneOdometer: 1000,
  createdAt: AT,
  updatedAt: AT,
});

const attachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: ATTACHMENT,
  originalName: 'factura.pdf',
  mimeType: 'application/pdf',
  size: 1234,
  sha256: 'a'.repeat(64),
  path: `attachments/${ATTACHMENT}.pdf`,
  createdAt: AT,
  ...overrides,
});

const record = (overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord => ({
  id: RECORD,
  date: '2024-01-01',
  odometer: 1000,
  odometerReadingId: READING,
  category: 'oil_change',
  title: 'Cambio de aceite',
  description: null,
  workshop: null,
  cost: 89.9,
  includeInReport: true,
  scheduleId: SCHEDULE,
  createdAt: AT,
  updatedAt: AT,
  attachments: [attachment()],
  ...overrides,
});

const fuelLog = (overrides: Partial<Vehicle['fuelLogs'][number]> = {}): Vehicle['fuelLogs'][number] => ({
  id: 'f-1',
  date: '2024-02-01',
  odometer: 1500,
  odometerReadingId: FUEL_READING,
  quantity: 40.5,
  totalPrice: 60.75,
  pricePerUnit: 1.5,
  fullTank: true,
  missedPrevious: false,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
});

/** A valid vehicle with every kind of child. */
const vehicle = (overrides: Partial<Vehicle> = {}): Vehicle => ({
  id: V1,
  name: null,
  make: 'Seat',
  model: 'Ibiza',
  version: null,
  year: 2018,
  plate: '1234ABC',
  vin: null,
  type: 'car',
  fuelType: 'gasoline',
  purchaseDate: '2018-03-01',
  purchasePrice: 12000,
  purchaseOdometer: 0,
  notes: null,
  soldAt: null,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
  photoPath: `photos/${V1}.webp`,
  odometerReadings: [reading(), reading(FUEL_READING, 1500)],
  maintenanceSchedules: [schedule()],
  maintenanceRecords: [record()],
  fuelLogs: [fuelLog()],
  ...overrides,
});

/** A second, valid vehicle without children. */
const emptyVehicle = (id = V2): Vehicle =>
  vehicle({
    id,
    photoPath: null,
    odometerReadings: [],
    maintenanceSchedules: [],
    maintenanceRecords: [],
    fuelLogs: [],
  });

/** A valid document: one vehicle with every kind of child, one channel. */
const fixture = (vehicles: Vehicle[] = [vehicle()]): DataExport => ({
  formatVersion: DATA_EXPORT_FORMAT_VERSION,
  appVersion: '0.1.0',
  exportedAt: AT,
  settings,
  notificationChannels: [
    {
      type: 'ntfy',
      enabled: true,
      hasToken: true,
      config: { serverUrl: 'https://ntfy.sh', topic: 'ikrive' },
      createdAt: AT,
      updatedAt: AT,
    },
  ],
  vehicles,
});

/** The fixture with its only attachment replaced. */
const withAttachment = (overrides: Partial<Attachment>) =>
  fixture([vehicle({ maintenanceRecords: [record({ attachments: [attachment(overrides)] })] })]);

const rejects = (document: unknown) => expect(dataExportSchema.safeParse(document).success).toBe(false);

describe('dataExportSchema', () => {
  it('accepts a complete document', () => {
    const document = fixture([vehicle(), emptyVehicle()]);
    expect(dataExportSchema.parse(document)).toEqual(document);
    expect(withAttachment({ id: 'a-2', mimeType: 'image/png', path: 'attachments/a-2.png' })).toSatisfy(
      (value) => dataExportSchema.safeParse(value).success,
    );
  });

  it('rejects an unsupported formatVersion', () => {
    rejects({ ...fixture(), formatVersion: 2 });
    const { formatVersion: _formatVersion, ...withoutVersion } = fixture();
    rejects(withoutVersion);
  });

  it('rejects duplicate ids', () => {
    rejects(fixture([vehicle(), emptyVehicle(V1)]));
    rejects(fixture([vehicle({ odometerReadings: [reading(), reading(FUEL_READING), reading()] })]));
    // Ids are unique in the whole document, not only inside one vehicle.
    rejects(fixture([vehicle(), vehicle({ ...emptyVehicle(), maintenanceSchedules: [schedule()] })]));
    rejects(
      fixture([vehicle({ maintenanceRecords: [record({ attachments: [attachment(), attachment()] })] })]),
    );
    rejects(fixture([vehicle({ fuelLogs: [fuelLog(), fuelLog({ odometerReadingId: null })] })]));
  });

  it('rejects dangling scheduleId and odometerReadingId', () => {
    rejects(fixture([vehicle({ maintenanceRecords: [record({ scheduleId: 'missing' })] })]));
    rejects(fixture([vehicle({ fuelLogs: [fuelLog({ odometerReadingId: 'missing' })] })]));
    // The schedule and the reading exist, but in another vehicle.
    rejects(
      fixture([
        vehicle({ maintenanceSchedules: [], odometerReadings: [reading(FUEL_READING, 1500)] }),
        vehicle({ ...emptyVehicle(), maintenanceSchedules: [schedule()], odometerReadings: [reading()] }),
      ]),
    );
    // The same reading linked from a maintenance record and a fuel log.
    rejects(fixture([vehicle({ fuelLogs: [fuelLog({ odometerReadingId: READING })] })]));
  });

  it('rejects unsafe or mismatched file paths', () => {
    rejects(withAttachment({ path: '../x.pdf' }));
    rejects(withAttachment({ path: '/etc/passwd' }));
    rejects(withAttachment({ path: `attachments/../${ATTACHMENT}.pdf` }));
    rejects(withAttachment({ path: 'attachments/a-2.pdf' }));
    rejects(withAttachment({ mimeType: 'image/png' }));
    rejects(withAttachment({ id: '../x', path: 'attachments/../x.pdf' }));
    rejects(fixture([vehicle({ photoPath: `photos/${V2}.webp` })]));
    rejects(fixture([vehicle({ photoPath: '../photo.webp' })]));
  });

  it('strips a channel token', () => {
    const parsed = dataExportSchema.parse({
      ...fixture(),
      notificationChannels: [
        {
          type: 'gotify',
          enabled: true,
          hasToken: true,
          config: { serverUrl: 'https://gotify.example.com', token: 'secret-token' },
          createdAt: AT,
          updatedAt: AT,
        },
      ],
    });
    expect(parsed.notificationChannels[0]?.config).toEqual({ serverUrl: 'https://gotify.example.com' });
    expect(JSON.stringify(parsed)).not.toContain('secret-token');
  });
});
