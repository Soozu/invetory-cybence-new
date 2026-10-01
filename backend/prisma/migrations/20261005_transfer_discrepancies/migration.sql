-- AlterTable
ALTER TABLE `StockTransfer` ADD COLUMN `arrivalClosedAt` DATETIME(3) NULL,
    MODIFY `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED', 'PARTIAL', 'DISCREPANCY', 'RESOLVED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `StockTransferItem` ADD COLUMN `lostQuantity` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `returnedQuantity` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `StockTransferSerial` ADD COLUMN `outcome` VARCHAR(191) NOT NULL DEFAULT 'IN_TRANSIT';

-- Existing completed transfers retain their shipped identities and balances.
-- No historical arrival documents or stock movements are invented.
UPDATE `StockTransferSerial` s JOIN `StockTransferItem` i ON i.id=s.transferItemId
JOIN `StockTransfer` t ON t.id=i.transferId SET s.outcome='RECEIVED' WHERE t.status='RECEIVED';

ALTER TABLE `StockTransferItem` ADD CONSTRAINT `transfer_item_accounting_check`
CHECK (`quantity`>0 AND `receivedQuantity`>=0 AND `lostQuantity`>=0 AND `returnedQuantity`>=0
AND `receivedQuantity`+`lostQuantity`+`returnedQuantity`<=`quantity`);
ALTER TABLE `StockTransferSerial` ADD CONSTRAINT `transfer_serial_outcome_check`
CHECK (`outcome` IN ('IN_TRANSIT','RECEIVED','LOST','RETURNED'));

-- CreateTable
CREATE TABLE `TransferArrival` (
    `id` VARCHAR(191) NOT NULL,
    `referenceNumber` VARCHAR(191) NOT NULL,
    `transferId` VARCHAR(191) NOT NULL,
    `receivedById` VARCHAR(191) NOT NULL,
    `finalArrival` BOOLEAN NOT NULL DEFAULT false,
    `lines` JSON NOT NULL,
    `notes` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TransferArrival_referenceNumber_key`(`referenceNumber`),
    INDEX `TransferArrival_transferId_createdAt_idx`(`transferId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransferDiscrepancy` (
    `id` VARCHAR(191) NOT NULL,
    `transferId` VARCHAR(191) NOT NULL,
    `transferItemId` VARCHAR(191) NOT NULL,
    `arrivalId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `resolvedQuantity` INTEGER NOT NULL DEFAULT 0,
    `serialNumberId` VARCHAR(191) NULL,
    `observedSerial` VARCHAR(191) NULL,
    `notes` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TransferDiscrepancy_transferId_createdAt_idx`(`transferId`, `createdAt`),
    INDEX `TransferDiscrepancy_serialNumberId_idx`(`serialNumberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransferDiscrepancyResolution` (
    `id` VARCHAR(191) NOT NULL,
    `discrepancyId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `notes` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `stockMovementId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TransferDiscrepancyResolution_discrepancyId_createdAt_idx`(`discrepancyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TransferDiscrepancy` ADD CONSTRAINT `transfer_discrepancy_quantity_check`
CHECK (`quantity`>0 AND `resolvedQuantity`>=0 AND `resolvedQuantity`<=`quantity`
AND `kind` IN ('MISSING','DAMAGED','UNEXPECTED'));
ALTER TABLE `TransferDiscrepancyResolution` ADD CONSTRAINT `transfer_resolution_quantity_check`
CHECK ((`action`='INVESTIGATE' AND `quantity`=0) OR (`quantity`>0 AND `action` IN
('RECEIVE_LATE','MARK_LOST','RETURN_TO_SOURCE','ACKNOWLEDGE_QUARANTINE','RETURN_UNEXPECTED','DOCUMENT_DISPOSITION')));

-- AddForeignKey
ALTER TABLE `TransferArrival` ADD CONSTRAINT `TransferArrival_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `StockTransfer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferArrival` ADD CONSTRAINT `TransferArrival_receivedById_fkey` FOREIGN KEY (`receivedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferDiscrepancy` ADD CONSTRAINT `TransferDiscrepancy_transferId_fkey` FOREIGN KEY (`transferId`) REFERENCES `StockTransfer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferDiscrepancy` ADD CONSTRAINT `TransferDiscrepancy_transferItemId_fkey` FOREIGN KEY (`transferItemId`) REFERENCES `StockTransferItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferDiscrepancy` ADD CONSTRAINT `TransferDiscrepancy_arrivalId_fkey` FOREIGN KEY (`arrivalId`) REFERENCES `TransferArrival`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferDiscrepancy` ADD CONSTRAINT `TransferDiscrepancy_serialNumberId_fkey` FOREIGN KEY (`serialNumberId`) REFERENCES `SerialNumber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferDiscrepancyResolution` ADD CONSTRAINT `TransferDiscrepancyResolution_discrepancyId_fkey` FOREIGN KEY (`discrepancyId`) REFERENCES `TransferDiscrepancy`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransferDiscrepancyResolution` ADD CONSTRAINT `TransferDiscrepancyResolution_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `TransferDiscrepancyResolution` ADD CONSTRAINT `TransferDiscrepancyResolution_stockMovementId_fkey` FOREIGN KEY (`stockMovementId`) REFERENCES `StockMovement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
