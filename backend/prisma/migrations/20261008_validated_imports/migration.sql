CREATE TABLE ImportBatch (
  id VARCHAR(191) NOT NULL,
  type VARCHAR(40) NOT NULL,
  fileName VARCHAR(184) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  requestKey CHAR(36) NOT NULL,
  uploadedById VARCHAR(191) NOT NULL,
  confirmedById VARCHAR(191) NULL,
  warehouseId VARCHAR(191) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PREVIEW',
  revision INTEGER NOT NULL DEFAULT 1,
  `rows` JSON NOT NULL,
  result JSON NULL,
  notes VARCHAR(1000) NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expiresAt DATETIME(3) NOT NULL,
  confirmedAt DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE INDEX ImportBatch_uploadedById_requestKey_key (uploadedById,requestKey),
  INDEX ImportBatch_uploadedById_status_createdAt_idx (uploadedById,status,createdAt),
  INDEX ImportBatch_warehouseId_idx (warehouseId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE ImportBatch ADD CONSTRAINT ImportBatch_uploadedById_fkey FOREIGN KEY (uploadedById) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE ImportBatch ADD CONSTRAINT ImportBatch_confirmedById_fkey FOREIGN KEY (confirmedById) REFERENCES User(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ImportBatch ADD CONSTRAINT ImportBatch_warehouseId_fkey FOREIGN KEY (warehouseId) REFERENCES Warehouse(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE ImportBatch ADD CONSTRAINT ImportBatch_state_check CHECK (
  revision > 0 AND type IN ('Products','Suppliers','OpeningStock','SerialNumbers','Assets')
  AND ((type IN ('Products','Suppliers') AND warehouseId IS NULL) OR (type IN ('OpeningStock','SerialNumbers','Assets') AND warehouseId IS NOT NULL))
  AND ((status='PREVIEW' AND confirmedAt IS NULL AND confirmedById IS NULL AND result IS NULL) OR (status='IMPORTED' AND confirmedAt IS NOT NULL AND confirmedById IS NOT NULL AND result IS NOT NULL AND notes IS NOT NULL))
);
INSERT INTO Permission (id,module,action,description) VALUES
('perm-imports-view','imports','VIEW','View accessible import previews, templates and rejected rows'),
('perm-imports-create','imports','CREATE','Stage and revalidate CSV imports without applying business writes'),
('perm-imports-confirm','imports','CONFIRM','Explicitly confirm validated imports using source permissions')
ON DUPLICATE KEY UPDATE module=VALUES(module);
INSERT IGNORE INTO RolePermission (roleId,permissionId) SELECT r.id,p.id FROM Role r CROSS JOIN Permission p WHERE p.module='imports' AND (r.name IN ('Inventory Manager','Warehouse Staff','Procurement Officer','Asset Manager') OR (r.name='Viewer' AND p.action='VIEW'));
