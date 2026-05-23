/*
 * Project note: Expand Complaint Categories is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
USE tole_management;

ALTER TABLE complaints
MODIFY COLUMN category ENUM(
  'Streetlight',
  'Water Supply',
  'Sanitation',
  'Road Damage',
  'Drainage',
  'Garbage Collection',
  'Electricity',
  'Security',
  'Noise Disturbance',
  'Public Property Damage',
  'Public Safety Alert',
  'Other'
) NOT NULL;
