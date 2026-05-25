const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const databaseEnabled = Boolean(connectionString);

let pool = null;

function getPool() {
  if (!databaseEnabled) {
    return null;
  }

  if (!pool) {
    const sslEnabled = process.env.DATABASE_SSL === 'true' || (
      process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false'
    );

    pool = new Pool({
      connectionString,
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
    });
  }

  return pool;
}

function isDatabaseEnabled() {
  return databaseEnabled;
}

async function query(text, params) {
  const activePool = getPool();
  if (!activePool) {
    throw new Error('DATABASE_URLが設定されていません。');
  }
  return activePool.query(text, params);
}

async function initDatabase() {
  if (!databaseEnabled) {
    console.log('[Database] DATABASE_URL is not set. Using JSON file persistence.');
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS amazon_auth (
      user_id TEXT NOT NULL,
      marketplace_id TEXT NOT NULL DEFAULT 'ATVPDKIKX0DER',
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, marketplace_id)
    );

    CREATE TABLE IF NOT EXISTS amazon_oauth_states (
      user_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracked_listings (
      user_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      marketplace_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price NUMERIC NOT NULL DEFAULT 0,
      product_type TEXT NOT NULL DEFAULT 'GENERIC',
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, sku, marketplace_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tracked_listings_user_asin
      ON tracked_listings (user_id, asin);

    CREATE INDEX IF NOT EXISTS idx_tracked_listings_user_marketplace
      ON tracked_listings (user_id, marketplace_id);

    CREATE TABLE IF NOT EXISTS suspended_listings (
      user_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      marketplace_id TEXT NOT NULL,
      asin TEXT NOT NULL,
      suspended_reason_type TEXT,
      suspended_reason TEXT,
      suspended_at TIMESTAMPTZ,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, sku, marketplace_id)
    );

    CREATE INDEX IF NOT EXISTS idx_suspended_listings_user_reason
      ON suspended_listings (user_id, suspended_reason_type);

    CREATE TABLE IF NOT EXISTS research_logs (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      search_type TEXT,
      query TEXT,
      result_count INTEGER NOT NULL DEFAULT 0,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      details JSONB NOT NULL DEFAULT '[]'::jsonb,
      PRIMARY KEY (user_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_research_logs_user_created
      ON research_logs (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_research_logs_user_type_created
      ON research_logs (user_id, search_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS listing_logs (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL,
      total_asin_count INTEGER NOT NULL DEFAULT 0,
      listed_product_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      details JSONB,
      PRIMARY KEY (user_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_listing_logs_user_created
      ON listing_logs (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_listing_logs_user_status_created
      ON listing_logs (user_id, status, created_at DESC);
  `);

  console.log('[Database] PostgreSQL persistence initialized.');
}

module.exports = {
  getPool,
  initDatabase,
  isDatabaseEnabled,
  query,
};
