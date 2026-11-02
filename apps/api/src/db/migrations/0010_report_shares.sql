CREATE TABLE `report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`selector` text NOT NULL,
	`verifier_hash` text NOT NULL,
	`hide_prices` integer DEFAULT false NOT NULL,
	`hide_plate` integer DEFAULT false NOT NULL,
	`hide_vin` integer DEFAULT false NOT NULL,
	`include_invoices` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_shares_selector_idx` ON `report_shares` (`selector`);--> statement-breakpoint
CREATE INDEX `report_shares_vehicle_id_idx` ON `report_shares` (`vehicle_id`);