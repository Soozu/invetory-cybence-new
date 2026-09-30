-- AlterTable
ALTER TABLE `SerialNumber` MODIFY `status` ENUM('AVAILABLE', 'MISSING', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED') NOT NULL DEFAULT 'AVAILABLE';

-- CreateTable
CREATE TABLE `StockCount` (
    `id` VARCHAR(191) NOT NULL,
    `countNumber` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StockCount_countNumber_key`(`countNumber`),
    INDEX `StockCount_warehouseId_status_createdAt_idx`(`warehouseId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockCountItem` (
    `id` VARCHAR(191) NOT NULL,
    `stockCountId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `expectedQuantity` INTEGER NOT NULL,
    `expectedReservedQuantity` INTEGER NOT NULL DEFAULT 0,
    `expectedStockUpdatedAt` DATETIME(3) NULL,
    `countedQuantity` INTEGER NULL,
    `variance` INTEGER NULL,
    `notes` TEXT NULL,
    `adjustmentId` VARCHAR(191) NULL,

    UNIQUE INDEX `StockCountItem_adjustmentId_key`(`adjustmentId`),
    INDEX `StockCountItem_productId_idx`(`productId`),
    UNIQUE INDEX `StockCountItem_stockCountId_productId_key`(`stockCountId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockCountSerial` (
    `id` VARCHAR(191) NOT NULL,
    `stockCountItemId` VARCHAR(191) NOT NULL,
    `serialNumber` VARCHAR(191) NOT NULL,
    `serialNumberId` VARCHAR(191) NULL,
    `expectedStatus` ENUM('AVAILABLE', 'MISSING', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED') NULL,
    `isExpected` BOOLEAN NOT NULL DEFAULT false,
    `isScanned` BOOLEAN NOT NULL DEFAULT false,

    INDEX `StockCountSerial_serialNumberId_idx`(`serialNumberId`),
    UNIQUE INDEX `StockCountSerial_stockCountItemId_serialNumber_key`(`stockCountItemId`, `serialNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockCount` ADD CONSTRAINT `StockCount_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockCount` ADD CONSTRAINT `StockCount_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockCount` ADD CONSTRAINT `StockCount_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockCountItem` ADD CONSTRAINT `StockCountItem_stockCountId_fkey` FOREIGN KEY (`stockCountId`) REFERENCES `StockCount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockCountItem` ADD CONSTRAINT `StockCountItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockCountItem` ADD CONSTRAINT `StockCountItem_adjustmentId_fkey` FOREIGN KEY (`adjustmentId`) REFERENCES `StockAdjustment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockCountSerial` ADD CONSTRAINT `StockCountSerial_stockCountItemId_fkey` FOREIGN KEY (`stockCountItemId`) REFERENCES `StockCountItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockCountSerial` ADD CONSTRAINT `StockCountSerial_serialNumberId_fkey` FOREIGN KEY (`serialNumberId`) REFERENCES `SerialNumber`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- New module permissions; preserve all existing role grants.
INSERT INTO `Permission` (`id`, `module`, `action`, `description`)
VALUES ('perm-stock-counts-view','stock_counts','VIEW','View physical stock counts'),
       ('perm-stock-counts-create','stock_counts','CREATE','Create physical stock counts'),
       ('perm-stock-counts-edit','stock_counts','EDIT','Count, submit and cancel physical stock counts'),
       ('perm-stock-counts-approve','stock_counts','APPROVE','Approve inventory corrections')
ON DUPLICATE KEY UPDATE `module` = VALUES(`module`);
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.`id`, p.`id` FROM `Role` r CROSS JOIN `Permission` p
WHERE p.`module`='stock_counts' AND
 (r.`name`='Inventory Manager' OR
 (r.`name`='Warehouse Staff' AND p.`action` IN ('VIEW','CREATE','EDIT')) OR
 (r.`name`='Viewer' AND p.`action`='VIEW'));
