-- AlterTable
ALTER TABLE `SerialNumber` MODIFY `status` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED') NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE `StockMovement` ADD COLUMN `newReservedQuantity` INTEGER NULL,
    ADD COLUMN `previousReservedQuantity` INTEGER NULL,
    MODIFY `type` ENUM('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'PURCHASE_RECEIVING', 'RETURN', 'DAMAGE', 'CORRECTION', 'OPENING_STOCK', 'ASSET_ASSIGNMENT', 'ASSET_RETURN', 'RESERVATION_CREATED', 'RESERVATION_RELEASED', 'RESERVATION_EXPIRED') NOT NULL;

-- AlterTable
ALTER TABLE `StockCountSerial` MODIFY `expectedStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED') NULL;

-- CreateTable
CREATE TABLE `InventoryReservation` (
    `id` VARCHAR(191) NOT NULL,
    `reservationNumber` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'FULFILLED', 'RELEASED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `expiresAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InventoryReservation_reservationNumber_key`(`reservationNumber`),
    INDEX `InventoryReservation_warehouseId_status_createdAt_idx`(`warehouseId`, `status`, `createdAt`),
    INDEX `InventoryReservation_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryReservationItem` (
    `id` VARCHAR(191) NOT NULL,
    `reservationId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `fulfilledQuantity` INTEGER NOT NULL DEFAULT 0,

    INDEX `InventoryReservationItem_productId_idx`(`productId`),
    UNIQUE INDEX `InventoryReservationItem_reservationId_productId_key`(`reservationId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryReservationSerial` (
    `id` VARCHAR(191) NOT NULL,
    `reservationItemId` VARCHAR(191) NOT NULL,
    `serialNumberId` VARCHAR(191) NOT NULL,
    `fulfilledAt` DATETIME(3) NULL,

    INDEX `InventoryReservationSerial_serialNumberId_idx`(`serialNumberId`),
    UNIQUE INDEX `InventoryReservationSerial_reservationItemId_serialNumberId_key`(`reservationItemId`, `serialNumberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `InventoryReservation` ADD CONSTRAINT `InventoryReservation_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReservation` ADD CONSTRAINT `InventoryReservation_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReservationItem` ADD CONSTRAINT `InventoryReservationItem_reservationId_fkey` FOREIGN KEY (`reservationId`) REFERENCES `InventoryReservation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReservationItem` ADD CONSTRAINT `InventoryReservationItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReservationSerial` ADD CONSTRAINT `InventoryReservationSerial_reservationItemId_fkey` FOREIGN KEY (`reservationItemId`) REFERENCES `InventoryReservationItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryReservationSerial` ADD CONSTRAINT `InventoryReservationSerial_serialNumberId_fkey` FOREIGN KEY (`serialNumberId`) REFERENCES `SerialNumber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `Permission` (`id`, `module`, `action`, `description`)
VALUES ('perm-reservations-view','reservations','VIEW','View inventory reservations'),
       ('perm-reservations-create','reservations','CREATE','Reserve available warehouse stock'),
       ('perm-reservations-release','reservations','RELEASE','Release or cancel remaining inventory holds'),
       ('perm-reservations-fulfill','reservations','FULFILL','Issue reserved stock')
ON DUPLICATE KEY UPDATE `module`=VALUES(`module`);
INSERT IGNORE INTO `RolePermission` (`roleId`,`permissionId`)
SELECT r.`id`,p.`id` FROM `Role` r CROSS JOIN `Permission` p
WHERE p.`module`='reservations' AND
 (r.`name` IN ('Inventory Manager','Warehouse Staff') OR (r.`name`='Viewer' AND p.`action`='VIEW'));
