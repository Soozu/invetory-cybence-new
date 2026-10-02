-- Keep the server-observed address; browser reports are separate, optional metadata.
ALTER TABLE `Session`
  ADD COLUMN `reportedPublicIp` VARCHAR(45) NULL,
  ADD COLUMN `reportedPublicIpAt` DATETIME(3) NULL;
