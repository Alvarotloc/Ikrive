CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`vehicle_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`dedupe_key` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_id_created_at_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_key_idx` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_vehicle_id_idx` ON `notifications` (`vehicle_id`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `reminder_hour` integer DEFAULT 8 NOT NULL;