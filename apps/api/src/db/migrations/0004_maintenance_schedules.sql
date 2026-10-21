CREATE TABLE `maintenance_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`interval_months` integer,
	`interval_distance` integer,
	`warn_days` integer NOT NULL,
	`warn_distance` integer NOT NULL,
	`last_done_date` text NOT NULL,
	`last_done_odometer` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `maintenance_schedules_vehicle_id_idx` ON `maintenance_schedules` (`vehicle_id`);--> statement-breakpoint
-- `ON DELETE set null` added by hand: drizzle-kit 0.31 omits the FK action on ADD COLUMN (schema and snapshot already declare set null).
ALTER TABLE `maintenance_records` ADD `schedule_id` text REFERENCES maintenance_schedules(id) ON DELETE set null;