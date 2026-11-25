CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`date` text NOT NULL,
	`category` text NOT NULL,
	`title` text,
	`description` text,
	`cost` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `expenses_vehicle_id_date_idx` ON `expenses` (`vehicle_id`,`date`);