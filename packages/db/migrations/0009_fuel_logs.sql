CREATE TABLE `fuel_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`date` text NOT NULL,
	`odometer` integer NOT NULL,
	`odometer_reading_id` text,
	`quantity` real NOT NULL,
	`total_price` real NOT NULL,
	`price_per_unit` real NOT NULL,
	`full_tank` integer DEFAULT true NOT NULL,
	`missed_previous` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`odometer_reading_id`) REFERENCES `odometer_readings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `fuel_logs_vehicle_id_date_idx` ON `fuel_logs` (`vehicle_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `fuel_logs_odometer_reading_id_idx` ON `fuel_logs` (`odometer_reading_id`);