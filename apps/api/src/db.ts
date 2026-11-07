import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') })

const databaseUrl = new URL(
  process.env.DATABASE_URL ?? 'mysql://mysql:mysql@localhost:3306/fakenews',
)

export const pool = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.slice(1),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
})
