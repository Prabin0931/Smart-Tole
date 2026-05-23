/*
 * Project note: Create Complaint Updates is a database setup or migration script for Smart Tole.
 * Run SQL files deliberately and keep them aligned with the current Express API expectations.
 */
USE tole_management;

CREATE TABLE IF NOT EXISTS complaint_updates (
  update_id INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id INT NOT NULL,
  admin_id INT NOT NULL,
  admin_name VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_complaint_updates_complaint
    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_complaint_updates_admin
    FOREIGN KEY (admin_id) REFERENCES admin(admin_id)
    ON DELETE CASCADE
);
