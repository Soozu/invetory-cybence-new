ALTER TABLE `ActivityLog` ADD COLUMN `changes` JSON NULL;
CREATE TABLE `UserPreference` (
  `userId` VARCHAR(191) NOT NULL,
  `notifications` JSON NOT NULL,
  `dashboard` JSON NOT NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`userId`),
  CONSTRAINT `UserPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `SavedReport` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `reportType` VARCHAR(191) NOT NULL,
  `filters` JSON NOT NULL,
  `columns` JSON NOT NULL,
  `sortBy` VARCHAR(191) NOT NULL,
  `sortOrder` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL DEFAULT 1,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `SavedReport_userId_archivedAt_updatedAt_idx` (`userId`, `archivedAt`, `updatedAt`),
  CONSTRAINT `SavedReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
