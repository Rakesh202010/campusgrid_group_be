import pg from 'pg';
import prismaAdmin from './prisma.js';

const { Client } = pg;

/**
 * Get a PostgreSQL client connection to a group's database
 * @param {string} groupId - The group ID
 * @returns {Promise<pg.Client>} - Database client
 */
export async function getGroupDbClient(groupId) {
  // Get group info from admin database
  const group = await prismaAdmin.schoolGroup.findUnique({
    where: { id: groupId },
    select: {
      dbName: true,
      dbHost: true,
      dbUser: true,
      dbPassword: true,
    }
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  // Get database host and port from environment
  const dbHost = group.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
  const dbPort = process.env.DB_SCHOOLS_PORT || 5433;

  // Create client connection to group database
  // Use environment password first (all DBs on same server use same credentials)
  const client = new Client({
    host: dbHost,
    port: parseInt(dbPort),
    user: process.env.DB_SCHOOLS_USER || group.dbUser || 'school_admin',
    password: process.env.DB_SCHOOLS_PASSWORD || 'school123', // Use env password (all DBs on same server)
    database: group.dbName,
  });

  await client.connect();
  return client;
}

/**
 * Get group DB connection info (without connecting)
 * Useful for Prisma or other ORMs that need connection string
 */
export async function getGroupDbInfo(groupId) {
  const group = await prismaAdmin.schoolGroup.findUnique({
    where: { id: groupId },
    select: {
      dbName: true,
      dbHost: true,
      dbUser: true,
      dbPassword: true,
    }
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  const dbHost = group.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
  const dbPort = process.env.DB_SCHOOLS_PORT || 5433;

  // Use environment password first (all DBs on same server use same credentials)
  const dbUser = process.env.DB_SCHOOLS_USER || group.dbUser || 'school_admin';
  const dbPassword = process.env.DB_SCHOOLS_PASSWORD || 'school123';
  
  return {
    host: dbHost,
    port: parseInt(dbPort),
    user: dbUser,
    password: dbPassword,
    database: group.dbName,
    connectionString: `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${group.dbName}`
  };
}

