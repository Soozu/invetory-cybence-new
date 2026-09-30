-- AlterTable
ALTER TABLE `SerialNumber` ADD COLUMN `receiptId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SerialEvent` (
    `id` VARCHAR(191) NOT NULL,
    `serialNumberId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED') NULL,
    `toStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED') NULL,
    `warehouseId` VARCHAR(191) NULL,
    `relatedWarehouseId` VARCHAR(191) NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `referenceNumber` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `userId` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SerialEvent_serialNumberId_occurredAt_idx`(`serialNumberId`, `occurredAt`),
    INDEX `SerialEvent_warehouseId_occurredAt_idx`(`warehouseId`, `occurredAt`),
    INDEX `SerialEvent_relatedWarehouseId_occurredAt_idx`(`relatedWarehouseId`, `occurredAt`),
    INDEX `SerialEvent_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SerialNumber` ADD CONSTRAINT `SerialNumber_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `PurchaseReceipt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerialEvent` ADD CONSTRAINT `SerialEvent_serialNumberId_fkey` FOREIGN KEY (`serialNumberId`) REFERENCES `SerialNumber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerialEvent` ADD CONSTRAINT `SerialEvent_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerialEvent` ADD CONSTRAINT `SerialEvent_relatedWarehouseId_fkey` FOREIGN KEY (`relatedWarehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SerialEvent` ADD CONSTRAINT `SerialEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- This is a migration-time snapshot, not an invented receiving event.
-- Existing PO-item links do not identify which partial receipt contained a serial.
INSERT INTO `SerialEvent` (`id`, `serialNumberId`, `type`, `toStatus`, `warehouseId`, `notes`, `occurredAt`)
SELECT CONCAT('baseline-', sn.`id`), sn.`id`, 'HISTORY_STARTED', sn.`status`,
  COALESCE(sn.`warehouseId`, a.`warehouseId`),
  'History recording started. Earlier events without exact links are not reconstructed.', CURRENT_TIMESTAMP(3)
FROM `SerialNumber` sn LEFT JOIN `Asset` a ON a.`serialNumberId` = sn.`id`;

