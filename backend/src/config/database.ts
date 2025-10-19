import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

// Validate DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  logger.error('❌ DATABASE_URL not set in environment variables');
  throw new Error('DATABASE_URL environment variable is required');
}

logger.info(`🔗 Using database: ${process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown'}`);
logger.info(`🔗 Full DATABASE_URL: ${process.env.DATABASE_URL}`);

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // Explicitly use DATABASE_URL
    },
  },
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

// Log queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e: any) => {
    logger.debug(`Query: ${e.query}`);
    logger.debug(`Params: ${e.params}`);
    logger.debug(`Duration: ${e.duration}ms`);
  });
}

prisma.$on('error', (e: any) => {
  logger.error('Prisma error:', e);
});

prisma.$on('warn', (e: any) => {
  logger.warn('Prisma warning:', e);
});

// Test database connection
async function testConnection() {
  try {
    await prisma.$connect();
    logger.info('✅ Database connection successful');
  } catch (error: any) {
    logger.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Database connection closed');
});

export { prisma };
