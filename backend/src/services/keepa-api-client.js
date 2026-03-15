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
    throw new Error('Keepa APIキーが.envファイルに設定されていません。');
  }

  const domainMap = {
    'com': 1,
    'co.jp': 10,
  };
  const domainId = domainMap[marketplaceDomain] || 1;

  console.log(`Keepa API: Getting ASINs for seller ${sellerId} on domain ${marketplaceDomain}`);

  try {
    const response = await axios.get(KEEPA_API_ENDPOINT + '/seller', {
      params: {
        key: apiKey,
        domain: domainId,
        seller: sellerId,
      }
    });

    // Keepa APIのレスポンスは、トークンが枯渇した場合などもエラーではなくステータスコード200で返ってくることがある
    if (response.data && response.data.error) {
        console.error('Keepa API Error:', response.data.error.message);
        throw new Error(`Keepa API Error: ${response.data.error.message}`);
    }

    if (response.data && response.data.sellerAsins) {
      console.log(`Keepa API: Found ${response.data.sellerAsins.length} ASINs.`);
      return response.data.sellerAsins;
    }

    console.log('Keepa API: No ASINs found for the seller.');
    return [];

  } catch (error) {
    // axiosのエラーハンドリング
    if (error.isAxiosError) {
        console.error('Keepa APIへのリクエスト中にエラーが発生しました:', error.response?.data || error.message);
    } else {
        console.error('予期せぬエラーが発生しました:', error);
    }
    throw error;
  }
}

module.exports = {
  getASINsBySellerId,
};

// for testing (一時的なコード)
(async () => {
    try {
        console.log('--- Keepa API Self-Test Started ---');
        const testSellerId = 'A3C2A1P57W82K1'; // AnkerDirectのセラーID (例)
        const testMarketplace = 'com';
        console.log(`Self-Testing Keepa API with seller ID: ${testSellerId} on domain: ${testMarketplace}`);

        const testAsins = await module.exports.getASINsBySellerId(testSellerId, testMarketplace); // module.exports経由で呼び出し
        console.log(`Self-Test Result: Found ${testAsins.length} ASINs for ${testSellerId}`);
        if (testAsins.length > 0) {
            console.log('First 5 ASINs:', testAsins.slice(0, 5));
        } else {
            console.log('No ASINs found in self-test.');
        }
        console.log('--- Keepa API Self-Test Finished ---');
    } catch (error) {
        console.error('--- Keepa API Self-Test Failed ---', error);
    }
})();