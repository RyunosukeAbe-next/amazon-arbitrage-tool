const SpApi = require('amazon-sp-api');
const amazonAuthService = require('./amazon-auth-service'); // ★ 追加

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callApiWithRetries(spApiClient, request, label, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await spApiClient.callAPI(request);
        } catch (error) {
            lastError = error;
            const status = error.response?.status || error.statusCode;
            const retryable = !status || status === 429 || status >= 500;
            console.warn(`${label} failed on attempt ${attempt}/${maxRetries}: ${error.message}`);
            if (!retryable || attempt === maxRetries) {
                break;
            }
            await sleep(1500 * attempt);
        }
    }
    throw lastError;
}

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

    // 日本 (A1VC38T7YXB528) は 'fe' (Far East), 米国 (ATVPDKIKX0DER) は 'na' (North America)
    const isJP = marketplaceId === 'A1VC38T7YXB528';
    const spApiRegion = isJP ? 'fe' : 'na';
    
    // 日本用の場合は .env の SPAPI_REFRESH_TOKEN_JP があればそれを最優先、無ければDB保存分
    const refreshTokenToUse = isJP && process.env.SPAPI_REFRESH_TOKEN_JP 
        ? process.env.SPAPI_REFRESH_TOKEN_JP 
        : authData.refreshToken;

    const spApiConfig = {
        region: spApiRegion,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: process.env.SELLING_PARTNER_APP_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SELLING_PARTNER_APP_CLIENT_SECRET,
            AWS_ACCESS_KEY_ID: process.env.SPAPI_AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: process.env.SPAPI_AWS_SECRET_ACCESS_KEY,
            AWS_SELLING_PARTNER_ROLE: process.env.SPAPI_ROLE_ARN,
        },
        refresh_token: refreshTokenToUse, 
        // access_token を渡さないことで、ライブラリが指定されたリージョン用のトークンを自動取得・リフレッシュする
    };

    // 日本リージョンの場合はエンドポイントを明示
    if (isJP) {
        spApiConfig.endpoint = 'https://sellingpartnerapi-fe.amazon.com';
    }

    if (!spApiConfig.refresh_token || !spApiConfig.credentials.AWS_ACCESS_KEY_ID || !spApiConfig.credentials.SELLING_PARTNER_APP_CLIENT_ID) {
        throw new Error(`SP-APIの認証情報が不足しています（リージョン: ${spApiRegion}）。`);
    }

    return {
        client: new SpApi(spApiConfig),
        sellingPartnerId: authData.sellingPartnerId
    };
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
    
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    let allProducts = [];
    let nextToken = undefined;
    const seenAsins = new Set();
    const seenTokens = new Set();
    const MAX_RESULTS = 1000;
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
            queryParams.pageToken = nextToken;
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
                const products = res.items
                    .filter(item => {
                        if (!item.asin || seenAsins.has(item.asin)) {
                            return false;
                        }
                        seenAsins.add(item.asin);
                        return true;
                    })
                    .map(item => ({
                        asin: item.asin,
                        productName: item.summaries?.[0]?.itemName || 'N/A',
                        brand: item.summaries?.[0]?.brand || 'N/A',
                    }));
                allProducts = allProducts.concat(products);
            }
            
            nextToken = res.pagination?.nextToken;
            if (nextToken && seenTokens.has(nextToken)) {
                console.warn(`${logPrefix} Same pagination token was returned again. Stopping to avoid duplicate loop.`);
                nextToken = undefined;
            } else if (nextToken) {
                seenTokens.add(nextToken);
            }
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
 * 単一ASINの全オファー（出品者一覧）から最安値を取得する（フォールバック用）
 */
async function getLowestOfferPrice(spApiClient, asin, marketplaceId) {
    try {
        console.log(`[Pricing Fallback] Calling getItemOffers for ASIN ${asin} in ${marketplaceId}...`);
        const res = await spApiClient.callAPI({
            method: 'GET',
            api_path: `/products/pricing/v0/items/${asin}/offers`,
            query: {
                MarketplaceId: marketplaceId,
                ItemCondition: 'New',
            },
        });

        if (res && res.Offers) {
            console.log(`[Pricing Fallback] Received ${res.Offers.length} raw offers for ASIN ${asin}`);
            if (res.Offers.length > 0) {
                // デバッグ用に最初のオファーのコンディションを出力
                console.log(`[Pricing Fallback] First raw offer details - Condition: ${res.Offers[0].Condition}, SubCondition: ${res.Offers[0].SubCondition}`);
                
                // Newコンディションのオファーのみフィルタリングし、最安値を計算（ListingPrice + Shipping）
                // APIは小文字の 'new' を返す場合があるため、toLowerCase() で比較する
                const newOffers = res.Offers.filter(offer => {
                    const subCond = (offer.SubCondition || '').toLowerCase();
                    const cond = (offer.Condition || '').toLowerCase();
                    return subCond === 'new' || cond === 'new';
                });
                console.log(`[Pricing Fallback] Found ${newOffers.length} 'New' offers after filtering.`);
                
                if (newOffers.length > 0) {
                    // LandedPrice（送料込み価格）でソートして最安値を取得
                    newOffers.sort((a, b) => {
                        const priceA = (a.ListingPrice?.Amount || 0) + (a.Shipping?.Amount || 0);
                        const priceB = (b.ListingPrice?.Amount || 0) + (b.Shipping?.Amount || 0);
                        return priceA - priceB;
                    });
                    const lowestOffer = newOffers[0];
                    const lowestPrice = (lowestOffer.ListingPrice?.Amount || 0) + (lowestOffer.Shipping?.Amount || 0);
                    return { price: lowestPrice, sellerCount: newOffers.length };
                }
            }
        } else {
             console.log(`[Pricing Fallback] No Offers array in response for ASIN ${asin}. Raw response keys:`, Object.keys(res || {}));
        }
        return null;
    } catch (error) {
        // 400エラー等（該当ASINのオファー取得不可）はログを出して握りつぶす
        console.warn(`[Pricing Fallback] Failed to get offers for ASIN ${asin} in ${marketplaceId}:`, error.message);
        if (error.response && error.response.data) {
             console.warn(`[Pricing Fallback Error Data]:`, JSON.stringify(error.response.data));
        }
        return null;
    }
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
    
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    const allPricing = {};

    const chunkSize = 20;
    for (let i = 0; i < asins.length; i += chunkSize) {
        if (isCancelled()) {
            console.log(`SP-API Pricing: Process cancelled by client.`);
            break;
        }
        const chunk = asins.slice(i, i + chunkSize);
        
        try {
            const res = await callApiWithRetries(spApiClient, {
                method: 'GET',
                api_path: '/products/pricing/v0/competitivePrice',
                query: {
                    MarketplaceId: marketplaceId,
                    Asins: chunk.join(','),
                    ItemType: 'Asin',
                },
            }, `SP-API Pricing (${marketplaceId}) chunk ${Math.floor(i / chunkSize) + 1}`);

            if (Array.isArray(res)) {
                for (const result of res) { 
                    if (result.status === 'Success' && result.Product) {
                        const productData = result.Product;
                        const competitivePricing = productData.CompetitivePricing || {};
                        const competitivePrices = competitivePricing.CompetitivePrices || [];
                        const newPriceObject = competitivePrices.find(p => p.condition === 'New');
                        
                        // BuyBox (LandedPrice) を取得
                        let landedPrice = newPriceObject?.Price?.LandedPrice?.Amount;
                        
                        // もしBuyBox価格がない場合は、ListingPrice (商品自体の価格) を代替として探す
                        if (landedPrice === undefined) {
                            landedPrice = newPriceObject?.Price?.ListingPrice?.Amount;
                        }

                        const offerListings = competitivePricing.NumberOfOfferListings || [];
                        const newOffer = offerListings.find(offer => offer.condition === 'New');
                        const sellerCount = newOffer ? newOffer.Count : 0;

                        if (landedPrice !== undefined) {
                            allPricing[result.ASIN] = {
                                price: landedPrice,
                                sellerCount: sellerCount,
                                // 日本のリードタイム情報の器を用意（将来的にoffers API等で取得可能）
                                leadTime: marketplaceId === 'A1VC38T7YXB528' ? 2 : undefined, 
                            };
                        } else {
                            console.log(`[Pricing] ASIN ${result.ASIN} has no active BuyBox in ${marketplaceId}. Attempting fallback to item offers...`);
                            
                            // フォールバック: カートがない場合は、個別にオファーAPIを叩いて最安値を取得する
                            // スロットルエラーを避けるために少し待機
                            await new Promise(resolve => setTimeout(resolve, 500)); 
                            
                            console.log(`[Pricing Debug] Actually calling getLowestOfferPrice now for ${result.ASIN}`);
                            const fallbackData = await getLowestOfferPrice(spApiClient, result.ASIN, marketplaceId);
                            console.log(`[Pricing Debug] getLowestOfferPrice returned:`, fallbackData);
                            
                            if (fallbackData && fallbackData.price > 0) {
                                console.log(`[Pricing] ASIN ${result.ASIN} fallback successful. Found lowest price: ${fallbackData.price} (Sellers: ${fallbackData.sellerCount})`);
                                allPricing[result.ASIN] = { 
                                    price: fallbackData.price, 
                                    sellerCount: fallbackData.sellerCount, 
                                    leadTime: marketplaceId === 'A1VC38T7YXB528' ? 2 : undefined 
                                };
                            } else {
                                console.log(`[Pricing] ASIN ${result.ASIN} fallback failed or no new offers found.`);
                                allPricing[result.ASIN] = { price: 0, sellerCount: 0, leadTime: marketplaceId === 'A1VC38T7YXB528' ? 2 : undefined };
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`SP-API Pricing (${marketplaceId}) のチャンク処理中にエラーが発生しました:`, error);
        }

        if (i + chunkSize < asins.length) {
            await sleep(1200);
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
    
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);

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
async function putListingsItem(asin, sku, price, quantity, marketplaceId, userId, productType = 'GENERIC', handlingTime = 2) {
    // 汎用的な 'PRODUCT' が指定された場合はエラーになりやすいため、できる限り具体的な productType を使用するか、
    // あるいは 'GENERIC' などの他の安全なデフォルトを使用する。
    // 今回は呼び出し元から渡された productType をそのまま使用し、'PRODUCT' の場合は 'GENERIC' にフォールバックする
    const typeToUse = (productType && productType !== 'PRODUCT') ? productType : 'GENERIC'; 
    console.log(`SP-API Listing: Attempting to list ASIN ${asin} (Product Type: ${typeToUse}, Original: ${productType}) on ${marketplaceId}`);
    
    if (!asin || !sku || !price || !marketplaceId) {
        throw new Error('出品に必要な情報が不足しています。');
    }
    
    const { client: spApiClient, sellingPartnerId } = await getSpApiClient(marketplaceId, userId);

    if (!sellingPartnerId) {
        throw new Error('セラーIDが取得できません。');
    }

    const numericPrice = parseFloat(price);
    const numericQuantity = Math.max(1, parseInt(quantity, 10) || 1);
    const numericHandlingTime = Math.max(1, parseInt(handlingTime, 10) || 2);

    console.log(`SP-API Listing: SKU=${sku}, Qty=${numericQuantity}, Price=${numericPrice}, LeadTime=${numericHandlingTime}`);

    try {
        const result = await spApiClient.callAPI({
            method: 'PUT',
            api_path: `/listings/2021-08-01/items/${sellingPartnerId}/${sku}`,
            query: {
                marketplaceIds: [marketplaceId],
            },
            body: {
                productType: typeToUse, 
                // 既存のASINに対して「オファー（価格と在庫）」のみを更新することを明示
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
                            currency: marketplaceId === 'ATVPDKIKX0DER' ? 'USD' : 'JPY',
                            our_price: [
                                {
                                    schedule: [
                                        {
                                            value_with_tax: numericPrice
                                        }
                                    ]
                                }
                            ],
                            marketplace_id: marketplaceId
                        }
                    ],
                    fulfillment_availability: [
                        {
                            fulfillment_channel_code: "DEFAULT",
                            quantity: numericQuantity,
                            lead_time_to_ship_max_days: numericHandlingTime,
                            marketplace_id: marketplaceId
                        }
                    ]
                }
            }
        });
        
        console.log(`SP-API Listing: Successfully sent PUT request for ASIN ${asin} with SKU ${sku}`);
        
        // --- Amazonからのレスポンスを解析 ---
        if (result && result.issues && result.issues.length > 0) {
            console.warn(`--- LISTING ISSUES FOR ${sku} ---`);
            const errors = result.issues.filter(issue => issue.severity === 'ERROR');
            
            result.issues.forEach(issue => {
                console.warn(`[${issue.severity}] ${issue.code}: ${issue.message}`);
            });
            console.warn(`----------------------------------`);

            // エラー（ERROR）が含まれている、またはカタログ不備（90220など）がある場合は、
            // 呼び出し側に情報を渡して削除判断を仰ぐ
            const hasIncompleteIssue = result.issues.some(issue => issue.code === '90220' || issue.message.includes('required but missing'));
            
            if (errors.length > 0 || hasIncompleteIssue) {
                return { 
                    status: 'INCOMPLETE', 
                    asin, 
                    sku, 
                    message: 'Amazonのカタログ情報が不足しているため、出品を継続できません。', 
                    issues: result.issues 
                };
            }
        }
        
        return { status: 'SUCCESS', asin, sku, message: `ASIN ${asin} がSKU ${sku} で出品されました。`, apiResponse: result };
    } catch (error) {
        console.error('--- SP-API ERROR DEBUG START ---');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error Message:', error.message);
        }
        console.error('--- SP-API ERROR DEBUG END ---');
        
        let errorMsg = error.message;
        if (error.response && error.response.data) {
            if (error.response.data.issues) {
                 errorMsg = error.response.data.issues.map(i => `[${i.code}] ${i.message}`).join(' / ');
            } else if (error.response.data.errors) {
                 errorMsg = error.response.data.errors.map(e => e.message).join(' / ');
            }
        }
        throw new Error(`出品処理中にエラーが発生しました: ${errorMsg}`);
    }
}

async function deleteListingsItem(sku, marketplaceId, userId) {
    console.log(`SP-API Listing: Attempting to delete SKU ${sku} on ${marketplaceId}`);
    if (!sku || !marketplaceId) {
        throw new Error('出品削除に必要な情報が不足しています。');
    }

    const { client: spApiClient, sellingPartnerId } = await getSpApiClient(marketplaceId, userId);
    if (!sellingPartnerId) {
        throw new Error('セラーIDが取得できません。');
    }

    try {
        const result = await spApiClient.callAPI({
            method: 'DELETE',
            // deleteListingsItem の api_path も修正
            api_path: `/listings/2021-08-01/items/${sellingPartnerId}/${sku}`,
            query: {
                marketplaceIds: [marketplaceId],
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
    
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    
    try {
        const res = await spApiClient.callAPI({
            method: 'GET',
            api_path: '/catalog/2022-04-01/items',
            query: {
                marketplaceIds: marketplaceId,
                identifiers: asins.join(','),
                identifiersType: 'ASIN',
                includedData: 'summaries,productTypes', 
                pageSize: 20, 
            },
        });

        if (res.items && res.items.length > 0) {
            return res.items.map(item => {
                // productTypes は [{ productType: '...', marketplaceId: '...' }] の形式
                const pTypeObj = item.productTypes?.[0];
                const pType = (pTypeObj && typeof pTypeObj === 'object') ? pTypeObj.productType : (pTypeObj || 'PRODUCT');
                
                console.log(`[Catalog] ASIN ${item.asin} resolved to ProductType: ${pType}`);
                return {
                    asin: item.asin,
                    productName: item.summaries?.[0]?.itemName || 'N/A',
                    brand: item.summaries?.[0]?.brand || 'N/A',
                    productType: pType, 
                };
            });
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
    
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    const allAttributes = {};

    const chunkSize = 20; 
    for (let i = 0; i < asins.length; i += chunkSize) {
        if (isCancelled()) {
            console.log(`SP-API Attributes: Process cancelled by client.`);
            break;
        }
        const chunk = asins.slice(i, i + chunkSize);
        
        try {
            const res = await callApiWithRetries(spApiClient, {
                method: 'GET',
                api_path: '/catalog/2022-04-01/items',
                query: {
                    marketplaceIds: marketplaceId,
                    identifiers: chunk.join(','),
                    identifiersType: 'ASIN',
                    includedData: 'attributes,dimensions,relationships',
                },
            }, `SP-API Attributes (${marketplaceId}) chunk ${Math.floor(i / chunkSize) + 1}`);

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

        if (i + chunkSize < asins.length) {
            await sleep(1200);
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
