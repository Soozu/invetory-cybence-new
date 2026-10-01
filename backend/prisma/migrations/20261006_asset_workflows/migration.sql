-- AlterTable
ALTER TABLE `Asset` ADD COLUMN `servicePreviousSerialStatus` VARCHAR(191) NULL,
    ADD COLUMN `servicePreviousStatus` VARCHAR(191) NULL,
    MODIFY `status` ENUM('AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST', 'DISPOSED', 'QUARANTINE') NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE `AssetAssignment` ADD COLUMN `returnNotes` TEXT NULL,
    ADD COLUMN `returnedById` VARCHAR(191) NULL,
    ADD COLUMN `warehouseId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `MaintenanceRecord` ADD COLUMN `inspectionResult` VARCHAR(191) NULL,
    ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'CORRECTIVE',
    ADD COLUMN `planId` VARCHAR(191) NULL,
    ADD COLUMN `plannedDueAt` DATETIME(3) NULL,
    ADD COLUMN `warehouseId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `AssetEvent` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `notes` TEXT NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssetEvent_assetId_createdAt_idx`(`assetId`, `createdAt`),
    INDEX `AssetEvent_warehouseId_createdAt_idx`(`warehouseId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PreventiveMaintenancePlan` (
    `id` VARCHAR(191) NOT NULL,
    `assetId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `instructions` TEXT NOT NULL,
    `intervalDays` INTEGER NOT NULL,
    `nextDueAt` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PreventiveMaintenancePlan_assetId_status_nextDueAt_idx`(`assetId`, `status`, `nextDueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WarrantyClaim` (
    `id` VARCHAR(191) NOT NULL,
    `claimNumber` VARCHAR(191) NOT NULL,
    `serialNumberId` VARCHAR(191) NOT NULL,
    `activeSerialId` VARCHAR(191) NULL,
    `assetId` VARCHAR(191) NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `receiptId` VARCHAR(191) NOT NULL,
    `warrantyStart` DATETIME(3) NOT NULL,
    `warrantyEnd` DATETIME(3) NOT NULL,
    `issue` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `providerReference` VARCHAR(191) NULL,
    `outcome` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `maintenanceId` VARCHAR(191) NULL,
    `supplierReturnId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WarrantyClaim_claimNumber_key`(`claimNumber`),
    UNIQUE INDEX `WarrantyClaim_activeSerialId_key`(`activeSerialId`),
    INDEX `WarrantyClaim_warehouseId_status_createdAt_idx`(`warehouseId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WarrantyClaimEvent` (
    `id` VARCHAR(191) NOT NULL,
    `claimId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `notes` TEXT NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WarrantyClaimEvent_claimId_createdAt_idx`(`claimId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `MaintenanceRecord_planId_plannedDueAt_key` ON `MaintenanceRecord`(`planId`, `plannedDueAt`);

-- AddForeignKey
ALTER TABLE `AssetAssignment` ADD CONSTRAINT `AssetAssignment_returnedById_fkey` FOREIGN KEY (`returnedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetAssignment` ADD CONSTRAINT `AssetAssignment_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MaintenanceRecord` ADD CONSTRAINT `MaintenanceRecord_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `PreventiveMaintenancePlan`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MaintenanceRecord` ADD CONSTRAINT `MaintenanceRecord_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetEvent` ADD CONSTRAINT `AssetEvent_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetEvent` ADD CONSTRAINT `AssetEvent_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssetEvent` ADD CONSTRAINT `AssetEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PreventiveMaintenancePlan` ADD CONSTRAINT `PreventiveMaintenancePlan_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_serialNumberId_fkey` FOREIGN KEY (`serialNumberId`) REFERENCES `SerialNumber`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_assetId_fkey` FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `PurchaseReceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_maintenanceId_fkey` FOREIGN KEY (`maintenanceId`) REFERENCES `MaintenanceRecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaim` ADD CONSTRAINT `WarrantyClaim_supplierReturnId_fkey` FOREIGN KEY (`supplierReturnId`) REFERENCES `SupplierReturn`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaimEvent` ADD CONSTRAINT `WarrantyClaimEvent_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `WarrantyClaim`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WarrantyClaimEvent` ADD CONSTRAINT `WarrantyClaimEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- New records only: preserve legacy custody timestamps and unknown history.
ALTER TABLE PreventiveMaintenancePlan ADD CONSTRAINT Plan_workflow_check CHECK (intervalDays BETWEEN 1 AND 3650 AND status IN ('ACTIVE','PAUSED','CANCELLED'));
ALTER TABLE MaintenanceRecord ADD CONSTRAINT Maintenance_kind_check CHECK (kind IN ('CORRECTIVE','PREVENTIVE') AND ((kind='CORRECTIVE' AND planId IS NULL AND plannedDueAt IS NULL) OR (kind='PREVENTIVE' AND planId IS NOT NULL AND plannedDueAt IS NOT NULL)));
ALTER TABLE WarrantyClaim ADD CONSTRAINT Claim_workflow_check CHECK (status IN ('DRAFT','SUBMITTED','ACCEPTED','RESOLVED','REJECTED','CANCELLED') AND ((status IN ('DRAFT','SUBMITTED','ACCEPTED') AND activeSerialId IS NOT NULL AND activeSerialId=serialNumberId) OR (status IN ('RESOLVED','REJECTED','CANCELLED') AND activeSerialId IS NULL)) AND warrantyEnd >= warrantyStart);
INSERT INTO Permission (id,module,action,description) VALUES
('perm-warranty-view','warranty_claims','VIEW','View scoped warranty claims'),
('perm-warranty-create','warranty_claims','CREATE','Create exact receipt-linked warranty drafts'),
('perm-warranty-edit','warranty_claims','EDIT','Edit, submit and cancel warranty drafts'),
('perm-warranty-approve','warranty_claims','APPROVE','Record supplier decisions and resolution evidence')
ON DUPLICATE KEY UPDATE module=VALUES(module);
INSERT IGNORE INTO RolePermission (roleId,permissionId)
SELECT r.id,p.id FROM Role r CROSS JOIN Permission p WHERE p.module='warranty_claims' AND
((r.name='Asset Manager') OR
(r.name='Inventory Manager' AND p.action IN ('VIEW','CREATE','EDIT')) OR
(r.name='Procurement Officer' AND p.action IN ('VIEW','EDIT','APPROVE')) OR
(r.name IN ('Warehouse Staff','Viewer') AND p.action='VIEW'));
