console.log("--- Server script started ---");
// .envファイルから環境変数を読み込む
const path = require('path');
const fs = require('fs/promises');
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
const researchLogger = require('./services/research-logger'); 
const { startInventoryWatcher } = require('./services/inventory-watcher');
const { startPriceAdjuster } = require('./services/price-adjuster');
const listingLogger = require('./services/listing-logger');
const userManager = require('./services/user-manager');
const listingManager = require('./services/listing-manager'); 
const authenticate = require('./middleware/authenticate');
const amazonAuthService = require('./services/amazon-auth-service'); 

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
        const { code, spapi_oauth_code, selling_partner_id } = req.body;
        const authCode = code || spapi_oauth_code;

        if (!authCode) {
            return res.status(400).json({ error: '認証コードがありません。' });
        }

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

    // 本番環境（Render等）ではドメインを維持したままフロントエンドのルートへリダイレクト
    // ローカル環境では localhost:3000 へリダイレクト
    const frontendRedirectUrl = process.env.NODE_ENV === 'production' 
        ? 'https://amazon-arbitrage-tool-1.onrender.com' 
        : 'http://localhost:3000';

    res.redirect(`${frontendRedirectUrl}/amazon/callback?code=${authCode}&state=${state}&selling_partner_id=${selling_partner_id || ''}`);
});


// --- 認証が必要なAPIルート ---
const apiRouter = express.Router();
apiRouter.use(authenticate);

apiRouter.get('/amazon/authorize', (req, res) => {
    try {
        const state = Math.random().toString(36).substring(2, 15);
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
        const authFilePath = amazonAuthService.getUserAuthFilePath(userId);
        await fs.unlink(authFilePath); 
        res.json({ message: 'Amazonアカウントとの連携を解除しました。' });
    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ error: '連携済みのAmazonアカウントが見つかりません。' });
        }
        console.error(`[User ${userId}] Amazonアカウント連携解除中にエラー:`, error);
        res.status(500).json({ error: 'Amazonアカウント連携の解除に失敗しました。' });
    }
});

apiRouter.get('/search', async (req, res) => {
  const { searchType, query, classificationId } = req.query;
  const userId = req.user.userId;

  let isCancelled = false;
  req.on('close', () => {
    isCancelled = true;
    console.log(`[Request cancelled] User: ${userId}, Search: ${searchType}`);
  });

  if (!searchType || !query) {
    return res.status(400).json({ error: '検索タイプとクエリは必須です。' });
  }

  try {
    const settings = await loadSettings(userId);
    let spApiProducts = [];
    let asins = [];

    if (searchType === 'keyword') {
      spApiProducts = await searchProductsByKeywords(query.split(','), US_MARKETPLACE_ID, userId, classificationId, () => isCancelled);
      if (spApiProducts.length > 0) {
        asins = spApiProducts.map(p => p.asin);
      }
    } else if (searchType === 'seller') {
      const sellerId = query;
      asins = await getASINsBySellerId(sellerId, 'com'); 
      if (isCancelled) return;
      if (asins.length > 0) {
        spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled);
      }
    } else if (searchType === 'asin') {
      asins = Array.isArray(query) ? query : query.split(/[\s,]+/);
      if (asins.length > 0) {
        spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled);
      }
    } else {
      return res.status(400).json({ error: '無効な検索タイプです。' });
    }

    if (isCancelled) return;

    let finalResults = [];
    if (spApiProducts.length > 0) {
      const [usPricing, jpPricing, attributes] = await Promise.all([
        getCompetitivePricingForAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled),
        getCompetitivePricingForAsins(asins, JP_MARKETPLACE_ID, userId, () => isCancelled),
        getProductAttributesForAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled)
      ]);

      if (isCancelled) return;

      finalResults = spApiProducts.map(product => {
        const usPriceInfo = usPricing[product.asin] || { price: 0, sellerCount: 0 };
        const jpPriceInfo = jpPricing[product.asin] || { price: 0 };
        const productAttributes = attributes[product.asin] || {};

        const combinedProduct = { 
          ...product, 
          usPrice: usPriceInfo.price, 
          jpPrice: jpPriceInfo.price, 
          usSellerCount: usPriceInfo.sellerCount,
          ...productAttributes 
        };
        const profitResult = calculateProfit(combinedProduct, settings);
        const exclusionInfo = isExcluded(combinedProduct, settings, profitResult);
        return { ...combinedProduct, ...profitResult, isExcluded: exclusionInfo.excluded, exclusionReason: exclusionInfo.reason };
      });
    }

    if (isCancelled) return;

    const logMeta = await researchLogger.saveResearchLog(userId, { searchType, query, classificationId: classificationId || null }, finalResults);
    res.json({ message: `${logMeta.resultCount}件の商品が見つかりました。ログに保存しました。`, log: logMeta, products: finalResults });

  } catch (error) {
    if (!isCancelled) {
      console.error('リサーチ処理中にエラーが発生しました:', error);
      res.status(500).json({ error: error.message || 'サーバー内部でエラーが発生しました。' });
    }
  }
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
    const { asin, price, quantity, marketplaceId } = req.body;
    const userId = req.user.userId;
    if (!asin || !price || !quantity || !marketplaceId) return res.status(400).json({ error: '情報不足' });
    try {
        let currentListing = await listingManager.getTrackedListingByAsin(userId, asin);
        let skuToUse;
        if (currentListing) {
            skuToUse = currentListing.sku;
        } else {
            skuToUse = `AUTO-${Date.now()}-${asin}`;
        }
        const result = await putListingsItem(asin, skuToUse, price, quantity, marketplaceId, userId);
        await listingManager.addTrackedListing(userId, skuToUse, asin, marketplaceId, quantity, price);
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
    req.on('close', () => { isCancelled = true; });

    if (!asins || asins.length === 0) return res.status(400).json({ error: 'ASINリストは必須です。' });

    res.status(202).json({ message: `開始しました。` });

    let logMeta;
    try {
        logMeta = await listingLogger.createListingLog(userId, title || '一括出品', asins.length);
        const settings = await loadSettings(userId);
        const allProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled);
        const pricingAsins = allProducts.map(p => p.asin);
        const [usPricing, jpPricing] = await Promise.all([
            getCompetitivePricingForAsins(pricingAsins, US_MARKETPLACE_ID, userId, () => isCancelled),
            getCompetitivePricingForAsins(pricingAsins, JP_MARKETPLACE_ID, userId, () => isCancelled)
        ]);

        let listedCount = 0;
        const detailLogs = [];
        for (const product of allProducts) {
            if (isCancelled) break;
            const usPriceInfo = usPricing[product.asin];
            const jpPriceInfo = jpPricing[product.asin];
            if (!usPriceInfo || !jpPriceInfo) {
                detailLogs.push({ asin: product.asin, status: 'skipped', reason: '価格不足' });
                continue;
            }
            const combinedProduct = { ...product, usPrice: usPriceInfo.price, jpPrice: jpPriceInfo.price };
            const profitResult = calculateProfit(combinedProduct, settings);
            const exclusionInfo = isExcluded(combinedProduct, settings, profitResult);

            if (exclusionInfo.excluded) {
                detailLogs.push({ asin: product.asin, status: 'skipped', reason: exclusionInfo.reason });
                continue;
            }
            let skuToUse = `AUTO-${Date.now()}-${product.asin}`;
            try {
                await putListingsItem(product.asin, skuToUse, usPriceInfo.price, 1, marketplaceId, userId);
                await listingManager.addTrackedListing(userId, skuToUse, product.asin, marketplaceId, 1, usPriceInfo.price);
                listedCount++;
                detailLogs.push({ asin: product.asin, sku: skuToUse, status: 'success' });
            } catch(e) {
                detailLogs.push({ asin: product.asin, status: 'error', reason: e.message });
            }
        }
        await listingLogger.updateListingLog(userId, logMeta.id, {
            status: isCancelled ? 'cancelled' : 'completed',
            listedProductCount: listedCount,
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
        const details = await researchLogger.getResearchLogDetails(req.user.userId, req.params.logId);
        res.json(details);
    } catch (error) {
        res.status(500).json({ error: 'エラー' });
    }
});

app.use('/api', apiRouter);
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  startInventoryWatcher();
  startPriceAdjuster();
});
