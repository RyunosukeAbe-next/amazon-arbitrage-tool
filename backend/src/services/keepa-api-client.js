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
  const normalizedLimit = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 100000);

  console.log(`[Keepa] Harvesting ASINs for seller: ${cleanSellerId}, Domain: ${domainId}, Limit: ${normalizedLimit}`);

  try {
    // 2026年最新仕様: セラーの全在庫リストを取得するには /seller エンドポイントに storefront=1 を指定する
    // これにより最大10万件のASINリスト (asinList) が1リクエストで取得可能
    const response = await axios.get(`${KEEPA_API_ENDPOINT}/seller`, {
      params: {
        key: apiKey,
        domain: domainId,
        seller: cleanSellerId,
        storefront: 1
      }
    });

    // レスポンスからセラー情報を取得
    const sellerData = response.data?.sellers?.[cleanSellerId] || Object.values(response.data?.sellers || {})[0];

    if (sellerData && sellerData.asinList) {
      const totalFound = sellerData.asinList.length;
      const activeAsins = sellerData.asinList.slice(0, normalizedLimit); 
      console.log(`[SUCCESS] Keepa API: Seller found. Total ${totalFound} ASINs in storefront. Harvesting first ${activeAsins.length} ASINs.`);
      return activeAsins;
    }

    // asinListがない場合、/queryへのフォールバック（小規模セラー用）
    console.log(`[INFO] Keepa API: Storefront list not available for ${cleanSellerId}. Falling back to query API...`);
    const queryRes = await axios.post(`${KEEPA_API_ENDPOINT}/query?key=${apiKey}&domain=${domainId}`, {
      seller: [cleanSellerId]
    });

    if (queryRes.data && queryRes.data.asinList) {
        const asins = queryRes.data.asinList.slice(0, normalizedLimit);
        console.log(`[SUCCESS] Keepa API (Fallback): Found ${queryRes.data.asinList.length} ASINs via query.`);
        return asins;
    }

    console.log(`[INFO] Keepa API: No ASINs found for ${cleanSellerId}.`);
    return [];
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error('[ERROR] Keepa API:', JSON.stringify(errorData, null, 2));
    return [];
  }
}
module.exports = { getASINsBySellerId }
