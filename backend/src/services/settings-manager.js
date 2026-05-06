const fs = require('fs/promises');
const path = require('path');
const { applyLatestExchangeRate, shouldRefreshExchangeRate, DEFAULT_REFRESH_INTERVAL_MINUTES } = require('./exchange-rate-service');

// Renderの永続ディスクに対応するため、DATA_DIR環境変数を参照
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const cloneDefaultShippingCostTiers = () => DEFAULT_SETTINGS.shippingCostTiers.map(tier => ({ ...tier }));
const DEFAULT_SETTINGS = {
  domesticShippingCostPerItem: 500,
  internationalShippingFscRate: 0.204,
  internationalShippingFixedFeeJpy: 220,
  customsDutyRate: 0.05,
  amazonFeeRate: 0.15,
  exchangeRateJpyToUsd: 150,
  autoExchangeRateEnabled: true,
  exchangeRateRefreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES,
  exchangeRateUpdatedAt: null,
  exchangeRateDate: null,
  exchangeRateSource: null,
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
    { fromWeight: 0, toWeight: 500, cost: 2370 },
    { fromWeight: 501, toWeight: 1000, cost: 2850 },
    { fromWeight: 1001, toWeight: 1500, cost: 3340 },
    { fromWeight: 1501, toWeight: 2000, cost: 3980 },
    { fromWeight: 2001, toWeight: 2500, cost: 4760 },
    { fromWeight: 2501, toWeight: 3000, cost: 5350 },
    { fromWeight: 3001, toWeight: 3500, cost: 5870 },
    { fromWeight: 3501, toWeight: 4000, cost: 6400 },
    { fromWeight: 4001, toWeight: 4500, cost: 6930 },
    { fromWeight: 4501, toWeight: 5000, cost: 7680 },
    { fromWeight: 5001, toWeight: 5500, cost: 8230 },
    { fromWeight: 5501, toWeight: 6000, cost: 8770 },
    { fromWeight: 6001, toWeight: 6500, cost: 9310 },
    { fromWeight: 6501, toWeight: 7000, cost: 9850 },
    { fromWeight: 7001, toWeight: 7500, cost: 10300 },
    { fromWeight: 7501, toWeight: 8000, cost: 10800 },
    { fromWeight: 8001, toWeight: 8500, cost: 11350 },
    { fromWeight: 8501, toWeight: 9000, cost: 11850 },
    { fromWeight: 9001, toWeight: 9500, cost: 12280 },
    { fromWeight: 9501, toWeight: 10000, cost: 14450 },
    { fromWeight: 10001, toWeight: 10500, cost: 15470 },
    { fromWeight: 10501, toWeight: 11000, cost: 16130 },
    { fromWeight: 11001, toWeight: 11500, cost: 16750 },
    { fromWeight: 11501, toWeight: 12000, cost: 17980 },
    { fromWeight: 12001, toWeight: 12500, cost: 18490 },
    { fromWeight: 12501, toWeight: 13000, cost: 19170 },
    { fromWeight: 13001, toWeight: 13500, cost: 19810 },
    { fromWeight: 13501, toWeight: 14000, cost: 20440 },
    { fromWeight: 14001, toWeight: 14500, cost: 20970 },
    { fromWeight: 14501, toWeight: 15000, cost: 21770 },
    { fromWeight: 15001, toWeight: 15500, cost: 22440 },
    { fromWeight: 15501, toWeight: 16000, cost: 22970 },
    { fromWeight: 16001, toWeight: 16500, cost: 23570 },
    { fromWeight: 16501, toWeight: 17000, cost: 24260 },
    { fromWeight: 17001, toWeight: 17500, cost: 24880 },
    { fromWeight: 17501, toWeight: 18000, cost: 25410 },
    { fromWeight: 18001, toWeight: 18500, cost: 26070 },
    { fromWeight: 18501, toWeight: 19000, cost: 26720 },
    { fromWeight: 19001, toWeight: 19500, cost: 27270 },
    { fromWeight: 19501, toWeight: 20000, cost: 27960 },
    { fromWeight: 20001, toWeight: 20500, cost: 28660 },
    { fromWeight: 20501, toWeight: 21000, cost: 29190 },
    { fromWeight: 21001, toWeight: 21500, cost: 29810 },
    { fromWeight: 21501, toWeight: 22000, cost: 30500 },
    { fromWeight: 22001, toWeight: 22500, cost: 31110 },
    { fromWeight: 22501, toWeight: 23000, cost: 31640 },
    { fromWeight: 23001, toWeight: 23500, cost: 32270 },
    { fromWeight: 23501, toWeight: 24000, cost: 32960 },
    { fromWeight: 24001, toWeight: 24500, cost: 33500 },
    { fromWeight: 24501, toWeight: 25000, cost: 34220 },
    { fromWeight: 25001, toWeight: 25500, cost: 34810 },
    { fromWeight: 25501, toWeight: 26000, cost: 35530 },
    { fromWeight: 26001, toWeight: 26500, cost: 36060 },
    { fromWeight: 26501, toWeight: 27000, cost: 36680 },
    { fromWeight: 27001, toWeight: 27500, cost: 37260 },
    { fromWeight: 27501, toWeight: 28000, cost: 37930 },
    { fromWeight: 28001, toWeight: 28500, cost: 38460 },
    { fromWeight: 28501, toWeight: 29000, cost: 39090 },
    { fromWeight: 29001, toWeight: 29500, cost: 39720 },
    { fromWeight: 29501, toWeight: 30000, cost: 40310 }
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
    let settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    if (!Array.isArray(settings.shippingCostTiers) || settings.shippingCostTiers.length === 0) {
      settings.shippingCostTiers = cloneDefaultShippingCostTiers();
    }

    if (shouldRefreshExchangeRate(settings)) {
      try {
        settings = await applyLatestExchangeRate(settings);
        await saveSettings(userId, settings);
      } catch (error) {
        console.error(`ユーザー(${userId})の為替レート自動更新に失敗しました:`, error.message);
      }
    }

    return settings;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // ファイルが存在しない場合、デフォルト設定をそのユーザー用に保存して返す
      let settings = { ...DEFAULT_SETTINGS };
      try {
        settings = await applyLatestExchangeRate(settings);
      } catch (rateError) {
        console.error(`ユーザー(${userId})の初期為替レート取得に失敗しました:`, rateError.message);
      }
      await saveSettings(userId, settings);
      return settings;
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
