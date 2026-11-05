CREATE TABLE `coop_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room` text NOT NULL,
	`nonce` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coop_command_nonce` ON `coop_commands` (`room`,`nonce`);--> statement-breakpoint
CREATE INDEX `coop_command_room` ON `coop_commands` (`room`,`id`);--> statement-breakpoint
CREATE TABLE `coop_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_hash` text NOT NULL,
	`host_name` text NOT NULL,
	`guest_hash` text,
	`guest_name` text,
	`snapshot` text NOT NULL,
	`host_seen` integer NOT NULL,
	`guest_seen` integer DEFAULT 0 NOT NULL,
	`ack` integer DEFAULT 0 NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
