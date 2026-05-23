/*
 * Project note: Single MySQL connection pool used by the Express server.
 * Keep database access going through this module so connection settings and query behavior stay consistent.
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config();

// A shared MySQL pool is used instead of opening a new connection per request.
// This keeps API requests faster and avoids exhausting database connections.
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "tole_management",
  waitForConnections: true,
  connectionLimit: 10
});

export async function query(sql, params = []) {
  // All backend modules use this helper so SQL execution remains consistent.
  const [rows] = await pool.execute(sql, params);
  return rows;
}

export async function testDatabaseConnection() {
  const connection = await pool.getConnection();
  connection.release();
}
