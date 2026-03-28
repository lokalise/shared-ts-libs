CREATE TABLE `users` (
	`id` int AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(255) NOT NULL,
	`project_id` int,
	CONSTRAINT `users_project_id_projects_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`)
);
