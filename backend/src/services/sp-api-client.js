const SpApi = require('amazon-sp-api');
const amazonAuthService = require('./amazon-auth-service'); // ★ 追加

// isAccessTokenExpired の実装
function isAccessTokenExpired(authData) {
    if (!authData.accessToken || !authData.issuedAt || !authData.expiresIn) {
        return true;
    }
    const now = Date.now();
    const expiryTime = authData.issuedAt + (authData.expiresIn * 1000);
    const buffer = 5 * 60 * 1000; // 5分前のバッファ
    return now > (expiryTime - buffer);
}

/**
 * SP-APIクライアントを初期化し、返す
 * @param {string} marketplaceId マーケットプレイスID
 * @param {string} userId ユーザーID
 * @returns {SpApi} SP-APIクライアントインスタンス
 */
async function getSpApiClient(marketplaceId, userId) {
    const authData = await amazonAuthService.loadUserAmazonAuth(userId);
    if (!authData || !authData.refreshToken || !authData.sellingPartnerId) {
        throw new Error(`User ${userId} has not linked their Amazon account or missing required auth data.`);
    }

    let accessToken = authData.accessToken;
    // アクセストークンが期限切れ、または存在しない場合は更新
    if (isAccessTokenExpired(authData)) {
        console.log(`[User ${userId}] Access token expired or missing. Refreshing...`);
        const newTokens = await amazonAuthService.refreshAccessToken(authData.refreshToken);
        accessToken = newTokens.accessToken;
        // 更新されたアクセストークンと有効期限、発行時刻を保存
        await amazonAuthService.saveUserAmazonAuth(userId, { 
            ...authData, 
            accessToken: newTokens.accessToken, 
            expiresIn: newTokens.expiresIn,
            issuedAt: newTokens.issuedAt
        });
    }

    const spApiRegion = marketplaceId === 'ATVPDKIKX0DER' ? 'na' : 'fe';

    const spApiConfig = {
        region: spApiRegion,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: process.env.SELLING_PARTNER_APP_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SELLING_PARTNER_APP_CLIENT_SECRET,
            AWS_ACCESS_KEY_ID: process.env.SPAPI_AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: process.env.SPAPI_AWS_SECRET_ACCESS_KEY,
            AWS_SELLING_PARTNER_ROLE: process.env.SPAPI_ROLE_ARN,
        },
        refresh_token: authData.refreshToken, // ユーザー固有のリフレッシュトークンを使用
        access_token: accessToken, // 更新されたアクセストークンを使用
        selling_partner_id: authData.sellingPartnerId, // ユーザー固有のSelling Partner IDを使用
    };

    if (!spApiConfig.refresh_token || !spApiConfig.credentials.AWS_ACCESS_KEY_ID || !spApiConfig.credentials.SELLING_PARTNER_APP_CLIENT_ID) {
        throw new Error(`SP-APIの認証情報が.envファイルに不足しています。`);
    }

    return new SpApi(spApiConfig);
}

/**
 * キーワードで商品を検索する
 * @param {string[]} keywords 検索キーワードの配列
 * @param {string} marketplaceId 検索対象のマーケットプレイスID
 * @param {function} isCancelled キャンセルチェック関数
 * @returns {Promise<object[]>} 商品情報の配列
 */
async function searchProductsByKeywords(keywords, marketplaceId, userId, classificationId = null, isCancelled = () => false) {
    let logPrefix = `SP-API Client (Keywords: '${keywords}'`;
    if (classificationId) {
        logPrefix += `, Classification: '${classificationId}'`;
    }
    logPrefix += `):`;
    console.log(`${logPrefix} Searching in marketplace '${marketplaceId}'`);
    
    const spApiClient = await getSpApiClient(marketplaceId, userId);
    let allProducts = [];
    let nextToken = undefined;
    const MAX_RESULTS = 1000;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let page = 1;

    do {
        if (isCancelled()) {
            console.log(`${logPrefix} Search cancelled by client.`);
            break;
        }

        const queryParams = {
            keywords: keywords.join(','),
            marketplaceIds: marketplaceId,
            includedData: 'summaries',
            pageSize: 20,
        };

        if (classificationId) {
            queryParams.classificationIds = classificationId;
        }

        if (nextToken) {
            queryParams.nextToken = nextToken;
        }

        try {
            await sleep(1000); 
            
            console.log(`${logPrefix} Fetching page ${page}... (Total: ${allProducts.length})`);
            const res = await spApiClient.callAPI({
                method: 'GET',
                api_path: '/catalog/2022-04-01/items',
                query: queryParams,
            });

            if (res.items && res.items.length > 0) {
                const products = res.items.map(item => ({
                    asin: item.asin,
                    productName: item.summaries?.[0]?.itemName || 'N/A',
                    brand: item.summaries?.[0]?.brand || 'N/A',
                }));
                allProducts = allProducts.concat(products);
            }
            
            nextToken = res.pagination?.nextToken;
            page++;

        } catch (error) {
            console.error(`${logPrefix} ページネーション処理中にエラーが発生しました:`, error);
            nextToken = undefined;
        }

    } while (nextToken && allProducts.length < MAX_RESULTS);
    
    const finalResults = allProducts.slice(0, MAX_RESULTS);
    console.log(`${logPrefix} Found ${finalResults.length} products in total.`);
    return finalResults;
}

/**
 * 複数のASINの競合価格情報を取得する
 * @param {string[]} asins ASINの配列
 * @param {string} marketplaceId 取得対象のマーケットプレイスID
 * @param {function} isCancelled キャンセルチェック関数
 * @returns {Promise<object>} ASINをキーとした価格と出品者数のオブジェクト
 */
async function getCompetitivePricingForAsins(asins, marketplaceId, userId, isCancelled = () => false) {
    if (!asins || asins.length === 0) {
        return {};
    }
    console.log(`SP-API Pricing: Getting prices for ${asins.length} ASINs in ${marketplaceId}`);
    
    const spApiClient = await getSpApiClient(marketplaceId, userId);
    const allPricing = {};

    const chunkSize = 20;
    for (let i = 0; i < asins.length; i += chunkSize) {
        if (isCancelled()) {
            console.log(`SP-API Pricing: Process cancelled by client.`);
            break;
        }
        const chunk = asins.slice(i, i + chunkSize);
        
        try {
            const res = await spApiClient.callAPI({
                method: 'GET',
                api_path: '/products/pricing/v0/competitivePrice',
                query: {
                    MarketplaceId: marketplaceId,
                    Asins: chunk.join(','),
                    ItemType: 'Asin',
                },
            });

            if (Array.isArray(res)) {
                for (const result of res) { 
                    if (result.status === 'Success' && result.Product) {
                        const competitivePrices = competitivePricing?.CompetitivePrices || [];
                        const newPriceObject = competitivePrices.find(p => p.condition === 'New');
                        const landedPrice = newPriceObject?.Price?.LandedPrice?.Amount;

                        const offerListings = competitivePricing?.NumberOfOfferListings || [];
                        const newOffer = offerListings.find(offer => offer.condition === 'New');
                        const sellerCount = newOffer ? newOffer.Count : 0;

                        if (landedPrice !== undefined) {
                            allPricing[result.ASIN] = {
                                price: landedPrice,
                                sellerCount: sellerCount,
                            };
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`SP-API Pricing (${marketplaceId}) のチャンク処理中にエラーが発生しました:`, error);
        }
    }
    
    console.log(`SP-API Pricing: Found prices for ${Object.keys(allPricing).length} ASINs in ${marketplaceId}.`);
    return allPricing;
}

/**
 * 単一のASINの商品カタログ属性を取得する
 * @param {string} asin ASIN
 * @param {string} marketplaceId 取得対象のマーケットプレイスID
 * @returns {Promise<object | null>} 商品属性オブジェクト、見つからない場合はnull
 */
async function getCatalogItemAttributes(asin, marketplaceId, userId) {
    console.log(`SP-API Catalog: Getting attributes for ASIN ${asin} in ${marketplaceId}`);
    
    const spApiClient = await getSpApiClient(marketplaceId, userId);

    try {
        const res = await spApiClient.callAPI({
            method: 'GET',
            api_path: `/catalog/2022-04-01/items/${asin}`,
            query: {
                marketplaceIds: marketplaceId,
                includedData: 'attributes,summaries', // summariesを追加
            },
        });

        const attributes = {};
        if (res.summaries && res.summaries.length > 0) {
            attributes.productName = res.summaries[0].itemName || 'N/A';
            attributes.brand = res.summaries[0].brand || 'N/A';
        }

        if (res.attributes && res.attributes.item_package_weight) {
            const weightData = res.attributes.item_package_weight[0];
            if (weightData && weightData.value > 0) {
                attributes.weight = {
                    value: weightData.value,
                    unit: weightData.unit,
                };
            }
        }
        
        if (Object.keys(attributes).length > 0) {
            return attributes;
        }

        console.warn(`SP-API Catalog: Could not find relevant attributes for ASIN ${asin}.`);
        return null;

    } catch (error) {
        if (error.statusCode === 404) {
            console.log(`SP-API Catalog: ASIN ${asin} not found in ${marketplaceId}.`);
            return null;
        }
        console.error(`SP-API Catalog (${marketplaceId}) for ASIN ${asin} の呼び出し中にエラーが発生しました:`, error);
        return null;
    }
}


// (他のダミー関数は変更なし)
async function putListingsItem(asin, sku, price, quantity, marketplaceId, userId) {
    console.log(`SP-API Listing: Attempting to list ASIN ${asin} on ${marketplaceId}`);
    if (!asin || !sku || !price || !quantity || !marketplaceId) {
        throw new Error('出品に必要な情報が不足しています。');
    }
    const spApiClient = await getSpApiClient(marketplaceId, userId);

    try {
        const result = await spApiClient.callAPI({
            method: 'PUT',
            api_path: `/listings/2021-08-01/items/${sku}`,
            query: {
                marketplaceIds: marketplaceId,
                issueLocale: marketplaceId === 'ATVPDKIKX0DER' ? 'en_US' : 'ja_JP'
            },
            data: {
                productType: 'PRODUCT', 
                requirements: 'LISTING_OFFER_ONLY',
                attributes: {
                    merchant_suggested_asin: [
                        {
                            value: asin,
                            marketplace_id: marketplaceId
                        }
                    ],
                    condition_type: [
                        {
                            value: "new_new",
                            marketplace_id: marketplaceId
                        }
                    ],
                    purchasable_offer: [
                        {
                            marketplace_id: marketplaceId,
                            currency: marketplaceId === 'ATVPDKIKX0DER' ? 'USD' : 'JPY',
                            our_price: [
                                {
                                    schedule: [
                                        {
                                            value_with_tax: price
                                        }
                                    ]
                                }
                            ]
                        }
                    ],
                    fulfillment_availability: [
                        {
                            fulfillment_channel_code: "DEFAULT",
                            quantity: quantity
                        }
                    ]
                }
            }
        });
        return { status: 'SUCCESS', asin, sku, message: `ASIN ${asin} がSKU ${sku} で出品されました。`, apiResponse: result };
    } catch (error) {
        console.error(`Error listing item ${asin} with SKU ${sku}:`, error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        throw new Error(`出品処理中にエラーが発生しました: ${error.message}`);
    }
}

async function deleteListingsItem(sku, marketplaceId, userId) {
    console.log(`SP-API Listing: Attempting to delete SKU ${sku} on ${marketplaceId}`);
    if (!sku || !marketplaceId) {
        throw new Error('出品削除に必要な情報が不足しています。');
    }
    const spApiClient = await getSpApiClient(marketplaceId, userId);
    try {
        const result = await spApiClient.callAPI({
            method: 'DELETE',
            api_path: `/listings/2021-08-01/items/${sku}`,
            query: {
                marketplaceIds: marketplaceId,
            }
        });
        return { status: 'SUCCESS', sku, message: `SKU ${sku} の出品が削除されました。`, apiResponse: result };
    } catch (error) {
        console.error(`Error deleting item with SKU ${sku}:`, error.response ? error.response.data : error.message);
        throw new Error(`出品削除処理中にエラーが発生しました: ${error.message}`);
    }
}

/**
 * 複数のASINの商品カタログ情報を取得する
 * @param {string[]} asins 
 * @param {string} marketplaceId 
 * @param {function} isCancelled キャンセルチェック関数
 * @returns {Promise<object[]>}
 */
async function getCatalogItemsByAsins(asins, marketplaceId, userId, isCancelled = () => false) {
    if (!asins || asins.length === 0) {
        return [];
    }
    console.log(`SP-API Catalog: Getting item details for ${asins.length} ASINs...`);
    
    const spApiClient = await getSpApiClient(marketplaceId, userId);
    
    try {
        const res = await spApiClient.callAPI({
            method: 'GET',
            api_path: '/catalog/2022-04-01/items',
            query: {
                marketplaceIds: marketplaceId,
                identifiers: asins.join(','),
                identifierType: 'ASIN',
                includedData: 'summaries',
                pageSize: 20, // Max 20
            },
        });

        if (res.items && res.items.length > 0) {
            return res.items.map(item => ({
                asin: item.asin,
                productName: item.summaries?.[0]?.itemName || 'N/A',
                brand: item.summaries?.[0]?.brand || 'N/A',
            }));
        }
        return [];
    } catch (error) {
        console.error(`SP-API Catalog (getCatalogItemsByAsins) の呼び出し中にエラーが発生しました:`, error);
        return [];
    }
}

async function getProductAttributesForAsins(asins, marketplaceId, userId, isCancelled = () => false) {
    if (!asins || asins.length === 0) {
        return {};
    }
    console.log(`SP-API Attributes: Getting attributes for ${asins.length} ASINs in ${marketplaceId}`);
    
    const spApiClient = await getSpApiClient(marketplaceId, userId);
    const allAttributes = {};

    const chunkSize = 20; 
    for (let i = 0; i < asins.length; i += chunkSize) {
        if (isCancelled()) {
            console.log(`SP-API Attributes: Process cancelled by client.`);
            break;
        }
        const chunk = asins.slice(i, i + chunkSize);
        
        try {
            const res = await spApiClient.callAPI({
                method: 'GET',
                api_path: '/catalog/2022-04-01/items',
                query: {
                    marketplaceIds: marketplaceId,
                    identifiers: chunk.join(','),
                    identifierType: 'ASIN',
                    includedData: 'attributes,dimensions,relationships',
                },
            });

            if (res.items && res.items.length > 0) {
                for (const item of res.items) {
                    const attributes = item.attributes || {};
                    const dimensions = item.dimensions?.[0]?.item || {};
                    const relationships = item.relationships || [];

                    let weight = null;
                    if (attributes.item_package_weight) {
                        const weightData = attributes.item_package_weight[0];
                        if (weightData && weightData.value > 0) {
                            weight = `${weightData.value} ${weightData.unit}`;
                        }
                    }

                    let volume = null;
                    if (dimensions.length?.value && dimensions.width?.value && dimensions.height?.value) {
                        volume = (dimensions.length.value * dimensions.width.value * dimensions.height.value).toFixed(2) + ` ${dimensions.length.unit}^3`;
                    }
                    
                    const category = attributes.product_type_name?.[0] || 'N/A';
                    const hasVariations = relationships.some(rel => rel.type === 'VARIATION');

                    allAttributes[item.asin] = {
                        weight,
                        volume,
                        category,
                        hasVariations,
                    };
                }
            }
        } catch (error) {
            console.error(`SP-API Attributes (${marketplaceId}) のチャンク処理中にエラーが発生しました:`, error);
        }
    }
    
    console.log(`SP-API Attributes: Found attributes for ${Object.keys(allAttributes).length} ASINs in ${marketplaceId}.`);
    return allAttributes;
}


module.exports = {
    searchProductsByKeywords,
    getCompetitivePricingForAsins,
    getCatalogItemAttributes,
    getCatalogItemsByAsins,
    getProductAttributesForAsins,
    putListingsItem,
    deleteListingsItem,
};
