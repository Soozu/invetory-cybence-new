-- CreateTable
CREATE TABLE `PurchaseRequest` (
    `id` VARCHAR(191) NOT NULL,
    `prNumber` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `requiredDate` DATETIME(3) NULL,
    `justification` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `approvedById` VARCHAR(191) NULL,
    `rejectedById` VARCHAR(191) NULL,
    `approvalNotes` TEXT NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `convertedAt` DATETIME(3) NULL,
    `purchaseOrderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PurchaseRequest_prNumber_key`(`prNumber`),
    UNIQUE INDEX `PurchaseRequest_purchaseOrderId_key`(`purchaseOrderId`),
    INDEX `PurchaseRequest_warehouseId_status_createdAt_idx`(`warehouseId`, `status`, `createdAt`),
    INDEX `PurchaseRequest_requestedById_createdAt_idx`(`requestedById`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseRequestItem` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseRequestId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `description` VARCHAR(500) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `estimatedUnitCost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `notes` TEXT NULL,

    INDEX `PurchaseRequestItem_purchaseRequestId_idx`(`purchaseRequestId`),
    INDEX `PurchaseRequestItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PurchaseRequest` ADD CONSTRAINT `PurchaseRequest_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseRequest` ADD CONSTRAINT `PurchaseRequest_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseRequest` ADD CONSTRAINT `PurchaseRequest_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseRequest` ADD CONSTRAINT `PurchaseRequest_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseRequest` ADD CONSTRAINT `PurchaseRequest_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseRequestItem` ADD CONSTRAINT `PurchaseRequestItem_purchaseRequestId_fkey` FOREIGN KEY (`purchaseRequestId`) REFERENCES `PurchaseRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseRequestItem` ADD CONSTRAINT `PurchaseRequestItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `Permission` (`id`,`module`,`action`,`description`) VALUES
('perm-purchase-requests-view','purchase_requests','VIEW','View purchase requests'),
('perm-purchase-requests-create','purchase_requests','CREATE','Create purchase requests'),
('perm-purchase-requests-edit','purchase_requests','EDIT','Edit and submit draft requests'),
('perm-purchase-requests-approve','purchase_requests','APPROVE','Approve or reject requests'),
('perm-purchase-requests-convert','purchase_requests','CONVERT','Explicitly convert approved requests to draft orders')
ON DUPLICATE KEY UPDATE `module`=VALUES(`module`);
INSERT IGNORE INTO `RolePermission` (`roleId`,`permissionId`)
SELECT r.`id`,p.`id` FROM `Role` r CROSS JOIN `Permission` p WHERE p.`module`='purchase_requests' AND
(r.`name`='Procurement Officer' OR
 (r.`name`='Inventory Manager' AND p.`action` IN ('VIEW','CREATE','EDIT','APPROVE')) OR
 (r.`name`='Warehouse Staff' AND p.`action` IN ('VIEW','CREATE','EDIT')) OR
 (r.`name`='Viewer' AND p.`action`='VIEW'));

