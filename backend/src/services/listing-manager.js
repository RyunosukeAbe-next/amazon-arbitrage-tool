const path = require('path');
const { readJsonFile, updateJsonFile, writeJsonFileAtomic } = require('./json-file-store');
const { isDatabaseEnabled, query } = require('./database');

// Renderの永続ディスクに対応するため、DATA_DIR環境変数を参照
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');

/**
 * ユーザーIDに基づいた出品リストファイルのパスを取得する
 * @param {string} userId 
 * @returns {string}
 */
function getListingsFilePath(userId) {
    if (!userId) {
        throw new Error('ユーザーIDが必要です。');
    }
    return path.join(CONFIG_DIR, userId, 'listings.json');
}

function getSuspendedListingsFilePath(userId) {
    if (!userId) {
        throw new Error('ユーザーIDが必要です。');
    }
    return path.join(CONFIG_DIR, userId, 'suspended_listings.json');
}

/**
 * ユーザーの出品中リストを取得
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function loadTrackedListings(userId) {
  if (isDatabaseEnabled()) {
    const result = await query(
      `SELECT sku, asin, marketplace_id AS "marketplaceId", quantity, price::float AS price, product_type AS "productType"
       FROM tracked_listings
       WHERE user_id = $1
       ORDER BY updated_at ASC`,
      [userId]
    );
    return result.rows;
  }

  const listingsFile = getListingsFilePath(userId);
  return readJsonFile(listingsFile, []);
}

/**
 * ユーザーの出品中リストを保存
 * @param {string} userId
 * @param {object[]} listings 
 */
async function saveTrackedListings(userId, listings) {
  if (isDatabaseEnabled()) {
    await query('DELETE FROM tracked_listings WHERE user_id = $1', [userId]);
    for (const listing of listings) {
      await addTrackedListing(
        userId,
        listing.sku,
        listing.asin,
        listing.marketplaceId,
        listing.quantity,
        listing.price,
        listing.productType || 'GENERIC'
      );
    }
    return;
  }

  const listingsFile = getListingsFilePath(userId);
  await writeJsonFileAtomic(listingsFile, listings);
}

async function loadSuspendedListings(userId) {
  if (isDatabaseEnabled()) {
    const result = await query(
      `SELECT data
       FROM suspended_listings
       WHERE user_id = $1
       ORDER BY updated_at ASC`,
      [userId]
    );
    return result.rows.map(row => row.data);
  }

  const suspendedFile = getSuspendedListingsFilePath(userId);
  return readJsonFile(suspendedFile, []);
}

async function saveSuspendedListings(userId, listings) {
  if (isDatabaseEnabled()) {
    await query('DELETE FROM suspended_listings WHERE user_id = $1', [userId]);
    for (const listing of listings) {
      await addSuspendedListing(
        userId,
        listing,
        listing.suspendedReasonType,
        listing.suspendedReason
      );
    }
    return;
  }

  const suspendedFile = getSuspendedListingsFilePath(userId);
  await writeJsonFileAtomic(suspendedFile, listings);
}

async function addSuspendedListing(userId, listing, reasonType, reason) {
  const suspendedListing = {
    ...listing,
    suspendedReasonType: reasonType,
    suspendedReason: reason,
    suspendedAt: new Date().toISOString(),
  };

  if (isDatabaseEnabled()) {
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
        suspendedListing.sku,
        suspendedListing.marketplaceId,
        suspendedListing.asin,
        reasonType,
        reason,
        suspendedListing.suspendedAt,
        suspendedListing
      ]
    );
    return;
  }

  await updateJsonFile(getSuspendedListingsFilePath(userId), [], suspendedListings => {
    const existingIndex = suspendedListings.findIndex(l => l.sku === listing.sku && l.marketplaceId === listing.marketplaceId);

    if (existingIndex > -1) {
      suspendedListings[existingIndex] = suspendedListing;
      return suspendedListings;
    }

    return [...suspendedListings, suspendedListing];
  });
}

async function removeSuspendedListing(userId, sku, marketplaceId) {
  if (isDatabaseEnabled()) {
    await query(
      'DELETE FROM suspended_listings WHERE user_id = $1 AND sku = $2 AND marketplace_id = $3',
      [userId, sku, marketplaceId]
    );
    return;
  }

  await updateJsonFile(getSuspendedListingsFilePath(userId), [], suspendedListings => (
    suspendedListings.filter(l => !(l.sku === sku && l.marketplaceId === marketplaceId))
  ));
}

/**
 * ユーザーの出品中リストにSKUを追加
 * @param {string} userId
 * @param {string} sku 
 * @param {string} asin 
 * @param {string} marketplaceId 
 * @param {number} quantity
 * @param {number} price
 * @param {string} productType
 */
async function addTrackedListing(userId, sku, asin, marketplaceId, quantity, price, productType = 'GENERIC') {
  const listingData = { sku, asin, marketplaceId, quantity, price, productType };

  if (isDatabaseEnabled()) {
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
      [userId, sku, marketplaceId, asin, quantity, price, productType, listingData]
    );
    return;
  }

  await updateJsonFile(getListingsFilePath(userId), [], listings => {
    const existingIndex = listings.findIndex(l => l.sku === sku && l.marketplaceId === marketplaceId);

    if (existingIndex > -1) {
      // 既存の場合は情報を更新
      listings[existingIndex] = listingData;
      return listings;
    }

    // 新規の場合は追加
    return [...listings, listingData];
  });
}

/**
 * ユーザーの出品中リストからSKUを削除
 * @param {string} userId
 * @param {string} sku 
 * @param {string} marketplaceId 
 */
async function removeTrackedListing(userId, sku, marketplaceId) {
  if (isDatabaseEnabled()) {
    await query(
      'DELETE FROM tracked_listings WHERE user_id = $1 AND sku = $2 AND marketplace_id = $3',
      [userId, sku, marketplaceId]
    );
    return;
  }

  await updateJsonFile(getListingsFilePath(userId), [], listings => (
    listings.filter(l => !(l.sku === sku && l.marketplaceId === marketplaceId))
  ));
}

/**
 * ASINとユーザーIDから出品中のSKUを取得する
 * @param {string} userId
 * @param {string} asin
 * @returns {Promise<object|undefined>} 該当する出品情報があればオブジェクト、なければundefined
 */
async function getTrackedListingByAsin(userId, asin) {
    if (isDatabaseEnabled()) {
        const result = await query(
          `SELECT sku, asin, marketplace_id AS "marketplaceId", quantity, price::float AS price, product_type AS "productType"
           FROM tracked_listings
           WHERE user_id = $1 AND asin = $2
           LIMIT 1`,
          [userId, asin]
        );
        return result.rows[0];
    }

    const listings = await loadTrackedListings(userId);
    return listings.find(listing => listing.asin === asin);
}

/**
 * ユーザーの全ての出品中リストを取得する
 * @param {string} userId
 * @returns {Promise<object[]>} 全ての出品情報
 */
async function getAllTrackedListings(userId) {
    return loadTrackedListings(userId);
}

module.exports = {
  loadTrackedListings,
  saveTrackedListings, // saveTrackedListingsもエクスポートに追加
  loadSuspendedListings,
  saveSuspendedListings,
  addTrackedListing,
  removeTrackedListing,
  addSuspendedListing,
  removeSuspendedListing,
  getTrackedListingByAsin, // 追加
  getAllTrackedListings,    // 追加
};
