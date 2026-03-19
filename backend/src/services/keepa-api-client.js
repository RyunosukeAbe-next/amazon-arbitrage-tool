const axios = require('axios');

const KEEPA_API_ENDPOINT = 'https://api.keepa.com';

/**
 * Keepa APIを使用して、セラーIDから出品ASINリストを取得する
 * @param {string} sellerId 
 * @param {string} marketplaceDomain (e.g., 'com', 'co.jp')
 * @returns {Promise<string[]>} ASINの配列
 */

async function getASINsBySellerId(sellerId, marketplaceDomain = 'com') {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    throw new Error('Keepa APIキーが設定されていません。');
  }

  const domainMap = { 'com': 1, 'co.jp': 10 };
  const domainId = domainMap[marketplaceDomain] || 1;
  const cleanSellerId = sellerId.trim();

  try {
    // 修正ポイント：axios.get を axios.post に変更し、大量のASIN取得に対応させます
    const response = await axios.post(`${KEEPA_API_ENDPOINT}/query?key=${apiKey}&domain=${domainId}`, {
      "seller": [cleanSellerId]
    });

    if (response.data && response.data.asinList) {
      // 修正ポイント：取得件数を 150件（必要に応じて調整）に増やします
      const activeAsins = response.data.asinList.slice(0, 10000); 
      console.log(`[SUCCESS] Keepa API: Found ${response.data.asinList.length} ASINs. Using first ${activeAsins.length}.`);
      return activeAsins;
    }

    console.log(`[INFO] Keepa API: No ASINs found for ${cleanSellerId}.`);
    return [];
  } catch (error) {
    console.error('[ERROR] Keepa API:', error.response?.data || error.message);
    return [];
  }
}
module.exports = { getASINsBySellerId }