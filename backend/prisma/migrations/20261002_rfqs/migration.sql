-- CreateTable
CREATE TABLE `RFQ` (
    `id` VARCHAR(191) NOT NULL,
    `rfqNumber` VARCHAR(191) NOT NULL,
    `purchaseRequestId` VARCHAR(191) NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'ISSUED', 'CLOSED', 'AWARDED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `closingDate` DATETIME(3) NULL,
    `issuedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `selectedQuotationId` VARCHAR(191) NULL,
    `selectedById` VARCHAR(191) NULL,
    `selectedAt` DATETIME(3) NULL,
    `selectionNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RFQ_rfqNumber_key`(`rfqNumber`),
    UNIQUE INDEX `RFQ_selectedQuotationId_key`(`selectedQuotationId`),
    INDEX `RFQ_warehouseId_status_createdAt_idx`(`warehouseId`, `status`, `createdAt`),
    INDEX `RFQ_purchaseRequestId_status_idx`(`purchaseRequestId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RFQItem` (
    `id` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `purchaseRequestItemId` VARCHAR(191) NULL,
    `productId` VARCHAR(191) NULL,
    `description` VARCHAR(500) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `notes` TEXT NULL,

    INDEX `RFQItem_rfqId_idx`(`rfqId`),
    INDEX `RFQItem_purchaseRequestItemId_idx`(`purchaseRequestItemId`),
    INDEX `RFQItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RFQSupplier` (
    `id` VARCHAR(191) NOT NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `invitedAt` DATETIME(3) NULL,
    `respondedAt` DATETIME(3) NULL,

    INDEX `RFQSupplier_supplierId_idx`(`supplierId`),
    UNIQUE INDEX `RFQSupplier_rfqId_supplierId_key`(`rfqId`, `supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierQuotation` (
    `id` VARCHAR(191) NOT NULL,
    `quotationNumber` VARCHAR(191) NOT NULL,
    `supplierReference` VARCHAR(191) NULL,
    `rfqId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `quotationDate` DATETIME(3) NOT NULL,
    `validUntil` DATETIME(3) NULL,
    `deliveryDays` INTEGER NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `tax` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `shipping` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(14, 2) NOT NULL,
    `notes` TEXT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'ACCEPTED', 'CONVERTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `purchaseOrderId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `convertedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SupplierQuotation_quotationNumber_key`(`quotationNumber`),
    UNIQUE INDEX `SupplierQuotation_purchaseOrderId_key`(`purchaseOrderId`),
    INDEX `SupplierQuotation_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `SupplierQuotation_rfqId_supplierId_key`(`rfqId`, `supplierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierQuotationItem` (
    `id` VARCHAR(191) NOT NULL,
    `quotationId` VARCHAR(191) NOT NULL,
    `rfqItemId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DECIMAL(14, 2) NOT NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `brandOffered` VARCHAR(191) NULL,
    `modelOffered` VARCHAR(191) NULL,
    `notes` TEXT NULL,

    INDEX `SupplierQuotationItem_rfqItemId_idx`(`rfqItemId`),
    UNIQUE INDEX `SupplierQuotationItem_quotationId_rfqItemId_key`(`quotationId`, `rfqItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RFQ` ADD CONSTRAINT `RFQ_purchaseRequestId_fkey` FOREIGN KEY (`purchaseRequestId`) REFERENCES `PurchaseRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQ` ADD CONSTRAINT `RFQ_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQ` ADD CONSTRAINT `RFQ_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQ` ADD CONSTRAINT `RFQ_selectedById_fkey` FOREIGN KEY (`selectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQ` ADD CONSTRAINT `RFQ_selectedQuotationId_fkey` FOREIGN KEY (`selectedQuotationId`) REFERENCES `SupplierQuotation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQItem` ADD CONSTRAINT `RFQItem_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `RFQ`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQItem` ADD CONSTRAINT `RFQItem_purchaseRequestItemId_fkey` FOREIGN KEY (`purchaseRequestItemId`) REFERENCES `PurchaseRequestItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQItem` ADD CONSTRAINT `RFQItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQSupplier` ADD CONSTRAINT `RFQSupplier_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `RFQ`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RFQSupplier` ADD CONSTRAINT `RFQSupplier_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuotation` ADD CONSTRAINT `SupplierQuotation_rfqId_fkey` FOREIGN KEY (`rfqId`) REFERENCES `RFQ`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuotation` ADD CONSTRAINT `SupplierQuotation_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuotation` ADD CONSTRAINT `SupplierQuotation_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuotationItem` ADD CONSTRAINT `SupplierQuotationItem_quotationId_fkey` FOREIGN KEY (`quotationId`) REFERENCES `SupplierQuotation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuotationItem` ADD CONSTRAINT `SupplierQuotationItem_rfqItemId_fkey` FOREIGN KEY (`rfqItemId`) REFERENCES `RFQItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `Permission` (`id`,`module`,`action`,`description`) VALUES
('perm-rfqs-view','rfqs','VIEW','View RFQs and quotation comparison'),
('perm-rfqs-create','rfqs','CREATE','Create draft RFQs'),
('perm-rfqs-edit','rfqs','EDIT','Edit RFQs and record supplier quotations'),
('perm-rfqs-issue','rfqs','ISSUE','Issue RFQs to recorded invitees'),
('perm-rfqs-close','rfqs','CLOSE','Close quotation collection'),
('perm-rfqs-award','rfqs','AWARD','Manually select submitted quotations'),
('perm-rfqs-convert','rfqs','CONVERT','Explicitly convert awarded quotations to draft orders')
ON DUPLICATE KEY UPDATE `module`=VALUES(`module`);
INSERT IGNORE INTO `RolePermission` (`roleId`,`permissionId`)
SELECT r.`id`,p.`id` FROM `Role` r CROSS JOIN `Permission` p WHERE p.`module`='rfqs' AND
(r.`name`='Procurement Officer' OR (r.`name`='Inventory Manager' AND p.`action`<>'CONVERT') OR (r.`name`='Viewer' AND p.`action`='VIEW'));

