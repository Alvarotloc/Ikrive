CREATE TABLE `maintenance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`date` text NOT NULL,
	`odometer` integer,
	`odometer_reading_id` text,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`workshop` text,
	`cost` real,
	`include_in_report` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`odometer_reading_id`) REFERENCES `odometer_readings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `maintenance_records_vehicle_id_date_idx` ON `maintenance_records` (`vehicle_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_records_odometer_reading_id_idx` ON `maintenance_records` (`odometer_reading_id`);