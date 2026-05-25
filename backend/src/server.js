console.log("--- Server script started ---");
// .envファイルから環境変数を読み込む
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// サービスとミドルウェアの読み込み
const { searchProductsByKeywords, getCompetitivePricingForAsins, getCatalogItemsByAsins, putListingsItem, deleteListingsItem, getProductAttributesForAsins } = require('./services/sp-api-client');
const { json2csv } = require('json-2-csv');
const { loadSettings, saveSettings } = require('./services/settings-manager');
const { calculateProfit, isExcluded } = require('./services/profit-calculator');
const { addTrackedListing, removeTrackedListing } = require('./services/listing-manager');
const { getASINsBySellerId } = require('./services/keepa-api-client');
const { applyLatestExchangeRate } = require('./services/exchange-rate-service');
const researchLogger = require('./services/research-logger'); 
const { startInventoryWatcher } = require('./services/inventory-watcher');
const { startPriceAdjuster } = require('./services/price-adjuster');
const listingLogger = require('./services/listing-logger');
const userManager = require('./services/user-manager');
const listingManager = require('./services/listing-manager'); 
const authenticate = require('./middleware/authenticate');
const amazonAuthService = require('./services/amazon-auth-service'); 
const { initDatabase } = require('./services/database');
const searchJobManager = require('./services/search-job-manager');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://amazon-arbitrage-tool-1.onrender.com' 
    : ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const JP_MARKETPLACE_ID = 'A1VC38T7YXB528';

// --- 認証が不要なAPIルート (Auth) ---
const authRouter = express.Router();

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
  }
  try {
    const user = await userManager.addUser(username, password);
    res.status(201).json({ message: 'ユーザーが正常に登録されました。', user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
  }
  try {
    const user = await userManager.verifyUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'ユーザー名またはパスワードが無効です。' });
    }
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRETが.envファイルに設定されていません。');
      return res.status(500).json({ error: 'サーバー設定エラーです。' });
    }
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    res.json({ message: 'ログインに成功しました。', token });
  } catch (error) {
    console.error('ログイン処理中にエラー:', error);
    res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
  }
});

// フロントエンドから認証済みリクエストでトークン情報を保存するためのAPI
authRouter.post('/amazon/save-auth', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: '認証トークンが必要です。' });
    }

    try {
        const user = jwt.verify(token, process.env.JWT_SECRET);
        const userId = user.userId;
        const { code, spapi_oauth_code, state, selling_partner_id } = req.body;
        const authCode = code || spapi_oauth_code;

        if (!authCode) {
            return res.status(400).json({ error: '認証コードがありません。' });
        }

        await amazonAuthService.verifyAndConsumeUserOAuthState(userId, state);

        console.log(`[User ${userId}] Exchanging Amazon authorization code for tokens (via save-auth).`);
        const tokens = await amazonAuthService.exchangeCodeForTokens(authCode);
        
        await amazonAuthService.saveUserAmazonAuth(userId, {
            ...tokens,
            sellingPartnerId: selling_partner_id,
            marketplaceId: US_MARKETPLACE_ID,
            linkedAt: new Date().toISOString(),
        });

        console.log(`[User ${userId}] Amazon認証情報が正常に保存されました。`);
        res.status(200).json({ message: 'Amazonアカウントとの連携に成功しました。' });
    } catch (error) {
        console.error('Amazon認証情報の保存中にエラー:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             return res.status(403).json({ error: '無効なトークンです。再度ログインしてください。' });
        }
        res.status(500).json({ error: error.message || 'Amazonアカウントとの連携に失敗しました。' });
    }
});

app.use('/api/auth', authRouter);

// Amazonからのリダイレクトを直接受け取るエンドポイント (認証なし) ---
// Amazonに登録されているリダイレクトURIがここを叩く
app.get('/api/amazon/callback', async (req, res) => {
    const { code, spapi_oauth_code, state, selling_partner_id } = req.query;
    console.log(`[Amazon Callback] Received callback with code and state.`);

    const authCode = code || spapi_oauth_code;

    if (!authCode) {
        return res.status(400).json({ error: '認証コードがありません。' });
    }

    // 本番環境では環境変数 FRONTEND_URL を優先、なければデフォルト値を使用
    const frontendRedirectUrl = process.env.NODE_ENV === 'production' 
        ? (process.env.FRONTEND_URL || 'https://amazon-arbitrage-tool-1.onrender.com') 
        : 'http://localhost:3000';

    res.redirect(`${frontendRedirectUrl}/amazon/callback?code=${authCode}&state=${state}&selling_partner_id=${selling_partner_id || ''}`);
});


// --- 認証が必要なAPIルート ---
const apiRouter = express.Router();
apiRouter.use(authenticate);

apiRouter.get('/amazon/authorize', async (req, res) => {
    try {
        const state = await amazonAuthService.createUserOAuthState(req.user.userId);
        console.log(`[User ${req.user.userId}] Generating Amazon Authorization URL with state: ${state}`);
        const authUrl = amazonAuthService.getAuthorizationUrl(state);
        res.json({ authorizationUrl: authUrl, state: state });
    } catch (error) {
        console.error('Amazon認証URLの生成中にエラー:', error);
        res.status(500).json({ error: error.message || 'Amazon認証URLの生成に失敗しました。' });
    }
});

apiRouter.get('/amazon/auth-status', async (req, res) => {
    try {
        const authData = await amazonAuthService.loadUserAmazonAuth(req.user.userId);
        if (authData) {
            res.json({
                isLinked: true,
                sellingPartnerId: authData.sellingPartnerId,
                linkedAt: authData.linkedAt,
            });
        } else {
            res.json({ isLinked: false });
        }
    } catch (error) {
        console.error(`[User ${req.user.userId}] Amazon認証ステータス取得中にエラー:`, error);
        res.status(500).json({ error: 'Amazon認証ステータスの取得に失敗しました。' });
    }
});

apiRouter.delete('/amazon/disconnect', async (req, res) => {
    const userId = req.user.userId;
    try {
        const deleted = await amazonAuthService.deleteUserAmazonAuth(userId);
        if (!deleted) {
            return res.status(404).json({ error: '連携済みのAmazonアカウントが見つかりません。' });
        }
        res.json({ message: 'Amazonアカウントとの連携を解除しました。' });
    } catch (error) {
        console.error(`[User ${userId}] Amazonアカウント連携解除中にエラー:`, error);
        res.status(500).json({ error: 'Amazonアカウント連携の解除に失敗しました。' });
    }
});

async function runProductSearch(userId, params, options = {}) {
  const { searchType, query, classificationId } = params;
  const isCancelled = options.isCancelled || (() => false);
  const updateProgress = options.updateProgress || (() => {});

  if (!searchType || !query) {
    throw new Error('検索タイプとクエリは必須です。');
  }

  const settings = await loadSettings(userId);
  let spApiProducts = [];
  let asins = [];

  updateProgress('検索条件を処理しています。');

  if (searchType === 'keyword') {
    const keywords = Array.isArray(query) ? query : String(query).split(',');
    spApiProducts = await searchProductsByKeywords(keywords, US_MARKETPLACE_ID, userId, classificationId, isCancelled);
    if (spApiProducts.length > 0) {
      asins = spApiProducts.map(p => p.asin);
    }
  } else if (searchType === 'seller') {
    const sellerId = String(query);
    asins = await getASINsBySellerId(sellerId, 'com', settings.keepaSellerAsinLimit);
    if (isCancelled()) throw new Error('検索がキャンセルされました。');
    if (asins.length > 0) {
      updateProgress(`${asins.length}件のASINの商品情報を取得しています。`);
      spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, isCancelled);
    }
  } else if (searchType === 'asin') {
    asins = Array.isArray(query) ? query : String(query).split(/[\s,]+/);
    if (asins.length > 0) {
      updateProgress(`${asins.length}件のASINの商品情報を取得しています。`);
      spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, isCancelled);
    }
  } else {
    throw new Error('無効な検索タイプです。');
  }

  if (isCancelled()) throw new Error('検索がキャンセルされました。');

  let finalResults = [];
  if (spApiProducts.length > 0) {
    const pricingAsins = spApiProducts.map(product => product.asin);
    updateProgress(`${pricingAsins.length}件の価格・属性情報を取得しています。`);
    const [usPricing, jpPricing, attributes] = await Promise.all([
      getCompetitivePricingForAsins(pricingAsins, US_MARKETPLACE_ID, userId, isCancelled),
      getCompetitivePricingForAsins(pricingAsins, JP_MARKETPLACE_ID, userId, isCancelled),
      getProductAttributesForAsins(pricingAsins, US_MARKETPLACE_ID, userId, isCancelled)
    ]);

    if (isCancelled()) throw new Error('検索がキャンセルされました。');

    finalResults = spApiProducts.map(product => {
      const productAsin = String(product.asin).trim().toUpperCase();
      const usPriceInfo = usPricing[productAsin] || { price: 0, sellerCount: 0 };
      const jpPriceInfo = jpPricing[productAsin] || { price: 0, sellerCount: 0 };
      const productAttributes = attributes[productAsin] || {
        weight: null,
        volume: null,
        category: 'N/A',
        hasVariations: false,
      };

      const combinedProduct = { 
        ...product,
        asin: productAsin,
        usPrice: usPriceInfo.price, 
        jpPrice: jpPriceInfo.price, 
        usSellerCount: usPriceInfo.sellerCount,
        jpSellerCount: jpPriceInfo.sellerCount, // 日本の出品者数を追加
        ...productAttributes 
      };
      const profitResult = calculateProfit(combinedProduct, settings);
      const exclusionInfo = isExcluded(combinedProduct, settings, profitResult);
      return { ...combinedProduct, ...profitResult, isExcluded: exclusionInfo.excluded, exclusionReason: exclusionInfo.reason };
    });
  }

  if (isCancelled()) throw new Error('検索がキャンセルされました。');

  updateProgress('リサーチログを保存しています。');
  const logMeta = await researchLogger.saveResearchLog(userId, { searchType, query, classificationId: classificationId || null }, finalResults);
  return { message: `${logMeta.resultCount}件の商品が見つかりました。ログに保存しました。`, log: logMeta, products: finalResults };
}

apiRouter.get('/search', async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await runProductSearch(userId, req.query);
    res.json(result);
  } catch (error) {
    const isBadRequest = ['検索タイプとクエリは必須です。', '無効な検索タイプです。'].includes(error.message);
    if (!isBadRequest) {
      console.error('リサーチ処理中にエラーが発生しました:', error);
    }
    res.status(isBadRequest ? 400 : 500).json({ error: error.message || 'サーバー内部でエラーが発生しました。' });
  }
});

apiRouter.post('/search-jobs', async (req, res) => {
  const userId = req.user.userId;
  const params = req.body || {};
  if (!params.searchType || !params.query) {
    return res.status(400).json({ error: '検索タイプとクエリは必須です。' });
  }

  const name = params.name || `${params.searchType}: ${Array.isArray(params.query) ? params.query.join(', ') : params.query}`;
  const job = searchJobManager.createSearchJob(userId, name, params, ({ isCancelled, update }) => (
    runProductSearch(userId, params, { isCancelled, updateProgress: update })
  ));
  res.status(202).json({ job });
});

apiRouter.get('/search-jobs/:jobId', async (req, res) => {
  const job = searchJobManager.getSearchJob(req.user.userId, req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: '検索ジョブが見つかりません。' });
  }
  res.json({ job });
});

apiRouter.delete('/search-jobs/:jobId', async (req, res) => {
  const job = searchJobManager.cancelSearchJob(req.user.userId, req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: '検索ジョブが見つかりません。' });
  }
  res.json({ job });
});

apiRouter.get('/settings', async (req, res) => {
  try {
    const settings = await loadSettings(req.user.userId);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: '設定の取得中にエラーが発生しました。' });
  }
});
apiRouter.post('/settings', async (req, res) => {
  try {
    await saveSettings(req.user.userId, req.body);
    res.json({ message: '設定が保存されました。' });
  } catch (error) {
    res.status(500).json({ error: '設定の保存中にエラーが発生しました。' });
  }
});

apiRouter.post('/settings/exchange-rate/refresh', async (req, res) => {
  try {
    console.log(`[ExchangeRateRefresh] Starting refresh for user: ${req.user.userId}`);
    const settings = await loadSettings(req.user.userId);
    console.log(`[ExchangeRateRefresh] Current settings loaded.`);
    
    const updatedSettings = await applyLatestExchangeRate({
      ...settings,
      autoExchangeRateEnabled: true,
    });
    console.log(`[ExchangeRateRefresh] Latest exchange rate applied successfully.`);
    
    await saveSettings(req.user.userId, updatedSettings);
    console.log(`[ExchangeRateRefresh] Updated settings saved to database.`);
    
    res.json({
      message: '為替レートを更新しました。',
      settings: updatedSettings,
    });
  } catch (error) {
    console.error(`[ExchangeRateRefresh Error] User ${req.user.userId}:`, error);
    res.status(500).json({ error: error.message || '為替レートの更新に失敗しました。' });
  }
});

apiRouter.post('/download-csv', async (req, res) => {
    const { logId } = req.body;
    if (!logId) return res.status(400).json({ error: 'ログIDが必要です。' });
    try {
        const products = await researchLogger.getResearchLogDetails(req.user.userId, logId);
        if (!products) return res.status(404).json({ error: '指定されたログが見つかりません。' });
        const csvKeys = [
            { field: 'asin', title: 'ASIN' },
            { field: 'productName', title: '商品名' },
            { field: 'brand', title: 'ブランド' },
            { field: 'category', title: 'カテゴリ' },
            { field: 'weight', title: '重量' },
            { field: 'volume', title: '体積' },
            { field: 'hasVariations', title: 'バリエーション有無' },
            { field: 'usPrice', title: '米国価格 (USD)' },
            { field: 'jpPrice', title: '日本価格 (JPY)' },
            { field: 'usSellerCount', title: '米国出品者数' },
            { field: 'profitJpy', title: '利益 (JPY)' },
            { field: 'profitRate', title: '利益率 (%)' },
            { field: 'sellingPriceJpy', title: '販売価格 (JPY換算)' },
            { field: 'totalCostJpy', title: '総コスト (JPY)' },
            { field: 'procurementCostJpy', title: '仕入れ価格 (JPY)' },
            { field: 'internationalShippingCostJpy', title: '国際送料 (JPY)' },
            { field: 'shippingWeightGrams', title: '送料計算重量 (g)' },
            { field: 'isShippingWeightEstimated', title: '送料重量推定' },
            { field: 'customsDutyJpy', title: '関税 (JPY)' },
            { field: 'amazonFeeJpy', title: 'Amazon手数料 (JPY)' },
            { field: 'isExcluded', title: '除外対象' },
            { field: 'exclusionReason', title: '除外理由' }
        ];
        const csv = await json2csv(products, { keys: csvKeys });
        res.header('Content-Type', 'text/csv');
        res.attachment(`research_log_${logId}.csv`);
        res.send('\uFEFF' + csv);
    } catch (error) {
        res.status(500).json({ error: 'CSVファイルの生成中にエラーが発生しました。' });
    }
});

apiRouter.post('/listing', async (req, res) => {
    const { asin, price, quantity, marketplaceId, productType } = req.body;
    const userId = req.user.userId;
    if (!asin || !price || !quantity || !marketplaceId) return res.status(400).json({ error: '情報不足' });
    try {
        const settings = await loadSettings(userId);
        let currentListing = await listingManager.getTrackedListingByAsin(userId, asin);
        let skuToUse;
        if (currentListing) {
            skuToUse = currentListing.sku;
        } else {
            skuToUse = `AUTO-${Date.now()}-${asin}`;
        }

        // 日本側の最新情報を取得してリードタイムを計算
        const jpPricing = await getCompetitivePricingForAsins([asin], JP_MARKETPLACE_ID, userId);
        const jpInfo = jpPricing[asin] || { leadTime: 2 };
        const leadTimeBuffer = settings.leadTimeBuffer || 3;
        const calculatedLeadTime = (jpInfo.leadTime || 2) + leadTimeBuffer;

        // productType と計算した leadTime を渡すように修正
        const result = await putListingsItem(asin, skuToUse, price, quantity, marketplaceId, userId, productType || 'GENERIC', calculatedLeadTime);
        
        if (result.status === 'INCOMPLETE') {
            console.log(`[Server] SKU ${skuToUse} is incomplete on Amazon. Deleting immediately.`);
            try {
                await deleteListingsItem(skuToUse, marketplaceId, userId);
            } catch (delError) {
                console.error(`[Server] Failed to delete incomplete SKU ${skuToUse}:`, delError.message);
            }
            return res.status(400).json({ error: 'Amazonのカタログ情報が不足しているため、出品できませんでした。この商品は自動的に除外されました。' });
        }

        await listingManager.addTrackedListing(userId, skuToUse, asin, marketplaceId, quantity, price, productType || 'GENERIC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.delete('/listing', async (req, res) => {
    const { sku, marketplaceId } = req.body;
    try {
        const result = await deleteListingsItem(sku, marketplaceId, req.user.userId);
        await removeTrackedListing(req.user.userId, sku, marketplaceId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

apiRouter.post('/bulk-listing-from-asins', async (req, res) => {
    const { asins, title } = req.body;
    const userId = req.user.userId;
    const marketplaceId = US_MARKETPLACE_ID;

    let isCancelled = false;
    // 意図しない切断で一括出品が強制終了されるのを防ぐため、キャンセル処理をコメントアウト
    // req.on('close', () => { isCancelled = true; });

    if (!asins || asins.length === 0) return res.status(400).json({ error: 'ASINリストは必須です。' });

    res.status(202).json({ message: `開始しました。` });

    let logMeta;
    try {
        logMeta = await listingLogger.createListingLog(userId, title || '一括出品', asins.length);
        const settings = await loadSettings(userId);
        await listingLogger.updateListingLog(userId, logMeta.id, {
            processedAsinCount: 0,
            summary: '商品情報を取得しています...'
        });
        const allProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled);
        const pricingAsins = allProducts.map(p => p.asin);
        await listingLogger.updateListingLog(userId, logMeta.id, {
            processedAsinCount: 0,
            resolvedAsinCount: pricingAsins.length,
            summary: `${pricingAsins.length}件の商品情報を取得しました。価格と属性を取得しています...`
        });
        const [usPricing, jpPricing, attributes] = await Promise.all([
            getCompetitivePricingForAsins(pricingAsins, US_MARKETPLACE_ID, userId, () => isCancelled),
            getCompetitivePricingForAsins(pricingAsins, JP_MARKETPLACE_ID, userId, () => isCancelled),
            getProductAttributesForAsins(pricingAsins, US_MARKETPLACE_ID, userId, () => isCancelled)
        ]);

        let listedCount = 0;
        let processedCount = 0;
        const detailLogs = [];
        for (const product of allProducts) {
            if (isCancelled) break;
            processedCount++;
            const existingListing = await listingManager.getTrackedListingByAsin(userId, product.asin);
            if (existingListing) {
                detailLogs.push({
                    asin: product.asin,
                    sku: existingListing.sku,
                    status: 'skipped',
                    reason: '既に出品管理中のASINです。'
                });
                if (processedCount % 5 === 0 || processedCount === allProducts.length) {
                    await listingLogger.updateListingLog(userId, logMeta.id, {
                        processedAsinCount: processedCount,
                        listedProductCount: listedCount,
                        currentAsin: product.asin,
                        summary: `${processedCount}/${allProducts.length}件を処理しました。`
                    });
                }
                continue;
            }

            const usPriceInfo = usPricing[product.asin];
            const jpPriceInfo = jpPricing[product.asin];
            if (!usPriceInfo || !jpPriceInfo) {
                detailLogs.push({ asin: product.asin, status: 'skipped', reason: '価格不足' });
                if (processedCount % 5 === 0 || processedCount === allProducts.length) {
                    await listingLogger.updateListingLog(userId, logMeta.id, {
                        processedAsinCount: processedCount,
                        listedProductCount: listedCount,
                        currentAsin: product.asin,
                        summary: `${processedCount}/${allProducts.length}件を処理しました。`
                    });
                }
                continue;
            }
            const productAttributes = attributes[product.asin] || {};
            const combinedProduct = {
                ...product,
                ...productAttributes,
                usPrice: usPriceInfo.price,
                jpPrice: jpPriceInfo.price
            };
            const profitResult = calculateProfit(combinedProduct, settings);
            const exclusionInfo = isExcluded(combinedProduct, settings, profitResult);

            if (exclusionInfo.excluded) {
                detailLogs.push({ asin: product.asin, status: 'skipped', reason: exclusionInfo.reason });
                if (processedCount % 5 === 0 || processedCount === allProducts.length) {
                    await listingLogger.updateListingLog(userId, logMeta.id, {
                        processedAsinCount: processedCount,
                        listedProductCount: listedCount,
                        currentAsin: product.asin,
                        summary: `${processedCount}/${allProducts.length}件を処理しました。`
                    });
                }
                continue;
            }
            let skuToUse = `AUTO-${Date.now()}-${product.asin}`;
            try {
                // 正しい productType と 日本の出品者数を数量として渡すように修正
                const quantityToUse = jpPriceInfo.sellerCount > 0 ? jpPriceInfo.sellerCount : 1;
                
                // リードタイムの計算: 日本のリードタイム(デフォルト2) + 設定されたバッファ(n値)
                const leadTimeBuffer = settings.leadTimeBuffer || 3;
                const calculatedLeadTime = (jpPriceInfo.leadTime || 2) + leadTimeBuffer;

                await putListingsItem(product.asin, skuToUse, usPriceInfo.price, quantityToUse, marketplaceId, userId, product.productType, calculatedLeadTime);
                await listingManager.addTrackedListing(userId, skuToUse, product.asin, marketplaceId, quantityToUse, usPriceInfo.price, product.productType);
                listedCount++;
                detailLogs.push({ asin: product.asin, sku: skuToUse, status: 'success' });
            } catch(e) {
                detailLogs.push({ asin: product.asin, status: 'error', reason: e.message });
            }
            if (processedCount % 5 === 0 || processedCount === allProducts.length) {
                await listingLogger.updateListingLog(userId, logMeta.id, {
                    processedAsinCount: processedCount,
                    listedProductCount: listedCount,
                    currentAsin: product.asin,
                    summary: `${processedCount}/${allProducts.length}件を処理しました。`
                });
            }
        }
        await listingLogger.updateListingLog(userId, logMeta.id, {
            status: isCancelled ? 'cancelled' : 'completed',
            processedAsinCount: processedCount,
            listedProductCount: listedCount,
            summary: isCancelled ? `${processedCount}/${allProducts.length}件でキャンセルされました。` : `${processedCount}/${allProducts.length}件を処理し、${listedCount}件を出品しました。`,
            details: detailLogs
        });
    } catch (error) {
        if (logMeta) await listingLogger.updateListingLog(userId, logMeta.id, { status: 'error', summary: error.message });
    }
});

apiRouter.get('/listing-logs', async (req, res) => {
    try {
        const logs = await listingLogger.getListingLogs(req.user.userId);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'エラー' });
    }
});

apiRouter.delete('/listing-logs/:logId', async (req, res) => {
    try {
        await listingLogger.deleteListingLog(req.user.userId, req.params.logId);
        res.json({ message: '出品ログを削除しました。' });
    } catch (error) {
        const isNotFound = error.message && error.message.includes('見つかりません');
        const statusCode = isNotFound ? 404 : 400;
        res.status(statusCode).json({ error: error.message || '出品ログの削除に失敗しました。' });
    }
});

apiRouter.get('/research-logs', async (req, res) => {
    try {
        const logs = await researchLogger.getResearchLogs(req.user.userId);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'エラー' });
    }
});

apiRouter.get('/research-logs/:logId', async (req, res) => {
    try {
        const { limit, offset } = req.query;
        const options = limit !== undefined || offset !== undefined ? { limit, offset } : {};
        const details = await researchLogger.getResearchLogDetails(req.user.userId, req.params.logId, options);
        if (!details) {
            return res.status(404).json({ error: 'リサーチログが見つかりません。' });
        }
        res.json(details);
    } catch (error) {
        res.status(500).json({ error: 'エラー' });
    }
});

apiRouter.delete('/research-logs/:logId', async (req, res) => {
    try {
        const deleted = await researchLogger.deleteResearchLog(req.user.userId, req.params.logId);
        if (!deleted) {
            return res.status(404).json({ error: '削除対象のリサーチログが見つかりません。' });
        }
        res.json({ message: 'リサーチログを削除しました。' });
    } catch (error) {
        console.error(`[User ${req.user.userId}] リサーチログ削除エラー:`, error);
        res.status(500).json({ error: 'リサーチログの削除に失敗しました。' });
    }
});

app.use('/api', apiRouter);

async function startServer() {
  try {
    await initDatabase();
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
      startInventoryWatcher();
      startPriceAdjuster();
    });
  } catch (error) {
    console.error('サーバー起動前の初期化に失敗しました:', error);
    process.exit(1);
  }
}

startServer();
