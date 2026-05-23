/*
 * Project note: Add Notice Photo is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
USE tole_management;

ALTER TABLE notices
ADD COLUMN IF NOT EXISTS photo_data LONGTEXT NULL AFTER description;
