-- AlterTable
ALTER TABLE `SerialNumber` MODIFY `status` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING') NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE `StockMovement` MODIFY `type` ENUM('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN', 'PURCHASE_RECEIVING', 'RETURN', 'DAMAGE', 'CORRECTION', 'OPENING_STOCK', 'ASSET_ASSIGNMENT', 'ASSET_RETURN', 'RESERVATION_CREATED', 'RESERVATION_RELEASED', 'RESERVATION_EXPIRED', 'SUPPLIER_RETURN', 'RETURN_HOLD', 'RETURN_RELEASE') NOT NULL;

-- AlterTable
ALTER TABLE `StockCountSerial` MODIFY `expectedStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING') NULL;

-- AlterTable
ALTER TABLE `SerialEvent` MODIFY `fromStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING') NULL,
    MODIFY `toStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING') NULL;

-- CreateTable
CREATE TABLE `SupplierReturn` (
    `id` VARCHAR(191) NOT NULL,
    `returnNumber` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'SHIPPED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `reason` ENUM('DEFECTIVE', 'WRONG_ITEM', 'DAMAGED', 'WARRANTY', 'OVER_DELIVERY', 'OTHER') NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `returnedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `shipmentReference` VARCHAR(191) NULL,
    `completionNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SupplierReturn_returnNumber_key`(`returnNumber`),
    INDEX `SupplierReturn_warehouseId_status_createdAt_idx`(`warehouseId`, `status`, `createdAt`),
    INDEX `SupplierReturn_receiptId_status_idx`(`receiptId`, `status`),
    INDEX `SupplierReturn_supplierId_createdAt_idx`(`supplierId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierReturnItem` (
    `id` VARCHAR(191) NOT NULL,
    `supplierReturnId` VARCHAR(191) NOT NULL,
    `receiptItemId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` ENUM('DEFECTIVE', 'WRONG_ITEM', 'DAMAGED', 'WARRANTY', 'OVER_DELIVERY', 'OTHER') NOT NULL,
    `condition` ENUM('AVAILABLE', 'DEFECTIVE', 'DAMAGED', 'FOR_REPAIR') NOT NULL,
    `heldQuantity` INTEGER NOT NULL DEFAULT 0,

    INDEX `SupplierReturnItem_receiptItemId_idx`(`receiptItemId`),
    INDEX `SupplierReturnItem_productId_idx`(`productId`),
    UNIQUE INDEX `SupplierReturnItem_supplierReturnId_receiptItemId_key`(`supplierReturnId`, `receiptItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierReturnSerial` (
    `returnItemId` VARCHAR(191) NOT NULL,
    `serialNumberId` VARCHAR(191) NOT NULL,
    `previousStatus` ENUM('AVAILABLE', 'MISSING', 'ISSUED', 'ASSIGNED', 'RESERVED', 'DEFECTIVE', 'FOR_REPAIR', 'RETURNED', 'DISPOSED', 'RETURN_PENDING') NOT NULL,

    INDEX `SupplierReturnSerial_serialNumberId_idx`(`serialNumberId`),
    PRIMARY KEY (`returnItemId`, `serialNumberId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `PurchaseReceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturn` ADD CONSTRAINT `SupplierReturn_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturnItem` ADD CONSTRAINT `SupplierReturnItem_supplierReturnId_fkey` FOREIGN KEY (`supplierReturnId`) REFERENCES `SupplierReturn`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturnItem` ADD CONSTRAINT `SupplierReturnItem_receiptItemId_fkey` FOREIGN KEY (`receiptItemId`) REFERENCES `PurchaseReceiptItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturnItem` ADD CONSTRAINT `SupplierReturnItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturnSerial` ADD CONSTRAINT `SupplierReturnSerial_returnItemId_fkey` FOREIGN KEY (`returnItemId`) REFERENCES `SupplierReturnItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierReturnSerial` ADD CONSTRAINT `SupplierReturnSerial_serialNumberId_fkey` FOREIGN KEY (`serialNumberId`) REFERENCES `SerialNumber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Add only feature permissions; retain existing role assignments.
INSERT INTO Permission (id,module,action,description) VALUES
('perm-returns-view','supplier_returns','VIEW','View supplier return records'),
('perm-returns-create','supplier_returns','CREATE','Prepare receipt-linked draft returns'),
('perm-returns-edit','supplier_returns','EDIT','Edit, submit and cancel supplier returns'),
('perm-returns-approve','supplier_returns','APPROVE','Approve supplier returns'),
('perm-returns-ship','supplier_returns','SHIP','Confirm physical supplier return shipment'),
('perm-returns-complete','supplier_returns','COMPLETE','Record supplier acknowledgement or credit outcome')
ON DUPLICATE KEY UPDATE module=VALUES(module);
INSERT IGNORE INTO RolePermission (roleId,permissionId)
SELECT r.id,p.id FROM Role r CROSS JOIN Permission p WHERE p.module='supplier_returns' AND
((r.name='Procurement Officer' AND p.action<>'SHIP') OR
(r.name='Inventory Manager' AND p.action<>'COMPLETE') OR
(r.name='Warehouse Staff' AND p.action IN ('VIEW','SHIP')) OR
(r.name='Viewer' AND p.action='VIEW'));
