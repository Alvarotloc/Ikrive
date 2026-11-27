CREATE TABLE `vehicle_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`expiry_date` text,
	`warn_days` integer NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vehicle_documents_vehicle_id_idx` ON `vehicle_documents` (`vehicle_id`);