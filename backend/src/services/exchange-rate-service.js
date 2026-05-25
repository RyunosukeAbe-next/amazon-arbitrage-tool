const axios = require('axios');

const FRANKFURTER_API_BASE = 'https://api.frankfurter.app';
const DEFAULT_REFRESH_INTERVAL_MINUTES = 360;

async function fetchUsdToJpyRate() {
  try {
    // 標準的な /latest エンドポイントを使用
    const response = await axios.get(`${FRANKFURTER_API_BASE}/latest?base=USD&symbols=JPY`, {
      timeout: 10000,
    });

    const rate = Number(response.data?.rates?.JPY);
    if (!Number.isFinite(rate) || rate <= 0) {
      console.error('[fetchUsdToJpyRate] Invalid rate received:', response.data);
      throw new Error('為替レートAPIから有効なUSD/JPYレートを取得できませんでした。');
    }

    return {
      rate,
      date: response.data?.date || null,
      source: 'Frankfurter',
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error.response) {
      console.error(`[fetchUsdToJpyRate] API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`[fetchUsdToJpyRate] Request Error: ${error.message}`);
    }
    throw error;
  }
}

function shouldRefreshExchangeRate(settings, now = new Date()) {
  if (!settings.autoExchangeRateEnabled) {
    return false;
  }

  const intervalMinutes = Number(settings.exchangeRateRefreshIntervalMinutes) || DEFAULT_REFRESH_INTERVAL_MINUTES;
  const updatedAt = settings.exchangeRateUpdatedAt ? new Date(settings.exchangeRateUpdatedAt) : null;

  if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
    return true;
  }

  return now.getTime() - updatedAt.getTime() >= intervalMinutes * 60 * 1000;
}

async function applyLatestExchangeRate(settings) {
  const latest = await fetchUsdToJpyRate();
  return {
    ...settings,
    exchangeRateJpyToUsd: latest.rate,
    exchangeRateUpdatedAt: latest.fetchedAt,
    exchangeRateDate: latest.date,
    exchangeRateSource: latest.source,
  };
}

module.exports = {
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  fetchUsdToJpyRate,
  shouldRefreshExchangeRate,
  applyLatestExchangeRate,
};
