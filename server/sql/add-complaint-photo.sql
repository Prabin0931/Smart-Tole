/*
 * Project note: Add Complaint Photo is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
USE tole_management;

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS photo_data LONGTEXT NULL AFTER message;
