import pg from 'pg';

const { Pool } = pg;

/**
 * Create a connection pool for a specific group's database
 */
export function createGroupDatabasePool(dbName) {
  const pool = new Pool({
    host: process.env.DB_SCHOOLS_HOST || 'postgres_schools',
    port: process.env.DB_SCHOOLS_PORT || 5432,
    user: process.env.DB_SCHOOLS_USER || 'school_admin',
    password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
    database: dbName,
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  return pool;
}

/**
 * Query a group's database
 */
export async function queryGroupDatabase(dbName, query, params = []) {
  const pool = createGroupDatabasePool(dbName);
  
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error(`Error querying database ${dbName}:`, error);
    throw error;
  } finally {
    await pool.end();
  }
}

