PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`distance_unit` text DEFAULT 'km' NOT NULL,
	`volume_unit` text DEFAULT 'l' NOT NULL,
	`locale` text DEFAULT 'es' NOT NULL,
	`timezone` text DEFAULT 'Europe/Madrid' NOT NULL,
	`odometer_reminder_weekday` integer DEFAULT 0,
	`reminder_hour` integer DEFAULT 8 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("user_id", "currency", "distance_unit", "volume_unit", "locale", "timezone", "odometer_reminder_weekday", "reminder_hour") SELECT "user_id", "currency", "distance_unit", "volume_unit", "locale", "timezone", "odometer_reminder_weekday", "reminder_hour" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;