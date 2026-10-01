-- CreateTable
CREATE TABLE `Attachment` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(40) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(180) NOT NULL,
    `storedName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `storageProvider` VARCHAR(191) NOT NULL DEFAULT 'LOCAL',
    `storageKey` VARCHAR(191) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `requestKey` CHAR(36) NOT NULL,
    `warehouseId` VARCHAR(191) NULL,
    `relatedWarehouseId` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `archivedById` VARCHAR(191) NULL,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Attachment_storageKey_key`(`storageKey`),
    INDEX `Attachment_entityType_entityId_archivedAt_createdAt_idx`(`entityType`, `entityId`, `archivedAt`, `createdAt`),
    UNIQUE INDEX `Attachment_entityType_entityId_uploadedById_requestKey_key`(`entityType`, `entityId`, `uploadedById`, `requestKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachment` ADD CONSTRAINT `Attachment_archivedById_fkey` FOREIGN KEY (`archivedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Explicit document kinds and recoverable archive state. No business rows are changed.
ALTER TABLE Attachment ADD CONSTRAINT Attachment_metadata_check CHECK (size > 0 AND size <= 26214400 AND entityType IN ('Product','Supplier','PurchaseRequest','RFQ','SupplierQuotation','PurchaseOrder','PurchaseReceipt','SupplierReturn','StockTransfer','Asset','MaintenanceRecord','WarrantyClaim') AND ((archivedAt IS NULL AND archivedById IS NULL) OR (archivedAt IS NOT NULL AND archivedById IS NOT NULL)));
INSERT INTO Permission (id,module,action,description) VALUES
('perm-attachments-view','attachments','VIEW','View and download attachments for accessible records'),
('perm-attachments-create','attachments','CREATE','Upload documents to editable records'),
('perm-attachments-edit','attachments','EDIT','Restore archived document attachments'),
('perm-attachments-delete','attachments','DELETE','Archive document attachments while retaining files')
ON DUPLICATE KEY UPDATE module=VALUES(module);
INSERT IGNORE INTO RolePermission (roleId,permissionId) SELECT r.id,p.id FROM Role r CROSS JOIN Permission p WHERE p.module='attachments' AND (r.name IN ('Inventory Manager','Warehouse Staff','Procurement Officer','Asset Manager') OR (r.name='Viewer' AND p.action='VIEW'));
