import { PrismaClient } from '@prisma/client';

// Admin database Prisma client (for authentication and group info)
// The DATABASE_URL_ADMIN is already configured in the Prisma schema
const prismaAdmin = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

console.log('✅ Admin Prisma Client initialized for:', process.env.DATABASE_URL_ADMIN);
console.log('PrismaAdmin instance:', typeof prismaAdmin, prismaAdmin.groupAdmin ? 'has groupAdmin' : 'missing groupAdmin');

export default prismaAdmin;

