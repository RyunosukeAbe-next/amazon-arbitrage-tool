const path = require('path');
const fs = require('fs/promises');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { initDatabase, query } = require('../src/services/database');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(DATA_DIR, 'config');

async function readJson(filePath, defaultValue = null) {
  try {
    let data = await fs.readFile(filePath, 'utf8');
    if (data.charCodeAt(0) === 0xFEFF) {
      data = data.slice(1);
    }
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultValue;
    }
    throw error;
  }
}

async function migrateUsers() {
  const users = await readJson(path.join(CONFIG_DIR, 'users.json'), []);
  for (const user of users) {
    if (!user.id || !user.username || !user.password) continue;
    await query(
      `INSERT INTO app_users (id, username, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash`,
      [user.id, user.username, user.password]
    );
  }
  return users.length;
}

async function migrateUserDirectory(userDirent) {
  const userId = userDirent.name;
  const userDir = path.join(CONFIG_DIR, userId);

  const settings = await readJson(path.join(userDir, 'settings.json'));
  if (settings) {
    await query(
      `INSERT INTO user_settings (user_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [userId, settings]
    );
  }

  const amazonAuth = await readJson(path.join(userDir, 'amazon_auth.json'));
  if (amazonAuth) {
    await query(
      `INSERT INTO amazon_auth (user_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [userId, amazonAuth]
    );
  }

  const listings = await readJson(path.join(userDir, 'listings.json'), []);
  for (const listing of listings) {
    if (!listing.sku || !listing.marketplaceId || !listing.asin) continue;
    await query(
      `INSERT INTO tracked_listings (
         user_id, sku, marketplace_id, asin, quantity, price, product_type, data, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, sku, marketplace_id) DO UPDATE SET
         asin = EXCLUDED.asin,
         quantity = EXCLUDED.quantity,
         price = EXCLUDED.price,
         product_type = EXCLUDED.product_type,
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [
        userId,
        listing.sku,
        listing.marketplaceId,
        listing.asin,
        listing.quantity || 1,
        listing.price || 0,
        listing.productType || 'GENERIC',
        listing,
      ]
    );
  }

  const suspendedListings = await readJson(path.join(userDir, 'suspended_listings.json'), []);
  for (const listing of suspendedListings) {
    if (!listing.sku || !listing.marketplaceId || !listing.asin) continue;
    await query(
      `INSERT INTO suspended_listings (
         user_id, sku, marketplace_id, asin, suspended_reason_type, suspended_reason, suspended_at, data, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, sku, marketplace_id) DO UPDATE SET
         asin = EXCLUDED.asin,
         suspended_reason_type = EXCLUDED.suspended_reason_type,
         suspended_reason = EXCLUDED.suspended_reason,
         suspended_at = EXCLUDED.suspended_at,
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [
        userId,
        listing.sku,
        listing.marketplaceId,
        listing.asin,
        listing.suspendedReasonType || null,
        listing.suspendedReason || null,
        listing.suspendedAt || null,
        listing,
      ]
    );
  }

  const researchLogs = await readJson(path.join(userDir, 'research_logs', 'logs.json'), []);
  for (const log of researchLogs) {
    const details = await readJson(path.join(userDir, 'research_logs', `${log.id}.json`), []);
    await query(
      `INSERT INTO research_logs (
         user_id, id, created_at, search_type, query, result_count, meta, details
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, id) DO UPDATE SET
         created_at = EXCLUDED.created_at,
         search_type = EXCLUDED.search_type,
         query = EXCLUDED.query,
         result_count = EXCLUDED.result_count,
         meta = EXCLUDED.meta,
         details = EXCLUDED.details`,
      [
        userId,
        log.id,
        log.createdAt || new Date().toISOString(),
        log.searchType || null,
        log.query || null,
        log.resultCount || (Array.isArray(details) ? details.length : 0),
        log,
        details,
      ]
    );
  }

  const listingLogs = await readJson(path.join(userDir, 'listing_logs', 'listing_logs.json'), []);
  for (const log of listingLogs) {
    const details = await readJson(path.join(userDir, 'listing_logs', `${log.id}.json`), null);
    await query(
      `INSERT INTO listing_logs (
         user_id, id, title, status, total_asin_count, listed_product_count, summary,
         created_at, updated_at, meta, details
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, id) DO UPDATE SET
         title = EXCLUDED.title,
         status = EXCLUDED.status,
         total_asin_count = EXCLUDED.total_asin_count,
         listed_product_count = EXCLUDED.listed_product_count,
         summary = EXCLUDED.summary,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at,
         meta = EXCLUDED.meta,
         details = EXCLUDED.details`,
      [
        userId,
        log.id,
        log.title || null,
        log.status || 'completed',
        log.totalAsinCount || 0,
        log.listedProductCount || 0,
        log.summary || null,
        log.createdAt || new Date().toISOString(),
        log.updatedAt || null,
        log,
        details,
      ]
    );
  }

  return {
    userId,
    settings: Boolean(settings),
    amazonAuth: Boolean(amazonAuth),
    listings: listings.length,
    suspendedListings: suspendedListings.length,
    researchLogs: researchLogs.length,
    listingLogs: listingLogs.length,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URLを設定してから実行してください。');
  }

  await initDatabase();

  const userCount = await migrateUsers();
  const dirents = await fs.readdir(CONFIG_DIR, { withFileTypes: true });
  const userDirs = dirents.filter(dirent => dirent.isDirectory() && dirent.name.startsWith('user_'));
  const results = [];

  for (const userDir of userDirs) {
    results.push(await migrateUserDirectory(userDir));
  }

  console.log(JSON.stringify({ users: userCount, migratedUserDirs: results }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
