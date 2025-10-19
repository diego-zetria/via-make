/**
 * Database connection management for PostgreSQL, Redis, and DynamoDB
 * Implements connection pooling and automatic reconnection
 */

const { Pool } = require('pg');
const { createClient } = require('redis');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// PostgreSQL connection pool (reused across Lambda invocations)
let pgPool = null;

// Redis client (reused across Lambda invocations)
let redisClient = null;

// DynamoDB client (reused across Lambda invocations)
let dynamoClient = null;

/**
 * Get or create PostgreSQL connection pool
 */
async function getPostgresPool() {
  if (pgPool) {
    return pgPool;
  }

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5, // Max connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false // For RDS
    }
  });

  // Test connection
  try {
    const client = await pgPool.connect();
    client.release();
  } catch (error) {
    console.error('PostgreSQL connection failed:', error);
    throw error;
  }

  return pgPool;
}

/**
 * Get or create Redis client
 */
async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => {
        if (retries > 3) return new Error('Max retries reached');
        return Math.min(retries * 100, 3000);
      }
    }
  });

  redisClient.on('error', (err) => console.error('Redis Client Error', err));

  await redisClient.connect();

  return redisClient;
}

/**
 * Get or create DynamoDB document client
 */
function getDynamoClient() {
  if (dynamoClient) {
    return dynamoClient;
  }

  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1'
  });

  dynamoClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true
    }
  });

  return dynamoClient;
}

/**
 * PostgreSQL operations
 */
const postgres = {
  async query(sql, params = []) {
    const pool = await getPostgresPool();
    const result = await pool.query(sql, params);
    return result.rows;
  },

  async createJob(jobData) {
    const sql = `
      INSERT INTO replicate.jobs (
        job_id, media_type, model_id, status, parameters, prompt,
        user_id, estimated_time, estimated_cost, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, job_id, created_at
    `;

    const values = [
      jobData.jobId,
      jobData.mediaType,
      jobData.modelId,
      jobData.status || 'pending',
      JSON.stringify(jobData.parameters || {}),
      jobData.prompt,
      jobData.userId,
      jobData.estimatedTime,
      jobData.estimatedCost,
      JSON.stringify(jobData.metadata || {})
    ];

    const rows = await this.query(sql, values);
    return rows[0];
  },

  async updateJob(jobId, updates) {
    const setParts = [];
    const values = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'parameters' || key === 'metadata') {
        setParts.push(`${key} = $${paramIndex}::jsonb`);
        values.push(JSON.stringify(value));
      } else {
        setParts.push(`${key} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    });

    values.push(jobId);

    const sql = `
      UPDATE replicate.jobs
      SET ${setParts.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE job_id = $${paramIndex}
      RETURNING *
    `;

    const rows = await this.query(sql, values);
    return rows[0];
  },

  async getJob(jobId) {
    const sql = 'SELECT * FROM replicate.jobs WHERE job_id = $1';
    const rows = await this.query(sql, [jobId]);
    return rows[0];
  }
};

/**
 * Redis operations (gracefully handles connection failures)
 */
const redis = {
  async get(key) {
    try {
      const client = await getRedisClient();
      return await client.get(key);
    } catch (error) {
      console.warn('Redis get failed, continuing without cache:', error.message);
      return null;
    }
  },

  async set(key, value, ttl = null) {
    try {
      const client = await getRedisClient();
      if (ttl) {
        await client.setEx(key, ttl, value);
      } else {
        await client.set(key, value);
      }
    } catch (error) {
      console.warn('Redis set failed, continuing without cache:', error.message);
    }
  },

  async setJSON(key, obj, ttl = null) {
    try {
      await this.set(key, JSON.stringify(obj), ttl);
    } catch (error) {
      console.warn('Redis setJSON failed, continuing without cache:', error.message);
    }
  },

  async getJSON(key) {
    try {
      const value = await this.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn('Redis getJSON failed, continuing without cache:', error.message);
      return null;
    }
  },

  async del(key) {
    try {
      const client = await getRedisClient();
      await client.del(key);
    } catch (error) {
      console.warn('Redis del failed, continuing without cache:', error.message);
    }
  },

  async incr(key, ttl = null) {
    try {
      const client = await getRedisClient();
      const value = await client.incr(key);
      if (ttl && value === 1) {
        await client.expire(key, ttl);
      }
      return value;
    } catch (error) {
      console.warn('Redis incr failed, continuing without rate limiting:', error.message);
      return 1; // Return 1 to simulate first request (no rate limiting)
    }
  }
};

/**
 * DynamoDB operations
 */
const dynamo = {
  async put(tableName, item) {
    const client = getDynamoClient();
    const command = new PutCommand({
      TableName: tableName,
      Item: item
    });
    await client.send(command);
  },

  async get(tableName, key) {
    const client = getDynamoClient();
    const command = new GetCommand({
      TableName: tableName,
      Key: key
    });
    const result = await client.send(command);
    return result.Item;
  },

  async update(tableName, key, updates) {
    const client = getDynamoClient();

    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.entries(updates).forEach(([field, value], index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;
      updateExpressions.push(`${attrName} = ${attrValue}`);
      expressionAttributeNames[attrName] = field;
      expressionAttributeValues[attrValue] = value;
    });

    const command = new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const result = await client.send(command);
    return result.Attributes;
  },

  async scan(tableName, filterExpression = null, expressionAttributeValues = null) {
    const client = getDynamoClient();
    const params = { TableName: tableName };

    if (filterExpression) {
      params.FilterExpression = filterExpression;
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    const command = new ScanCommand(params);
    const result = await client.send(command);
    return result.Items;
  }
};

module.exports = {
  postgres,
  redis,
  dynamo,
  closeConnections: async () => {
    if (pgPool) await pgPool.end();
    if (redisClient) await redisClient.quit();
  }
};
