import mysql from 'mysql2/promise';
import './config.js';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'boardgame',
  password: process.env.DB_PASSWORD || 'boardgame',
  database: process.env.DB_NAME || 'boardgame',
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
});
