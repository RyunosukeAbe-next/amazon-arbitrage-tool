const axios = require('axios');

const KEEPA_API_ENDPOINT = 'https://api.keepa.com';

/**
 * Keepa APIを使用して、セラーIDから出品ASINリストを取得する
 * @param {string} sellerId 
 * @param {string} marketplaceDomain (e.g., 'com', 'co.jp')
 * @returns {Promise<string[]>} ASINの配列
 */

async function getASINsBySellerId(sellerId, marketplaceDomain = 'com', limit = 1000) {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    throw new Error('Keepa APIキーが設定されていません。');
  }

  const domainMap = { 'com': 1, 'co.jp': 10 };
  const domainId = domainMap[marketplaceDomain] || 1;
  const cleanSellerId = sellerId.trim();
  const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 10000);

  console.log(`[Keepa] Requesting ASINs for seller: ${cleanSellerId}, Domain: ${domainId}, Limit: ${normalizedLimit}`);

  try {
    // query API を使用してセラーの全ASINリストを取得
    const response = await axios.get(`${KEEPA_API_ENDPOINT}/query?key=${apiKey}&domain=${domainId}&seller=${cleanSellerId}`);

    if (response.data && response.data.asinList) {
      const totalFound = response.data.asinList.length;
      const activeAsins = response.data.asinList.slice(0, normalizedLimit); 
      console.log(`[SUCCESS] Keepa API: Found total ${totalFound} ASINs. Harvesting first ${activeAsins.length} ASINs based on limit.`);
      return activeAsins;
    }

    console.log(`[INFO] Keepa API: No ASINs found for seller ${cleanSellerId}. Response:`, JSON.stringify(response.data));
    return [];
  } catch (error) {
    console.error('[ERROR] Keepa API:', error.response?.data || error.message);
    return [];
  }
}
module.exports = { getASINsBySellerId }
