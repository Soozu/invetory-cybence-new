ALTER TABLE `Session` MODIFY COLUMN `refreshTokenHash` CHAR(64) NULL;
ALTER TABLE `Notification` ADD COLUMN `archivedAt` DATETIME(3) NULL;
ALTER TABLE `ActivityLog` ADD COLUMN `archivedAt` DATETIME(3) NULL;
CREATE INDEX `Session_expiresAt_revokedAt_idx` ON `Session` (`expiresAt`,`revokedAt`);
CREATE INDEX `Notification_archivedAt_isRead_createdAt_idx` ON `Notification` (`archivedAt`,`isRead`,`createdAt`);
CREATE INDEX `ActivityLog_archivedAt_createdAt_idx` ON `ActivityLog` (`archivedAt`,`createdAt`);
CREATE TABLE `BackupRun` (
 `id` CHAR(36) NOT NULL, `status` VARCHAR(20) NOT NULL,
 `databaseStatus` VARCHAR(20) NOT NULL, `uploadsStatus` VARCHAR(20) NOT NULL,
 `databaseBytes` BIGINT NOT NULL DEFAULT 0, `uploadsBytes` BIGINT NOT NULL DEFAULT 0,
 `fileCount` INTEGER NOT NULL DEFAULT 0, `schemaName` VARCHAR(64) NOT NULL,
 `manifestHash` CHAR(64) NULL, `errorSummary` VARCHAR(200) NULL,
 `requestedById` VARCHAR(191) NULL, `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `completedAt` DATETIME(3) NULL, `retainedUntil` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), INDEX `BackupRun_startedAt_idx` (`startedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `RestorePlan` (
 `id` CHAR(36) NOT NULL, `backupId` CHAR(36) NOT NULL,
 `targetSchema` VARCHAR(64) NOT NULL, `requestedById` VARCHAR(191) NOT NULL,
 `manifestHash` CHAR(64) NOT NULL, `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `expiresAt` DATETIME(3) NOT NULL,
 `confirmedAt` DATETIME(3) NULL, `completedAt` DATETIME(3) NULL,
 PRIMARY KEY (`id`), INDEX `RestorePlan_requestedById_createdAt_idx` (`requestedById`,`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `RetentionPolicy` (
 `id` VARCHAR(191) NOT NULL DEFAULT 'default', `revision` INTEGER NOT NULL DEFAULT 1,
 `notificationDays` INTEGER NOT NULL DEFAULT 365, `activityDays` INTEGER NOT NULL DEFAULT 730,
 `backupDays` INTEGER NOT NULL DEFAULT 30, `sessionDays` INTEGER NOT NULL DEFAULT 30,
 `archiveEnabled` BOOLEAN NOT NULL DEFAULT false, `updatedById` VARCHAR(191) NULL,
 `updatedAt` DATETIME(3) NOT NULL, PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `JobLease` (
 `name` VARCHAR(191) NOT NULL, `owner` CHAR(36) NULL, `leaseUntil` DATETIME(3) NULL,
 `lastRunAt` DATETIME(3) NULL, `lastSuccessAt` DATETIME(3) NULL, `lastError` VARCHAR(200) NULL,
 PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `ReportSchedule` (
 `id` VARCHAR(191) NOT NULL, `savedReportId` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
 `intervalDays` INTEGER NOT NULL, `nextRunAt` DATETIME(3) NOT NULL,
 `enabled` BOOLEAN NOT NULL DEFAULT true, `revision` INTEGER NOT NULL DEFAULT 1,
 `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`), INDEX `ReportSchedule_enabled_nextRunAt_idx` (`enabled`,`nextRunAt`),
 INDEX `ReportSchedule_userId_createdAt_idx` (`userId`,`createdAt`),
 CONSTRAINT `ReportSchedule_savedReportId_fkey` FOREIGN KEY (`savedReportId`) REFERENCES `SavedReport` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `ScheduledReportRun` (
 `id` VARCHAR(191) NOT NULL, `scheduleId` VARCHAR(191) NOT NULL, `occurrence` DATETIME(3) NOT NULL,
 `status` VARCHAR(20) NOT NULL, `result` JSON NULL, `errorSummary` VARCHAR(200) NULL,
 `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
 UNIQUE INDEX `ScheduledReportRun_scheduleId_occurrence_key` (`scheduleId`,`occurrence`),
 CONSTRAINT `ScheduledReportRun_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `ReportSchedule` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
