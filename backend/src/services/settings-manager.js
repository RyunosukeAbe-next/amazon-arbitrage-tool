const fs = require('fs/promises');
const path = require('path');

// Renderの永続ディスクに対応するため、DATA_DIR環境変数を参照
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const DEFAULT_SETTINGS = {
  domesticShippingCostPerItem: 500,
  customsDutyRate: 0.05,
  amazonFeeRate: 0.15,
  exchangeRateJpyToUsd: 150,
  inventoryThreshold: 1,
  excludedAsins: [],
  excludedBrands: [],
  excludedKeywords: [],
  profitabilityTiers: [
    { fromPrice: 0, toPrice: 1000, minProfitRate: 25, minProfitAmount: 200 },
    { fromPrice: 1001, toPrice: 2000, minProfitRate: 20, minProfitAmount: 400 },
    { fromPrice: 2001, toPrice: 3000, minProfitRate: 18, minProfitAmount: 500 },
    { fromPrice: 3001, toPrice: 5000, minProfitRate: 15, minProfitAmount: 700 },
    { fromPrice: 5001, toPrice: 10000, minProfitRate: 12, minProfitAmount: 1000 },
    { fromPrice: 10001, toPrice: 999999, minProfitRate: 10, minProfitAmount: 1500 }
  ],
  shippingCostTiers: [
    { fromWeight: 0, toWeight: 500, cost: 2000 },
    { fromWeight: 501, toWeight: 1000, cost: 2800 },
    { fromWeight: 1001, toWeight: 2000, cost: 4000 }
  ]
};

/**
 * ユーザーIDに基づいた設定ファイルのパスを取得する
 * @param {string} userId 
 * @returns {string}
 */
function getSettingsFilePath(userId) {
    if (!userId) {
        throw new Error('ユーザーIDが必要です。');
    }
    return path.join(CONFIG_DIR, userId, 'settings.json');
}

/**
 * ユーザーの設定を読み込む
 * @param {string} userId 
 * @returns {Promise<object>}
 */
async function loadSettings(userId) {
  const settingsFile = getSettingsFilePath(userId);
  try {
    const data = await fs.readFile(settingsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // ファイルが存在しない場合、デフォルト設定をそのユーザー用に保存して返す
      await saveSettings(userId, DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    console.error(`ユーザー(${userId})の設定ファイル読み込み中にエラーが発生しました:`, error);
    throw error;
  }
}

/**
 * ユーザーの設定を保存する
 * @param {string} userId 
 * @param {object} settings 
 */
async function saveSettings(userId, settings) {
  const settingsFile = getSettingsFilePath(userId);
  const userConfigDir = path.dirname(settingsFile);
  try {
    // ユーザーごとのディレクトリがなければ作成
    await fs.mkdir(userConfigDir, { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.error(`ユーザー(${userId})の設定ファイル保存中にエラーが発生しました:`, error);
    throw error;
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
};
