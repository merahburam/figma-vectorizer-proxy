const { Pool } = require("pg");

// PostgreSQL connection pool
let pool = null;

/**
 * Initialize database connection pool
 * Uses DATABASE_URL environment variable (automatically set by Railway)
 */
function initializeDatabase() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.warn(
      "⚠️  DATABASE_URL not set - running without persistent storage"
    );
    console.warn("   Credits will be lost on server restart");
    return null;
  }

  try {
    pool = new Pool({
      connectionString: connectionString,
      ssl:
        process.env.NODE_ENV === "production"
          ? {
              rejectUnauthorized: false, // Required for Railway PostgreSQL
            }
          : false,
    });

    pool.on("error", (err) => {
      console.error("❌ Unexpected database error:", err);
    });

    console.log("✅ Database connection pool initialized");
    return pool;
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);
    return null;
  }
}

/**
 * Create database tables if they don't exist
 */
async function createTables() {
  const db = initializeDatabase();
  if (!db) {
    console.warn("⚠️  Skipping table creation - no database connection");
    return;
  }

  try {
    // Create purchases table
    await db.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        license_key VARCHAR(255) UNIQUE NOT NULL,
        gumroad_order_id VARCHAR(255),
        product_tier VARCHAR(50) NOT NULL,
        credits_granted INTEGER NOT NULL,
        purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        email VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on user_id for faster lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_purchases_user_id 
      ON purchases(user_id)
    `);

    // Create index on license_key for faster validation
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_purchases_license_key 
      ON purchases(license_key)
    `);

    // Create credit_balances table
    await db.query(`
      CREATE TABLE IF NOT EXISTS credit_balances (
        user_id VARCHAR(255) PRIMARY KEY,
        total_credits INTEGER DEFAULT 0,
        used_credits INTEGER DEFAULT 0,
        remaining_credits INTEGER GENERATED ALWAYS AS (total_credits - used_credits) STORED,
        last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create credit_transactions table for audit trail
    await db.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        credits_delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on user_id for transaction history
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id 
      ON credit_transactions(user_id)
    `);

    console.log("✅ Database tables created/verified successfully");
  } catch (error) {
    console.error("❌ Failed to create tables:", error);
    throw error;
  }
}

/**
 * Log a purchase to the database
 */
async function logPurchase(userId, licenseKey, purchaseData) {
  const db = initializeDatabase();
  if (!db) return null;

  try {
    const result = await db.query(
      `
      INSERT INTO purchases 
        (user_id, license_key, gumroad_order_id, product_tier, credits_granted, email)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (license_key) 
      DO UPDATE SET 
        user_id = EXCLUDED.user_id,
        is_active = true,
        created_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
      [
        userId,
        licenseKey,
        purchaseData.sale_id || null,
        purchaseData.tier || "unknown",
        purchaseData.creditsGranted || 0,
        purchaseData.email || null,
      ]
    );

    console.log("💾 Purchase logged:", result.rows[0].id);
    return result.rows[0];
  } catch (error) {
    console.error("❌ Failed to log purchase:", error);
    return null;
  }
}

/**
 * Check if a license key has been used and by whom
 */
async function checkLicenseKey(licenseKey) {
  const db = initializeDatabase();
  if (!db) return null;

  try {
    const result = await db.query(
      `
      SELECT * FROM purchases 
      WHERE license_key = $1 AND is_active = true
      LIMIT 1
    `,
      [licenseKey]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error("❌ Failed to check license key:", error);
    return null;
  }
}

/**
 * Get all purchases for a user
 */
async function getUserPurchases(userId) {
  const db = initializeDatabase();
  if (!db) return [];

  try {
    const result = await db.query(
      `
      SELECT * FROM purchases 
      WHERE user_id = $1 AND is_active = true
      ORDER BY purchase_date DESC
    `,
      [userId]
    );

    return result.rows;
  } catch (error) {
    console.error("❌ Failed to get user purchases:", error);
    return [];
  }
}

/**
 * Save credit balance to database
 */
async function saveCreditBalance(userId, creditData) {
  const db = initializeDatabase();
  if (!db) return null;

  try {
    const result = await db.query(
      `
      INSERT INTO credit_balances 
        (user_id, total_credits, used_credits, last_sync, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        total_credits = EXCLUDED.total_credits,
        used_credits = EXCLUDED.used_credits,
        last_sync = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `,
      [userId, creditData.maxImages || 0, creditData.usedImages || 0]
    );

    return result.rows[0];
  } catch (error) {
    console.error("❌ Failed to save credit balance:", error);
    return null;
  }
}

/**
 * Get credit balance from database
 */
async function getCreditBalance(userId) {
  const db = initializeDatabase();
  if (!db) return null;

  try {
    const result = await db.query(
      `
      SELECT * FROM credit_balances 
      WHERE user_id = $1
      LIMIT 1
    `,
      [userId]
    );

    if (result.rows.length === 0) {
      // User not found, return default
      return {
        user_id: userId,
        total_credits: 3, // Default free credits
        used_credits: 0,
        remaining_credits: 3,
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error("❌ Failed to get credit balance:", error);
    return null;
  }
}

/**
 * Log a credit transaction for audit trail
 */
async function logCreditTransaction(
  userId,
  transactionType,
  creditsDelta,
  balanceAfter,
  description,
  metadata = {}
) {
  const db = initializeDatabase();
  if (!db) return null;

  try {
    const result = await db.query(
      `
      INSERT INTO credit_transactions 
        (user_id, transaction_type, credits_delta, balance_after, description, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        userId,
        transactionType,
        creditsDelta,
        balanceAfter,
        description,
        JSON.stringify(metadata),
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error("❌ Failed to log transaction:", error);
    return null;
  }
}

/**
 * Get transaction history for a user
 */
async function getTransactionHistory(userId, limit = 50) {
  const db = initializeDatabase();
  if (!db) return [];

  try {
    const result = await db.query(
      `
      SELECT * FROM credit_transactions 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
      [userId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error("❌ Failed to get transaction history:", error);
    return [];
  }
}

module.exports = {
  initializeDatabase,
  createTables,
  logPurchase,
  checkLicenseKey,
  getUserPurchases,
  saveCreditBalance,
  getCreditBalance,
  logCreditTransaction,
  getTransactionHistory,
};
