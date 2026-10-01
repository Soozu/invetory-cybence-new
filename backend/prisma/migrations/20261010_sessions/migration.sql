ALTER TABLE `User`
  ADD COLUMN `authVersion` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `lockedUntil` DATETIME(3) NULL,
  ADD COLUMN `lastFailedLoginAt` DATETIME(3) NULL;
CREATE TABLE `Session` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `refreshTokenHash` CHAR(64) NOT NULL,
  `authVersion` INTEGER NOT NULL,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(512) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Session_refreshTokenHash_key` (`refreshTokenHash`),
  INDEX `Session_userId_revokedAt_expiresAt_idx` (`userId`, `revokedAt`, `expiresAt`),
  CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
