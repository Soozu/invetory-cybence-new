-- AlterTable
ALTER TABLE `WarehouseStock` ADD COLUMN `defectiveQuantity` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `forRepairQuantity` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `quarantineQuantity` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `returnPendingQuantity` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `SerialNumber` MODIFY `status` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING', 'QUARANTINE') NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE `StockMovement` MODIFY `type` ENUM('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'PURCHASE_RECEIVING', 'RETURN', 'DAMAGE', 'CORRECTION', 'OPENING_STOCK', 'ASSET_ASSIGNMENT', 'ASSET_RETURN', 'RESERVATION_CREATED', 'RESERVATION_RELEASED', 'RESERVATION_EXPIRED', 'SUPPLIER_RETURN', 'RETURN_HOLD', 'RETURN_RELEASE', 'CONDITION_CHANGED') NOT NULL;

-- AlterTable
ALTER TABLE `SupplierReturnItem` ADD COLUMN `stockCondition` ENUM('AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR') NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE `SupplierReturnSerial` MODIFY `previousStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING', 'QUARANTINE') NOT NULL;

-- AlterTable
ALTER TABLE `StockCountSerial` MODIFY `expectedStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING', 'QUARANTINE') NULL;

-- AlterTable
ALTER TABLE `SerialEvent` MODIFY `fromStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING', 'QUARANTINE') NULL,
    MODIFY `toStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING', 'QUARANTINE') NULL;

-- CreateTable
CREATE TABLE `StockConditionChange` (
    `id` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fromCondition` ENUM('AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR') NOT NULL,
    `toCondition` ENUM('AVAILABLE', 'QUARANTINE', 'DEFECTIVE', 'FOR_REPAIR') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `beforeBalances` JSON NOT NULL,
    `afterBalances` JSON NOT NULL,
    `stockMovementId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StockConditionChange_referenceNumber_key`(`referenceNumber`),
    UNIQUE INDEX `StockConditionChange_stockMovementId_key`(`stockMovementId`),
    INDEX `StockConditionChange_warehouseId_createdAt_idx`(`warehouseId`, `createdAt`),
    INDEX `StockConditionChange_productId_createdAt_idx`(`productId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockConditionSerial` (
    `conditionChangeId` VARCHAR(191) NOT NULL,
    `serialNumberId` VARCHAR(191) NOT NULL,

    INDEX `StockConditionSerial_serialNumberId_idx`(`serialNumberId`),
    PRIMARY KEY (`conditionChangeId`, `serialNumberId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockConditionChange` ADD CONSTRAINT `StockConditionChange_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockConditionChange` ADD CONSTRAINT `StockConditionChange_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockConditionChange` ADD CONSTRAINT `StockConditionChange_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockConditionChange` ADD CONSTRAINT `StockConditionChange_stockMovementId_fkey` FOREIGN KEY (`stockMovementId`) REFERENCES `StockMovement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockConditionSerial` ADD CONSTRAINT `StockConditionSerial_conditionChangeId_fkey` FOREIGN KEY (`conditionChangeId`) REFERENCES `StockConditionChange`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockConditionSerial` ADD CONSTRAINT `StockConditionSerial_serialNumberId_fkey` FOREIGN KEY (`serialNumberId`) REFERENCES `SerialNumber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Classify only holds with known provenance. Preserve all existing physical and
-- aggregate unavailable quantities, including unclassified legacy reservations.
UPDATE `WarehouseStock` ws
LEFT JOIN (
    SELECT productId, warehouseId,
        SUM(status = 'DEFECTIVE') AS defective,
        SUM(status = 'FOR_REPAIR') AS repair,
        SUM(status = 'RETURN_PENDING') AS pending
    FROM `SerialNumber` WHERE warehouseId IS NOT NULL
    GROUP BY productId, warehouseId
) sn ON sn.productId = ws.productId AND sn.warehouseId = ws.warehouseId
LEFT JOIN (
    SELECT i.productId, r.warehouseId, SUM(i.quantity) AS pending
    FROM `SupplierReturnItem` i
    JOIN `SupplierReturn` r ON r.id = i.supplierReturnId
    JOIN `Product` p ON p.id = i.productId
    WHERE r.status IN ('PENDING', 'APPROVED') AND p.trackSerialNumbers = 0
    GROUP BY i.productId, r.warehouseId
) rtv ON rtv.productId = ws.productId AND rtv.warehouseId = ws.warehouseId
SET ws.defectiveQuantity = COALESCE(sn.defective, 0),
    ws.forRepairQuantity = COALESCE(sn.repair, 0),
    ws.returnPendingQuantity = COALESCE(sn.pending, 0) + COALESCE(rtv.pending, 0);

-- Fail on inconsistent legacy holds instead of silently changing quantities.
ALTER TABLE `WarehouseStock` ADD CONSTRAINT `WarehouseStock_condition_balances_check`
CHECK (quantity >= 0 AND reservedQuantity >= 0 AND reservedQuantity <= quantity
    AND quarantineQuantity >= 0 AND defectiveQuantity >= 0
    AND forRepairQuantity >= 0 AND returnPendingQuantity >= 0
    AND quarantineQuantity + defectiveQuantity + forRepairQuantity + returnPendingQuantity <= reservedQuantity);

