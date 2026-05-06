const fs = require('fs/promises');
const path = require('path');

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
  const listingsFile = getListingsFilePath(userId);
  try {
    const data = await fs.readFile(listingsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // ファイルが存在しない場合は空のリストを返す
    }
    console.error(`ユーザー(${userId})の出品中リスト読み込み中にエラーが発生しました:`, error);
    throw error;
  }
}

/**
 * ユーザーの出品中リストを保存
 * @param {string} userId
 * @param {object[]} listings 
 */
async function saveTrackedListings(userId, listings) {
  const listingsFile = getListingsFilePath(userId);
  const userConfigDir = path.dirname(listingsFile);
  try {
    // ユーザーごとのディレクトリがなければ作成
    await fs.mkdir(userConfigDir, { recursive: true });
    await fs.writeFile(listingsFile, JSON.stringify(listings, null, 2), 'utf8');
  } catch (error) {
    console.error(`ユーザー(${userId})の出品中リスト保存中にエラーが発生しました:`, error);
    throw error;
  }
}

async function loadSuspendedListings(userId) {
  const suspendedFile = getSuspendedListingsFilePath(userId);
  try {
    const data = await fs.readFile(suspendedFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error(`ユーザー(${userId})の停止中リスト読み込み中にエラーが発生しました:`, error);
    throw error;
  }
}

async function saveSuspendedListings(userId, listings) {
  const suspendedFile = getSuspendedListingsFilePath(userId);
  const userConfigDir = path.dirname(suspendedFile);
  await fs.mkdir(userConfigDir, { recursive: true });
  await fs.writeFile(suspendedFile, JSON.stringify(listings, null, 2), 'utf8');
}

async function addSuspendedListing(userId, listing, reasonType, reason) {
  const suspendedListings = await loadSuspendedListings(userId);
  const existingIndex = suspendedListings.findIndex(l => l.sku === listing.sku && l.marketplaceId === listing.marketplaceId);
  const suspendedListing = {
    ...listing,
    suspendedReasonType: reasonType,
    suspendedReason: reason,
    suspendedAt: new Date().toISOString(),
  };

  if (existingIndex > -1) {
    suspendedListings[existingIndex] = suspendedListing;
  } else {
    suspendedListings.push(suspendedListing);
  }

  await saveSuspendedListings(userId, suspendedListings);
}

async function removeSuspendedListing(userId, sku, marketplaceId) {
  let suspendedListings = await loadSuspendedListings(userId);
  suspendedListings = suspendedListings.filter(l => !(l.sku === sku && l.marketplaceId === marketplaceId));
  await saveSuspendedListings(userId, suspendedListings);
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
  const listings = await loadTrackedListings(userId);
  const existingIndex = listings.findIndex(l => l.sku === sku && l.marketplaceId === marketplaceId);
  
  const listingData = { sku, asin, marketplaceId, quantity, price, productType };

  if (existingIndex > -1) {
    // 既存の場合は情報を更新
    listings[existingIndex] = listingData;
  } else {
    // 新規の場合は追加
    listings.push(listingData);
  }
  
  await saveTrackedListings(userId, listings);
}

/**
 * ユーザーの出品中リストからSKUを削除
 * @param {string} userId
 * @param {string} sku 
 * @param {string} marketplaceId 
 */
async function removeTrackedListing(userId, sku, marketplaceId) {
  let listings = await loadTrackedListings(userId);
  listings = listings.filter(l => !(l.sku === sku && l.marketplaceId === marketplaceId));
  await saveTrackedListings(userId, listings);
}

/**
 * ASINとユーザーIDから出品中のSKUを取得する
 * @param {string} userId
 * @param {string} asin
 * @returns {Promise<object|undefined>} 該当する出品情報があればオブジェクト、なければundefined
 */
async function getTrackedListingByAsin(userId, asin) {
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
