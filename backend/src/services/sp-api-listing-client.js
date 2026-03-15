const SpApi = require('amazon-sp-api');

/**
 * SP-APIクライアントを初期化し、返す
 * @param {string} marketplaceId マーケットプレイスID (例: 'ATVPDKIKX0DER' for US)
 * @returns {SpApi} SP-APIクライアントインスタンス
 */
function getSpApiClient(marketplaceId) {
    const region = marketplaceId === 'ATVPDKIKX0DER' ? process.env.SPAPI_REGION_US : process.env.SPAPI_REGION_JP;
    const endpoint = marketplaceId === 'ATVPDKIKX0DER' ? process.env.SPAPI_ENDPOINT_US : process.env.SPAPI_ENDPOINT_JP;
    const refreshToken = marketplaceId === 'ATVPDKIKX0DER' ? process.env.SPAPI_REFRESH_TOKEN_US : process.env.SPAPI_REFRESH_TOKEN_JP;

    const spApiConfig = {
        region: region,
        endpoint: endpoint,
        credentials: {
            aws_access_key_id: process.env.SPAPI_AWS_ACCESS_KEY_ID,
            aws_secret_access_key: process.env.SPAPI_AWS_SECRET_ACCESS_KEY,
            role_arn: process.env.SPAPI_ROLE_ARN,
        },
        refresh_token: refreshToken,
    };

    if (!spApiConfig.refresh_token || !spApiConfig.credentials.aws_access_key_id) {
        throw new Error(`SP-APIの認証情報が.envファイルに設定されていません。マーケットプレイス: ${marketplaceId}`);
    }

    return new SpApi(spApiConfig);
}

/**
 * 商品を出品する（相乗り出品）
 * @param {string} asin ASIN
 * @param {string} sku SKU (出品者が管理する在庫管理コード)
 * @param {number} price 価格
 * @param {number} quantity 数量
 * @param {string} marketplaceId 出品先のマーケットプレイスID
 * @returns {Promise<object>} 出品結果
 */
async function putListingsItem(asin, sku, price, quantity, marketplaceId) {
    console.log(`SP-API Listing: Attempting to list ASIN ${asin} on ${marketplaceId}`);
    
    // 現在はダミーの成功レスポンスを返す
    // TODO: 実際のSP-API (putListingsItem) を呼び出す
    if (!asin || !sku || !price || !quantity || !marketplaceId) {
        throw new Error('出品に必要な情報が不足しています。');
    }

    // ダミーでランダムな成功/失敗を返す
    const success = Math.random() > 0.2; // 80%の確率で成功
    if (success) {
        return {
            status: 'SUCCESS',
            asin: asin,
            sku: sku,
            message: `ASIN ${asin} がSKU ${sku} で出品されました。（ダミー）`,
        };
    } else {
        throw new Error(`ASIN ${asin} の出品に失敗しました。（ダミー）`);
    }
}

/**
 * 商品の出品を削除する
 * @param {string} sku 削除するSKU
 * @param {string} marketplaceId 削除対象のマーケットプレイスID
 * @returns {Promise<object>} 削除結果
 */
async function deleteListingsItem(sku, marketplaceId) {
    console.log(`SP-API Listing: Attempting to delete SKU ${sku} on ${marketplaceId}`);
    
    // 現在はダミーの成功レスポンスを返す
    // TODO: 実際のSP-API (deleteListingsItem) を呼び出す
    if (!sku || !marketplaceId) {
        throw new Error('出品削除に必要な情報が不足しています。');
    }

    const success = Math.random() > 0.2; // 80%の確率で成功
    if (success) {
        return {
            status: 'SUCCESS',
            sku: sku,
            message: `SKU ${sku} の出品が削除されました。（ダミー）`,
        };
    } else {
        throw new Error(`SKU ${sku} の出品削除に失敗しました。（ダミー）`);
    }
}


module.exports = {
    putListingsItem,
    deleteListingsItem,
};
