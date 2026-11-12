import {
  archivedAtAfterUpdate,
  type CreateOdometerReading,
  type CreateVehicle,
  canDeleteOdometerReading,
  initialOdometerReading,
  type OdometerReading,
  odometerConflictMessage,
  todayIn,
  type UpdateVehicle,
  type Vehicle,
  type VehicleListQuery,
  validateOdometerWrite,
  vehicleStatus,
} from '@ikrive/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { toWebpPhoto } from '../../lib/images';
import type { FileStorage } from '../../lib/storage';
import type { AttachmentsRepository } from '../attachments/repository';
import type { SettingsService } from '../settings/service';
import type { OdometerReadingRow, VehicleRow, VehiclesRepository } from './repository';

interface VehiclesServiceDeps {
  repo: VehiclesRepository;
  storage: FileStorage;
  settings: SettingsService;
  attachments: AttachmentsRepository;
}

const PHOTO_FOLDER = 'vehicles';

/** The photo key is random, so its file name doubles as a cache-busting version. */
const photoUrlOf = (row: VehicleRow) =>
  row.photo ? `/api/vehicles/${row.id}/photo?v=${row.photo.slice(-13, -5)}` : null;

const readingToDto = ({ createdAt, ...reading }: OdometerReadingRow): OdometerReading => ({
  ...reading,
  createdAt: createdAt.toISOString(),
});

export function createVehiclesService({ repo, storage, settings, attachments }: VehiclesServiceDeps) {
  const toDto = (row: VehicleRow): Vehicle => {
    const { ownerId: _ownerId, photo: _photo, archivedAt, createdAt, updatedAt, ...fields } = row;
    const latest = repo.latestReading(row.id);
    return {
      ...fields,
      archivedAt: archivedAt?.toISOString() ?? null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      status: vehicleStatus(row),
      photoUrl: photoUrlOf(row),
      odometer: latest ? { value: latest.value, date: latest.date } : null,
    };
  };

  /** Ownership check: other users' vehicles are reported as missing so their ids are not disclosed. */
  const requireOwned = (userId: string, id: string) => {
    const vehicle = repo.findOwned(userId, id);
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    return vehicle;
  };

  const today = (userId: string) => todayIn(settings.get(userId).timezone);

  return {
    list(userId: string, { status = 'active' }: VehicleListQuery): Vehicle[] {
      return repo.listByOwner(userId, status).map(toDto);
    },

    get(userId: string, id: string): Vehicle {
      return toDto(requireOwned(userId, id));
    },

    create(userId: string, input: CreateVehicle): Vehicle {
      const { currentOdometer, ...fields } = input;
      const firstReading = initialOdometerReading(currentOdometer, today(userId));
      return toDto(repo.create({ ...fields, ownerId: userId }, firstReading));
    },

    update(userId: string, id: string, input: UpdateVehicle): Vehicle {
      const current = requireOwned(userId, id);
      const { archived, ...changes } = input;
      const archivedAt = archivedAtAfterUpdate(current.archivedAt, archived, new Date());
      return toDto(repo.update(id, { ...changes, archivedAt }));
    },

    /** Deletes the vehicle with the attachments of its maintenance records: rows first, files afterwards. */
    async remove(userId: string, id: string) {
      const vehicle = requireOwned(userId, id);
      const files = attachments.listByVehicle(id).map((row) => row.storageKey);
      repo.delete(id);
      if (vehicle.photo) await storage.remove(vehicle.photo);
      for (const key of files) await storage.remove(key);
    },

    async setPhoto(userId: string, id: string, upload: Buffer): Promise<Vehicle> {
      const vehicle = requireOwned(userId, id);
      const key = await storage.save(PHOTO_FOLDER, await toWebpPhoto(upload), 'webp');
      const updated = repo.update(id, { photo: key });
      if (vehicle.photo) await storage.remove(vehicle.photo);
      return toDto(updated);
    },

    async removePhoto(userId: string, id: string): Promise<Vehicle> {
      const vehicle = requireOwned(userId, id);
      const updated = repo.update(id, { photo: null });
      if (vehicle.photo) await storage.remove(vehicle.photo);
      return toDto(updated);
    },

    openPhoto(userId: string, id: string) {
      const { photo } = requireOwned(userId, id);
      if (!photo) throw new NotFoundError('This vehicle has no photo');
      return storage.read(photo);
    },

    listReadings(userId: string, vehicleId: string): OdometerReading[] {
      requireOwned(userId, vehicleId);
      return repo.listReadings(vehicleId).map(readingToDto);
    },

    addReading(userId: string, vehicleId: string, reading: CreateOdometerReading): OdometerReading {
      requireOwned(userId, vehicleId);
      const error = validateOdometerWrite({
        readings: repo.listReadings(vehicleId),
        date: reading.date,
        odometer: reading.value,
        today: today(userId),
      });
      if (error?.kind === 'future_date') {
        throw new BadRequestError('The reading date cannot be in the future');
      }
      if (error?.kind === 'conflict') throw new ConflictError(odometerConflictMessage(error.conflict));
      return readingToDto(repo.createReading({ ...reading, vehicleId, source: 'manual' }));
    },

    removeReading(userId: string, vehicleId: string, readingId: string) {
      requireOwned(userId, vehicleId);
      const reading = repo.findReading(vehicleId, readingId);
      if (!reading) throw new NotFoundError('Reading not found');
      if (!canDeleteOdometerReading(reading)) {
        throw new ConflictError('This reading belongs to another record; edit or delete that record instead');
      }
      repo.deleteReading(readingId);
    },
  };
}

export type VehiclesService = ReturnType<typeof createVehiclesService>;
