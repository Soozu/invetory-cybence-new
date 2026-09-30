-- AlterTable
ALTER TABLE `Notification` ADD COLUMN `warehouseId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ActivityLog` ADD COLUMN `relatedWarehouseId` VARCHAR(191) NULL,
    ADD COLUMN `warehouseId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `UserWarehouse` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserWarehouse_warehouseId_idx`(`warehouseId`),
    UNIQUE INDEX `UserWarehouse_userId_warehouseId_key`(`userId`, `warehouseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Notification_warehouseId_idx` ON `Notification`(`warehouseId`);

-- CreateIndex
CREATE INDEX `ActivityLog_warehouseId_createdAt_idx` ON `ActivityLog`(`warehouseId`, `createdAt`);

-- CreateIndex
CREATE INDEX `ActivityLog_relatedWarehouseId_createdAt_idx` ON `ActivityLog`(`relatedWarehouseId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `UserWarehouse` ADD CONSTRAINT `UserWarehouse_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserWarehouse` ADD CONSTRAINT `UserWarehouse_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing single-warehouse grants. A null legacy warehouse never grants all warehouses.
INSERT INTO `UserWarehouse` (`id`, `userId`, `warehouseId`, `isDefault`)
SELECT CONCAT('uw_', UUID()), `id`, `warehouseId`, true FROM `User` WHERE `warehouseId` IS NOT NULL;

-- Backfill only historical scope that can be established through an exact relational reference.
UPDATE `ActivityLog` l JOIN `StockAdjustment` a ON l.`entityType` = 'StockAdjustment' AND l.`entityId` = a.`id`
SET l.`warehouseId` = a.`warehouseId`;
UPDATE `ActivityLog` l JOIN `StockTransfer` t ON l.`entityType` = 'StockTransfer' AND l.`entityId` = t.`id`
SET l.`warehouseId` = t.`sourceWarehouseId`, l.`relatedWarehouseId` = t.`destinationWarehouseId`;
UPDATE `ActivityLog` l JOIN `PurchaseOrder` p ON l.`entityType` = 'PurchaseOrder' AND l.`entityId` = p.`id`
SET l.`warehouseId` = p.`warehouseId`;
UPDATE `ActivityLog` l JOIN `PurchaseReceipt` r ON l.`entityType` = 'PurchaseReceipt' AND l.`entityId` = r.`id`
SET l.`warehouseId` = r.`warehouseId`;
UPDATE `ActivityLog` l JOIN `Asset` a ON l.`entityType` = 'Asset' AND l.`entityId` = a.`id`
SET l.`warehouseId` = a.`warehouseId`;
UPDATE `ActivityLog` l JOIN `AssetAssignment` aa ON l.`entityType` = 'AssetAssignment' AND l.`entityId` = aa.`id`
JOIN `Asset` a ON aa.`assetId` = a.`id` SET l.`warehouseId` = a.`warehouseId`;
UPDATE `ActivityLog` l JOIN `MaintenanceRecord` m ON l.`entityType` = 'MaintenanceRecord' AND l.`entityId` = m.`id`
JOIN `Asset` a ON m.`assetId` = a.`id` SET l.`warehouseId` = a.`warehouseId`;

UPDATE `Notification` n JOIN `PurchaseOrder` p ON n.`referenceType` = 'PurchaseOrder' AND n.`referenceId` = p.`id`
SET n.`warehouseId` = p.`warehouseId`;
UPDATE `Notification` n JOIN `StockTransfer` t ON n.`referenceType` = 'StockTransfer' AND n.`referenceId` = t.`id`
SET n.`warehouseId` = t.`sourceWarehouseId`;
