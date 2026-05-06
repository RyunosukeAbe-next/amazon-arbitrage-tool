const axios = require('axios');

const FRANKFURTER_API_BASE = 'https://api.frankfurter.dev';
const DEFAULT_REFRESH_INTERVAL_MINUTES = 360;

async function fetchUsdToJpyRate() {
  const response = await axios.get(`${FRANKFURTER_API_BASE}/v2/rate/USD/JPY`, {
    timeout: 10000,
  });

  const rate = Number(response.data?.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('為替レートAPIから有効なUSD/JPYレートを取得できませんでした。');
  }

  return {
    rate,
    date: response.data?.date || null,
    source: 'Frankfurter',
    fetchedAt: new Date().toISOString(),
  };
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
