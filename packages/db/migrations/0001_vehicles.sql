CREATE TABLE `odometer_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `odometer_readings_vehicle_id_date_idx` ON `odometer_readings` (`vehicle_id`,`date`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`version` text,
	`year` integer,
	`plate` text,
	`vin` text,
	`type` text DEFAULT 'car' NOT NULL,
	`fuel_type` text DEFAULT 'gasoline' NOT NULL,
	`purchase_date` text,
	`purchase_price` real,
	`purchase_odometer` integer,
	`notes` text,
	`photo` text,
	`sold_at` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vehicles_owner_id_idx` ON `vehicles` (`owner_id`);