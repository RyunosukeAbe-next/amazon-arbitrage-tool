const fs = require('fs/promises');
const path = require('path');

const CONFIG_DIR = path.resolve(__dirname, '../../config');
const DEFAULT_SETTINGS = {
  internationalShippingRatePerKg: 1000,
  domesticShippingCostPerItem: 500,
  customsDutyRate: 0.05,
  amazonFeeRate: 0.15,
  exchangeRateJpyToUsd: 150, // 1ドルあたりの円
  inventoryThreshold: 1,
  excludedAsins: [],
  excludedBrands: [],
  excludedKeywords: []
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
