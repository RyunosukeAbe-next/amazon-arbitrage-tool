const SpApi = require('amazon-sp-api');

/**
 * SP-APIクライアントを初期化し、返す
 * @param {string} marketplaceId マーケットプレイスID
 * @returns {SpApi} SP-APIクライアントインスタンス
 */
function getSpApiClient(marketplaceId) {
    const spApiRegion = marketplaceId === 'ATVPDKIKX0DER' ? 'na' : 'fe';
    const refreshToken = marketplaceId === 'ATVPDKIKX0DER' ? process.env.SPAPI_REFRESH_TOKEN_US : process.env.SPAPI_REFRESH_TOKEN_JP;

    const spApiConfig = {
        region: spApiRegion,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: process.env.SELLING_PARTNER_APP_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SELLING_PARTNER_APP_CLIENT_SECRET,
            AWS_ACCESS_KEY_ID: process.env.SPAPI_AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: process.env.SPAPI_AWS_SECRET_ACCESS_KEY,
            AWS_SELLING_PARTNER_ROLE: process.env.SPAPI_ROLE_ARN,
        },
        refresh_token: refreshToken,
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
 * @returns {Promise<object[]>} 商品情報の配列
 */
async function searchProductsByKeywords(keywords, marketplaceId, classificationId = null) {
    let logPrefix = `SP-API Client (Keywords: '${keywords}'`;
    if (classificationId) {
        logPrefix += `, Classification: '${classificationId}'`;
    }
    logPrefix += `):`;
    console.log(`${logPrefix} Searching in marketplace '${marketplaceId}'`);
    
    const spApiClient = getSpApiClient(marketplaceId);
    let allProducts = [];
    let nextToken = undefined;
    const MAX_RESULTS = 1000;
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let page = 1;

    do {
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

            console.log('--- DEBUG: API Response Pagination ---', res.pagination); // ★ デバッグログ追加

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
    
    console.log(`--- DEBUG: Loop finished. Reason: ${!nextToken ? 'No more pages (nextToken is null/undefined)' : 'MAX_RESULTS reached'}. Total products: ${allProducts.length} ---`); // ★ デバッグログ追加
    
    const finalResults = allProducts.slice(0, MAX_RESULTS);
    console.log(`${logPrefix} Found ${finalResults.length} products in total.`);
    return finalResults;
}

/**
 * 複数のASINの競合価格情報を取得する
 * @param {string[]} asins ASINの配列
 * @param {string} marketplaceId 取得対象のマーケットプレイスID
 * @returns {Promise<object>} ASINをキーとした価格と出品者数のオブジェクト
 */
async function getCompetitivePricingForAsins(asins, marketplaceId) {
    if (!asins || asins.length === 0) {
        return {};
    }
    console.log(`SP-API Pricing: Getting prices for ${asins.length} ASINs in ${marketplaceId}`);
    
    const spApiClient = getSpApiClient(marketplaceId);
    const allPricing = {};

    const chunkSize = 20;
    for (let i = 0; i < asins.length; i += chunkSize) {
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
                        const competitivePricing = result.Product.CompetitivePricing;
                        // 競合価格の配列から最初の価格（通常は最安値）を取得
                        const landedPrice = competitivePricing?.CompetitivePrices?.[0]?.Price?.LandedPrice?.Amount;
                        
                        // 出品者数を取得
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
async function getCatalogItemAttributes(asin, marketplaceId) {
    console.log(`SP-API Catalog: Getting attributes for ASIN ${asin} in ${marketplaceId}`);
    
    const spApiClient = getSpApiClient(marketplaceId);

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
        // 商品名とブランドを取得
        if (res.summaries && res.summaries.length > 0) {
            attributes.productName = res.summaries[0].itemName || 'N/A';
            attributes.brand = res.summaries[0].brand || 'N/A';
        }

        // パッケージ重量のデータを抽出
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
async function putListingsItem(asin, sku, price, quantity, marketplaceId) {
    console.log(`SP-API Listing: Attempting to list ASIN ${asin} on ${marketplaceId}`);
    if (!asin || !sku || !price || !quantity || !marketplaceId) {
        throw new Error('出品に必要な情報が不足しています。');
    }
    return { status: 'SUCCESS', asin, sku, message: `ASIN ${asin} がSKU ${sku} で出品されました。（ダミー）` };
}

async function deleteListingsItem(sku, marketplaceId) {
    console.log(`SP-API Listing: Attempting to delete SKU ${sku} on ${marketplaceId}`);
    if (!sku || !marketplaceId) {
        throw new Error('出品削除に必要な情報が不足しています。');
    }
    return { status: 'SUCCESS', sku, message: `SKU ${sku} の出品が削除されました。（ダミー）` };
}

/**
 * 複数のASINの商品カタログ情報を取得する
 * @param {string[]} asins 
 * @param {string} marketplaceId 
 * @returns {Promise<object[]>}
 */
async function getCatalogItemsByAsins(asins, marketplaceId) {
    if (!asins || asins.length === 0) {
        return [];
    }
    console.log(`SP-API Catalog: Getting item details for ${asins.length} ASINs...`);
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const allProducts = [];

    for (const asin of asins) {
        await sleep(1100); // レートリミット対策
        const attributes = await getCatalogItemAttributes(asin, marketplaceId);
        if (attributes) {
            allProducts.push({
                asin: asin,
                productName: attributes.productName || 'N/A',
                brand: attributes.brand || 'N/A',
            });
        }
    }
    return allProducts;
}


module.exports = {
    searchProductsByKeywords,
    getCompetitivePricingForAsins,
    getCatalogItemAttributes,
    getCatalogItemsByAsins, // ★ 追加
    getCatalogItemsByAsins,
    putListingsItem,
    deleteListingsItem,
};
