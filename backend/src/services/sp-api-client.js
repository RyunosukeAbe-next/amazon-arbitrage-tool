const SpApi = require('amazon-sp-api');
const amazonAuthService = require('./amazon-auth-service'); 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const CACHE_MAX_ENTRIES = Number(process.env.SPAPI_CACHE_MAX_ENTRIES || 5000);
const PRICING_CACHE_TTL_MS = Number(process.env.SPAPI_PRICING_CACHE_TTL_MS || 5 * 60 * 1000);
const CATALOG_CACHE_TTL_MS = Number(process.env.SPAPI_CATALOG_CACHE_TTL_MS || 60 * 60 * 1000);
const ATTRIBUTES_CACHE_TTL_MS = Number(process.env.SPAPI_ATTRIBUTES_CACHE_TTL_MS || 60 * 60 * 1000);
const responseCache = new Map();

function makeCacheKey(scope, userId, marketplaceId, asin) {
    return `${scope}:${userId || 'default'}:${marketplaceId}:${String(asin).trim().toUpperCase()}`;
}

function getCachedValue(key) {
    const entry = responseCache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        responseCache.delete(key);
        return undefined;
    }
    return entry.value;
}

function setCachedValue(key, value, ttlMs) {
    if (responseCache.size >= CACHE_MAX_ENTRIES) {
        const oldestKey = responseCache.keys().next().value;
        if (oldestKey) responseCache.delete(oldestKey);
    }
    responseCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

function readAsinCache(scope, asins, marketplaceId, userId) {
    const cached = {};
    const missing = [];
    for (const asin of asins) {
        const key = makeCacheKey(scope, userId, marketplaceId, asin);
        const value = getCachedValue(key);
        if (value === undefined) missing.push(asin);
        else if (value !== null) cached[asin] = value;
    }
    return { cached, missing };
}

function writeAsinCache(scope, marketplaceId, userId, asin, value, ttlMs) {
    setCachedValue(makeCacheKey(scope, userId, marketplaceId, asin), value, ttlMs);
}

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
            if (!retryable || attempt === maxRetries) break;
            await sleep(2000 * attempt);
        }
    }
    throw lastError;
}

async function getSpApiClient(marketplaceId, userId, options = {}) {
    const { refreshToken: manualRefreshToken, skipSellerIdCheck = false } = options;
    let authData = null;
    if (!manualRefreshToken) {
        authData = await amazonAuthService.loadUserAmazonAuth(userId, marketplaceId);
        if (!authData) throw new Error(`User ${userId} has not linked Amazon for ${marketplaceId}.`);
    }
    const refreshToken = manualRefreshToken || authData.refreshToken;
    const sellingPartnerId = authData?.sellingPartnerId;
    if (!refreshToken) throw new Error(`User ${userId} missing refresh token.`);
    if (!skipSellerIdCheck && !sellingPartnerId) throw new Error(`User ${userId} missing selling partner ID.`);

    const isJP = marketplaceId === 'A1VC38T7YXB528';
    const spApiConfig = {
        region: isJP ? 'fe' : 'na',
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: process.env.SELLING_PARTNER_APP_CLIENT_ID,
            SELLING_PARTNER_APP_CLIENT_SECRET: process.env.SELLING_PARTNER_APP_CLIENT_SECRET,
            AWS_ACCESS_KEY_ID: process.env.SPAPI_AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: process.env.SPAPI_AWS_SECRET_ACCESS_KEY,
            AWS_SELLING_PARTNER_ROLE: process.env.SPAPI_ROLE_ARN,
        },
        refresh_token: refreshToken,
        endpoint: isJP ? 'https://sellingpartnerapi-fe.amazon.com' : 'https://sellingpartnerapi-na.amazon.com'
    };
    console.log(`[SP-API] Init Client for ${marketplaceId} (User: ${userId})`);
    return { client: new SpApi(spApiConfig), sellingPartnerId };
}

async function getSellerId(userId, refreshToken) {
    const { client: spApiClient } = await getSpApiClient('ATVPDKIKX0DER', userId, { refreshToken, skipSellerIdCheck: true });
    try {
        const res = await spApiClient.callAPI({ method: 'GET', api_path: '/sellers/v1/marketplaceParticipations' });
        const sellerId = res.payload?.[0]?.sellerId || res[0]?.sellerId;
        return sellerId || null;
    } catch (error) {
        console.error('[getSellerId] Error:', error.message);
        return null;
    }
}

async function searchProductsByKeywords(keywords, marketplaceId, userId, classificationId = null, isCancelled = () => false) {
    let logPrefix = `[SP-API Search: '${keywords}']`;
    console.log(`${logPrefix} Starting in ${marketplaceId}`);
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    let allProducts = [];
    let nextToken = undefined;
    const seenAsins = new Set();
    const MAX_RESULTS = 2500; 
    let page = 1;

    do {
        if (isCancelled()) break;
        const queryParams = {
            keywords: keywords.join(','),
            marketplaceIds: marketplaceId,
            includedData: 'summaries,productTypes',
            pageSize: 20,
        };
        if (classificationId) queryParams.classificationIds = classificationId;
        if (nextToken) queryParams.pageToken = nextToken;

        try {
            await sleep(1500); 
            console.log(`${logPrefix} Page ${page}... (Current: ${allProducts.length})`);
            const res = await spApiClient.callAPI({ method: 'GET', api_path: '/catalog/2022-04-01/items', query: queryParams });

            if (res && res.items && res.items.length > 0) {
                for (const item of res.items) {
                    if (item.asin && !seenAsins.has(item.asin)) {
                        seenAsins.add(item.asin);
                        const pTypeObj = item.productTypes?.[0];
                        allProducts.push({
                            asin: item.asin,
                            productName: item.summaries?.[0]?.itemName || 'N/A',
                            brand: item.summaries?.[0]?.brand || 'N/A',
                            productType: (pTypeObj && typeof pTypeObj === 'object') ? pTypeObj.productType : (pTypeObj || 'PRODUCT'),
                        });
                    }
                }
                nextToken = res.pagination?.nextToken;
            } else {
                nextToken = undefined;
            }
            page++;
        } catch (error) {
            console.error(`${logPrefix} Error:`, error.message);
            nextToken = undefined;
        }
    } while (nextToken && allProducts.length < MAX_RESULTS);

    console.log(`${logPrefix} Finished. Total items: ${allProducts.length}`);
    return allProducts;
}

async function getCompetitivePricingForAsins(asins, marketplaceId, userId, isCancelled = () => false) {
    if (!asins || asins.length === 0) return {};
    const uniqueAsins = [...new Set(asins.map(a => String(a).trim().toUpperCase()))];
    const { cached, missing } = readAsinCache('pricing', uniqueAsins, marketplaceId, userId);
    const allPricing = { ...cached };
    if (missing.length === 0) return allPricing;

    console.log(`[SP-API Pricing] Fetching ${missing.length} ASINs in ${marketplaceId}`);
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    const chunkSize = 20;

    for (let i = 0; i < missing.length; i += chunkSize) {
        if (isCancelled()) break;
        const chunk = missing.slice(i, i + chunkSize);
        try {
            const res = await callApiWithRetries(spApiClient, {
                method: 'GET',
                api_path: '/products/pricing/v0/competitivePrice',
                query: { MarketplaceId: marketplaceId, Asins: chunk.join(','), ItemType: 'Asin' },
            }, `SP-API Pricing chunk ${Math.floor(i/chunkSize)+1}`);

            if (Array.isArray(res)) {
                for (const item of res) {
                    const asin = item.ASIN || item.asin;
                    if (!asin) continue;
                    const compPricing = item.Product?.CompetitivePricing;
                    const compPrices = compPricing?.CompetitivePrices;
                    let price = 0;
                    if (compPrices && compPrices.length > 0) {
                        const p = compPrices[0].Price;
                        price = parseFloat(p?.LandedPrice?.Amount || p?.ListingPrice?.Amount || 0);
                    }
                    const sellerCount = parseInt(compPricing?.NumberOfOfferListings?.find(ol => ol.condition === 'New')?.Count || 0, 10);
                    const pricing = { price, sellerCount, leadTime: marketplaceId === 'A1VC38T7YXB528' ? 2 : undefined };
                    allPricing[asin] = pricing;
                    writeAsinCache('pricing', marketplaceId, userId, asin, pricing, PRICING_CACHE_TTL_MS);
                }
            }
        } catch (error) {
            console.error(`[SP-API Pricing] Chunk Error:`, error.message);
        }
        if (i + chunkSize < missing.length) await sleep(1200);
    }
    for (const asin of uniqueAsins) {
        if (!allPricing[asin]) allPricing[asin] = { price: 0, sellerCount: 0 };
    }
    return allPricing;
}

async function getCatalogItemsByAsins(asins, marketplaceId, userId, isCancelled = () => false) {
    if (!asins || asins.length === 0) return [];
    const uniqueAsins = [...new Set(asins.map(a => String(a).trim().toUpperCase()))];
    const { cached, missing } = readAsinCache('catalog', uniqueAsins, marketplaceId, userId);
    const productsByAsin = { ...cached };
    if (missing.length === 0) return uniqueAsins.map(a => productsByAsin[a]).filter(Boolean);

    console.log(`[SP-API Catalog] Fetching ${missing.length} ASINs in ${marketplaceId}`);
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    const chunkSize = 20;

    for (let i = 0; i < missing.length; i += chunkSize) {
        if (isCancelled()) break;
        const chunk = missing.slice(i, i + chunkSize);
        try {
            const res = await callApiWithRetries(spApiClient, {
                method: 'GET',
                api_path: '/catalog/2022-04-01/items',
                query: { marketplaceIds: marketplaceId, identifiers: chunk.join(','), identifiersType: 'ASIN', includedData: 'summaries,productTypes' },
            }, `SP-API Catalog chunk ${Math.floor(i/chunkSize)+1}`);

            if (res && res.items) {
                for (const item of res.items) {
                    const pType = item.productTypes?.[0]?.productType || 'PRODUCT';
                    const product = {
                        asin: item.asin,
                        productName: item.summaries?.[0]?.itemName || 'N/A',
                        brand: item.summaries?.[0]?.brand || 'N/A',
                        productType: pType,
                    };
                    productsByAsin[item.asin] = product;
                    writeAsinCache('catalog', marketplaceId, userId, item.asin, product, CATALOG_CACHE_TTL_MS);
                }
            }
        } catch (error) {
            console.error(`[SP-API Catalog] Chunk Error:`, error.message);
        }
        if (i + chunkSize < missing.length) await sleep(1500);
    }
    return uniqueAsins.map(a => productsByAsin[a]).filter(Boolean);
}

async function getProductAttributesForAsins(asins, marketplaceId, userId, isCancelled = () => false) {
    if (!asins || asins.length === 0) return {};
    const uniqueAsins = [...new Set(asins.map(a => String(a).trim().toUpperCase()))];
    const { cached, missing } = readAsinCache('attributes', uniqueAsins, marketplaceId, userId);
    const allAttributes = { ...cached };
    if (missing.length === 0) return allAttributes;

    console.log(`[SP-API Attributes] Fetching ${missing.length} ASINs in ${marketplaceId}`);
    const { client: spApiClient } = await getSpApiClient(marketplaceId, userId);
    const chunkSize = 10;

    for (let i = 0; i < missing.length; i += chunkSize) {
        if (isCancelled()) break;
        const chunk = missing.slice(i, i + chunkSize);
        try {
            const res = await callApiWithRetries(spApiClient, {
                method: 'GET',
                api_path: '/catalog/2022-04-01/items',
                query: { marketplaceIds: marketplaceId, identifiers: chunk.join(','), identifiersType: 'ASIN', includedData: 'attributes,dimensions,relationships,productTypes', pageSize: 10 },
            }, `SP-API Attributes chunk ${Math.floor(i/chunkSize)+1}`);

            if (res && res.items) {
                for (const item of res.items) {
                    const attributes = item.attributes || {};
                    const dims = item.dimensions?.[0]?.item || {};
                    let weightKg = null;
                    if (attributes.item_package_weight) {
                        const w = attributes.item_package_weight[0];
                        const val = parseFloat(w.value);
                        const unit = (w.unit || '').toLowerCase();
                        if (unit.includes('pound') || unit === 'lb') weightKg = val * 0.453592;
                        else if (unit.includes('gram') || unit === 'g') weightKg = val / 1000;
                        else if (unit.includes('ounce') || unit === 'oz') weightKg = val * 0.0283495;
                        else weightKg = val;
                        weightKg = Math.round(weightKg * 1000) / 1000;
                    }
                    let volumeNumber = null;
                    if (dims.length?.value && dims.width?.value && dims.height?.value) {
                        const l = parseFloat(dims.length.value), w = parseFloat(dims.width.value), h = parseFloat(dims.height.value);
                        const u = (dims.length.unit || '').toLowerCase();
                        let f = 1;
                        if (u.includes('inch')) f = 2.54;
                        else if (u.includes('foot')) f = 30.48;
                        else if (u.includes('mm')) f = 0.1;
                        volumeNumber = Math.round((l*f * w*f * h*f) * 100) / 100;
                    }
                    const productAttributes = {
                        weight: weightKg, weightKg, weightDisplay: weightKg ? weightKg.toString() : 'N/A',
                        volume: volumeNumber, volumeNumber, volumeDisplay: volumeNumber ? volumeNumber.toString() : 'N/A',
                        category: item.productTypes?.[0]?.productType || 'N/A',
                        hasVariations: item.relationships?.some(rel => rel.type === 'VARIATION') || false,
                    };
                    allAttributes[item.asin] = productAttributes;
                    writeAsinCache('attributes', marketplaceId, userId, item.asin, productAttributes, ATTRIBUTES_CACHE_TTL_MS);
                }
            }
        } catch (error) {
            console.error(`[SP-API Attributes] Chunk Error:`, error.message);
        }
        if (i + chunkSize < missing.length) await sleep(1500);
    }
    return allAttributes;
}

async function putListingsItem(asin, sku, price, quantity, marketplaceId, userId, productType = 'GENERIC', handlingTime = 2, productName = null, brand = null) {
    const typeToUse = (productType && productType !== 'PRODUCT' && productType !== 'N/A') ? productType : 'GENERIC'; 
    const { client: spApiClient, sellingPartnerId } = await getSpApiClient(marketplaceId, userId);
    const numericPrice = parseFloat(price);
    const numericQuantity = Math.max(1, parseInt(quantity, 10) || 1);
    const numericHandlingTime = Math.max(1, parseInt(handlingTime, 10) || 2);

    try {
        const attributes = {
            merchant_suggested_asin: [{ value: asin, marketplace_id: marketplaceId }],
            condition_type: [{ value: "new_new", marketplace_id: marketplaceId }],
            purchasable_offer: [{ currency: marketplaceId === 'ATVPDKIKX0DER' ? 'USD' : 'JPY', our_price: [{ schedule: [{ value_with_tax: numericPrice }] }], marketplace_id: marketplaceId }],
            fulfillment_availability: [{ fulfillment_channel_code: "DEFAULT", quantity: numericQuantity, lead_time_to_ship_max_days: numericHandlingTime, marketplace_id: marketplaceId }]
        };
        if (productName) attributes.item_name = [{ value: productName, marketplace_id: marketplaceId }];
        if (brand && brand !== 'N/A') attributes.brand = [{ value: brand, marketplace_id: marketplaceId }];

        const result = await spApiClient.callAPI({
            method: 'PUT',
            api_path: `/listings/2021-08-01/items/${sellingPartnerId}/${sku}`,
            query: { marketplaceIds: [marketplaceId] },
            body: { productType: typeToUse, requirements: productName ? 'LISTING' : 'LISTING_OFFER_ONLY', attributes }
        });
        
        if (result && result.issues) {
            const hasError = result.issues.some(i => i.severity === 'ERROR' || i.code === '90220');
            if (hasError) return { status: 'INCOMPLETE', asin, sku, issues: result.issues };
        }
        return { status: 'SUCCESS', asin, sku, apiResponse: result };
    } catch (error) {
        throw new Error(`Listing Error: ${error.message}`);
    }
}

async function deleteListingsItem(sku, marketplaceId, userId) {
    const { client: spApiClient, sellingPartnerId } = await getSpApiClient(marketplaceId, userId);
    try {
        const result = await spApiClient.callAPI({ method: 'DELETE', api_path: `/listings/2021-08-01/items/${sellingPartnerId}/${sku}`, query: { marketplaceIds: [marketplaceId] } });
        return { status: 'SUCCESS', sku, apiResponse: result };
    } catch (error) {
        throw new Error(`Delete Error: ${error.message}`);
    }
}

module.exports = {
    getSellerId, searchProductsByKeywords, getCompetitivePricingForAsins,
    getCatalogItemsByAsins, getProductAttributesForAsins, putListingsItem, deleteListingsItem,
};
