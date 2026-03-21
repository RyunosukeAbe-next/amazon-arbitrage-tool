console.log("--- Server script started ---");
// .envファイルから環境変数を読み込む
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// サービスとミドルウェアの読み込み
const { searchProductsByKeywords, getCompetitivePricingForAsins, getCatalogItemsByAsins, putListingsItem, deleteListingsItem } = require('./services/sp-api-client');
const { json2csv } = require('json-2-csv');
const { loadSettings, saveSettings } = require('./services/settings-manager');
const { calculateProfit, isExcluded } = require('./services/profit-calculator');
const { addTrackedListing, removeTrackedListing } = require('./services/listing-manager');
const { getASINsBySellerId } = require('./services/keepa-api-client');
const researchLogger = require('./services/research-logger'); // ★ 追加
const { startInventoryWatcher } = require('./services/inventory-watcher');
const { startPriceAdjuster } = require('./services/price-adjuster');
const listingLogger = require('./services/listing-logger');
const userManager = require('./services/user-manager');
const listingManager = require('./services/listing-manager'); // ★ 追加
const authenticate = require('./middleware/authenticate');
const amazonAuthService = require('./services/amazon-auth-service'); // ★ 追加

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// --- 認証が必要なAPIルート ---
const apiRouter = express.Router();
apiRouter.use(authenticate);

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const JP_MARKETPLACE_ID = 'A1VC38T7YXB528';

// --- 認証が不要なAPIルート (Auth) ---
const authRouter = express.Router();
// (変更なし)
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
}
);
app.use('/api/auth', authRouter);

// --- Amazon OAuth 関連API ---
// 認証が必要なAPIルートの前に定義
apiRouter.get('/amazon/authorize', authenticate, (req, res) => {
    try {
        // CSRF対策としてstateを生成し、セッションなどで保持することを推奨
        const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        // ここでは簡易的にユーザーIDとstateを紐付けますが、本来はDB等に保存して検証すべきです。
        // req.session.oauthState = state; // セッションを使う場合
        console.log(`[User ${req.user.userId}] Generating Amazon Authorization URL with state: ${state}`);
        const authUrl = amazonAuthService.getAuthorizationUrl(state);
        res.json({ authorizationUrl: authUrl, state: state }); // フロントエンドにURLとstateを返す
    } catch (error) {
        console.error('Amazon認証URLの生成中にエラー:', error);
        res.status(500).json({ error: error.message || 'Amazon認証URLの生成に失敗しました。' });
    }
});

apiRouter.get('/amazon/callback', authenticate, async (req, res) => {
    const { code, state, selling_partner_id, spapi_oauth_code } = req.query;
    const userId = req.user.userId;

    // TODO: stateの検証 (CSRF対策) - req.session.oauthState と state を比較するなど

    if (!code) {
        return res.status(400).json({ error: '認証コードがありません。' });
    }

    try {
        console.log(`[User ${userId}] Exchanging Amazon authorization code for tokens.`);
        const tokens = await amazonAuthService.exchangeCodeForTokens(code);
        
        // ユーザーIDとSPIDを紐付けて認証情報を保存
        await amazonAuthService.saveUserAmazonAuth(userId, {
            ...tokens,
            sellingPartnerId: selling_partner_id, // SP-APIからのSelling Partner ID
            marketplaceId: US_MARKETPLACE_ID, // 今回はUS固定とするが、本来は複数対応可能
            linkedAt: new Date().toISOString(),
        });

        console.log(`[User ${userId}] Amazon認証情報が正常に保存されました。`);
        // フロントエンドに成功を通知、またはリダイレクト
        res.status(200).json({ message: 'Amazonアカウントとの連携に成功しました。' });
    } catch (error) {
        console.error('Amazon認証コールバック処理中にエラー:', error);
        res.status(500).json({ error: error.message || 'Amazonアカウントとの連携に失敗しました。' });
    }
});

apiRouter.get('/amazon/auth-status', authenticate, async (req, res) => {
    try {
        const authData = await amazonAuthService.loadUserAmazonAuth(req.user.userId);
        if (authData) {
            res.json({
                isLinked: true,
                sellingPartnerId: authData.sellingPartnerId,
                linkedAt: authData.linkedAt,
                // アクセストークンの有効期限などの情報も返せる
            });
        } else {
            res.json({ isLinked: false });
        }
    } catch (error) {
        console.error(`[User ${req.user.userId}] Amazon認証ステータス取得中にエラー:`, error);
        res.status(500).json({ error: 'Amazon認証ステータスの取得に失敗しました。' });
    }
});

apiRouter.delete('/amazon/disconnect', authenticate, async (req, res) => {
    const userId = req.user.userId;
    try {
        const authFilePath = amazonAuthService.getUserAuthFilePath(userId);
        await fs.unlink(authFilePath); // 認証ファイルを削除
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

    // ステップ1: 検索タイプに応じてASINリストと基本商品情報を取得
    if (searchType === 'keyword') {
      spApiProducts = await searchProductsByKeywords(query.split(','), US_MARKETPLACE_ID, userId, classificationId, () => isCancelled);
      if (spApiProducts.length > 0) {
        asins = spApiProducts.map(p => p.asin);
      }
    } else if (searchType === 'seller') {
      const sellerId = query;
      console.log(`[DEBUG] Seller Search: Fetching ASINs for seller ID: ${sellerId}`);
      asins = await getASINsBySellerId(sellerId, 'com'); // keepa-api-clientはキャンセル非対応
      console.log(`[DEBUG] Seller Search: Keepa API returned ${asins.length} ASINs.`);
      
      if (isCancelled) return;

      if (asins.length > 0) {
        console.log(`[DEBUG] Seller Search: Fetching catalog items for ${asins.length} ASINs from SP-API.`);
        spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled); // ★ userIdを追加
        console.log(`[DEBUG] Seller Search: SP-API returned ${spApiProducts.length} catalog items.`);
      } else {
        console.log(`[DEBUG] Seller Search: No ASINs found by Keepa API for seller ID: ${sellerId}.`);
      }
    } else if (searchType === 'asin') {
      asins = Array.isArray(query) ? query : query.split(/[\s,]+/);
      if (asins.length > 0) {
        spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled); // ★ userIdを追加
      }
    } else {
      return res.status(400).json({ error: '無効な検索タイプです。' });
    }

    if (isCancelled) return;

    // ステップ2: 商品情報と価格情報を取得し、利益計算
    let finalResults = [];
    if (spApiProducts.length > 0) {
      const [usPricing, jpPricing] = await Promise.all([
        getCompetitivePricingForAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled),
        getCompetitivePricingForAsins(asins, JP_MARKETPLACE_ID, userId, () => isCancelled)
      ]);

      if (isCancelled) return;

      finalResults = spApiProducts.map(product => {
        const usPriceInfo = usPricing[product.asin] || { price: 0, sellerCount: 0 };
        const jpPriceInfo = jpPricing[product.asin] || { price: 0 };
        const combinedProduct = { ...product, usPrice: usPriceInfo.price, jpPrice: jpPriceInfo.price, usSellerCount: usPriceInfo.sellerCount };
        const profitResult = calculateProfit(combinedProduct, settings);
        const excluded = isExcluded(combinedProduct, settings);
        return { ...combinedProduct, ...profitResult, isExcluded: excluded };
      });
    }

    if (isCancelled) return;

    // ステップ3: 結果をログに保存
    const logMeta = await researchLogger.saveResearchLog(
      userId,
      { searchType, query, classificationId: classificationId || null },
      finalResults
    );

    // isCancelledチェック後なので、クライアントはまだ接続しているはず
    res.json({ message: `${logMeta.resultCount}件の商品が見つかりました。ログに保存しました。`, log: logMeta, products: finalResults });

  } catch (error) {
    if (!isCancelled) {
      console.error('リサーチ処理中にエラーが発生しました:', error);
      res.status(500).json({ error: error.message || 'サーバー内部でエラーが発生しました。' });
    }
  }
});

// (settings, download-csv, listing, bulk-listing は変更なし)
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
    const { logId } = req.body; // logIdでリクエストするように変更
    if (!logId) {
        return res.status(400).json({ error: 'ログIDが必要です。' });
    }
    try {
        const products = await researchLogger.getResearchLogDetails(req.user.userId, logId);
        if (!products) {
            return res.status(404).json({ error: '指定されたログが見つかりません。' });
        }
        
        // 日本語ヘッダーのマッピング
        const csvKeys = [
            { field: 'asin', title: 'ASIN' },
            { field: 'productName', title: '商品名' },
            { field: 'brand', title: 'ブランド' },
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
            { field: 'isExcluded', title: '除外対象' }
        ];

        const csv = await json2csv(products, { keys: csvKeys });
        const csvWithBom = '\uFEFF' + csv;
        res.header('Content-Type', 'text/csv');
        res.attachment(`research_log_${logId}.csv`);
        res.send(csvWithBom);
    } catch (error) {
        res.status(500).json({ error: 'CSVファイルの生成中にエラーが発生しました。' });
    }
});
apiRouter.post('/listing', async (req, res) => {
    const { asin, price, quantity, marketplaceId } = req.body; // skuは自動生成または既存を使用するため削除
    const userId = req.user.userId;

    if (!asin || !price || !quantity || !marketplaceId) {
        return res.status(400).json({ error: '出品に必要な情報が不足しています。' });
    }

    try {
        let currentListing = await listingManager.getTrackedListingByAsin(userId, asin);
        let skuToUse;

        if (currentListing) {
            // 既存の出品がある場合は、そのSKUを使用
            skuToUse = currentListing.sku;
            console.log(`[User ${userId}] ASIN ${asin} は既に出品済みです。SKU ${skuToUse} を使用して更新します。`);
        } else {
            // 新規出品の場合、SKUを生成
            const now = new Date();
            const randomNum = Math.floor(1000 + Math.random() * 9000); // 4桁の乱数
            skuToUse = `AUTO-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${asin}-${randomNum}`;
            console.log(`[User ${userId}] ASIN ${asin} を新規出品します。SKU ${skuToUse} を生成しました。`);
        }

        const result = await putListingsItem(asin, skuToUse, price, quantity, marketplaceId, userId);
        await listingManager.addTrackedListing(userId, skuToUse, asin, marketplaceId, quantity); // SKUを渡すように変更
        res.json(result);
    } catch (error) {
        console.error(`[User ${userId}] 出品処理中にエラーが発生しました:`, error);
        res.status(500).json({ error: error.message || '出品処理中にエラーが発生しました。' });
    }
});
apiRouter.delete('/listing', async (req, res) => {
    const { sku, marketplaceId } = req.body;
    if (!sku || !marketplaceId) {
        return res.status(400).json({ error: '出品削除に必要な情報が不足しています。' });
    }
    try {
        const result = await deleteListingsItem(sku, marketplaceId, req.user.userId);
        await removeTrackedListing(req.user.userId, sku, marketplaceId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || '出品削除処理中にエラーが発生しました。' });
    }
});
apiRouter.post('/bulk-listing', async (req, res) => {
    const { asins } = req.body;
    const userId = req.user.userId;
    const marketplaceId = 'ATVPDKIKX0DER';
    const defaultQuantity = 1;

    if (!asins || !Array.isArray(asins) || asins.length === 0) {
        return res.status(400).json({ error: 'ASINリストが必要です。' });
    }
    console.log(`[ユーザーID: ${userId}] 一括出品リクエストを受け付けました。対象ASIN数: ${asins.length}`);
    try {
        const prices = await getCompetitivePricingForAsins(asins, marketplaceId, userId);
        const promises = asins.map(async (asin) => {
            const priceInfo = prices[asin];
            if (!priceInfo || !priceInfo.price) return `ASIN: ${asin} - 価格が取得できず、スキップしました。`;
            
            let currentListing = await listingManager.getTrackedListingByAsin(userId, asin);
            let skuToUse;

            if (currentListing) {
                skuToUse = currentListing.sku;
                console.log(`[User ${userId}] ASIN ${asin} は既に出品済みです。SKU ${skuToUse} を使用して更新します。`);
            } else {
                const now = new Date();
                const randomNum = Math.floor(1000 + Math.random() * 9000); // 4桁の乱数
                skuToUse = `AUTO-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${asin}-${randomNum}`;
                console.log(`[User ${userId}] ASIN ${asin} を新規出品します。SKU ${skuToUse} を生成しました。`);
            }

            const price = priceInfo.price;
            const quantity = defaultQuantity;
            try {
                await putListingsItem(asin, skuToUse, price, quantity, marketplaceId, userId);
                await listingManager.addTrackedListing(userId, skuToUse, asin, marketplaceId, quantity);
                return `ASIN: ${asin} - SKU: ${skuToUse}, 価格: $${price} で出品に成功しました。`;
            } catch (e) {
                return `ASIN: ${asin} - 出品処理中にエラーが発生しました: ${e.message}`;
            }
        });
        const results = await Promise.allSettled(promises);
        const details = results.map((result, index) => {
            if (result.status === 'fulfilled') return result.value;
            else return `ASIN: ${asins[index]} - 予期せぬエラーが発生しました: ${result.reason}`;
        }).join('\\n');
        res.json({ message: '一括出品処理が完了しました。', details });
    } catch (error) {
        console.error(`[ユーザーID: ${userId}] 一括出品処理のメインプロセスでエラー:`, error);
        res.status(500).json({ error: '一括出品処理中にサーバーエラーが発生しました。' });
    }
});

// ▼▼▼ 新しい出品処理API ▼▼▼
apiRouter.post('/bulk-listing-from-asins', async (req, res) => {
    const { asins, title } = req.body;
    const userId = req.user.userId;
    const marketplaceId = US_MARKETPLACE_ID;

    let isCancelled = false;
    req.on('close', () => {
        isCancelled = true;
        console.log(`[Request cancelled] User: ${userId}, Bulk Listing from ASINs`);
    });

    if (!asins || !Array.isArray(asins) || asins.length === 0) {
        return res.status(400).json({ error: 'ASINリストは必須です。' });
    }

    const logTitle = title || 'ASINリストからの自動出品';
    // 先にリクエスト成功のレスポンスを返す
    res.status(202).json({ message: `${logTitle} を開始しました。出品ログ画面で進捗を確認してください。` });

    let logMeta;
    const detailLogs = [];
    try {
        logMeta = await listingLogger.createListingLog(userId, logTitle, asins.length);
        if (isCancelled) return;
        
        const settings = await loadSettings(userId);
        if (isCancelled) return;

        const allProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID, userId, () => isCancelled);
        if (isCancelled) return;

        const pricingAsins = allProducts.map(p => p.asin);
        const [usPricing, jpPricing] = await Promise.all([
            getCompetitivePricingForAsins(pricingAsins, US_MARKETPLACE_ID, userId, () => isCancelled),
            getCompetitivePricingForAsins(pricingAsins, JP_MARKETPLACE_ID, userId, () => isCancelled)
        ]);

        if (isCancelled) return;

        let listedCount = 0;
        for (const product of allProducts) {
            if (isCancelled) break;

            const usPriceInfo = usPricing[product.asin];
            const jpPriceInfo = jpPricing[product.asin];
            
            if (!usPriceInfo || !jpPriceInfo) {
                detailLogs.push({ asin: product.asin, status: 'skipped', reason: '価格情報が不足しています。' });
                continue;
            }

            const combinedProduct = { ...product, usPrice: usPriceInfo.price, jpPrice: jpPriceInfo.price, usSellerCount: usPriceInfo.sellerCount };
            const profitResult = calculateProfit(combinedProduct, settings);
            const excluded = isExcluded(combinedProduct, settings, profitResult);

            if (excluded) {
                detailLogs.push({ asin: product.asin, status: 'skipped', reason: `除外条件に一致 (${excluded.reason})` });
                continue;
            }
            
            // SKUを生成または既存を使用
            let skuToUse;
            let currentListing = await listingManager.getTrackedListingByAsin(userId, product.asin);

            if (currentListing) {
                skuToUse = currentListing.sku;
                console.log(`[User ${userId}] ASIN ${product.asin} は既に出品済みです。SKU ${skuToUse} を使用して更新します。`);
            } else {
                const now = new Date();
                const randomNum = Math.floor(1000 + Math.random() * 9000); // 4桁の乱数
                skuToUse = `AUTO-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${product.asin}-${randomNum}`;
                console.log(`[User ${userId}] ASIN ${product.asin} を新規出品します。SKU ${skuToUse} を生成しました。`);
            }

            const quantity = 1; // 固定
            
            try {
                await putListingsItem(product.asin, skuToUse, usPriceInfo.price, quantity, marketplaceId, userId);
                await listingManager.addTrackedListing(userId, skuToUse, product.asin, marketplaceId, quantity);
                listedCount++;
                detailLogs.push({ asin: product.asin, sku: skuToUse, status: 'success' });
            } catch(e) {
                detailLogs.push({ asin: product.asin, status: 'error', reason: e.message });
            }
        }

        await listingLogger.updateListingLog(userId, logMeta.id, {
            status: isCancelled ? 'cancelled' : 'completed',
            listedProductCount: listedCount,
            summary: isCancelled ? '処理が途中でキャンセルされました。' : `処理が完了し、${listedCount}件の商品を出品しました。`,
            details: detailLogs
        });

    } catch (error) {
        console.error(`[UserID: ${userId}] Bulk listing from ASINs failed:`, error);
        if (logMeta) {
            await listingLogger.updateListingLog(userId, logMeta.id, {
                status: 'error',
                summary: `エラーが発生しました: ${error.message}`,
                details: detailLogs
            });
        }
    }
});


// ▼▼▼ ログ用の新しいAPI ▼▼▼
apiRouter.get('/listing-logs', async (req, res) => {
    try {
        const logs = await listingLogger.getListingLogs(req.user.userId);
        res.json(logs);
    } catch (error) {
        console.error(`[UserID: ${req.user.userId}] Error getting listing logs:`, error);
        res.status(500).json({ error: '出品ログの取得中にエラーが発生しました。' });
    }
});

apiRouter.delete('/listing-logs/:logId', async (req, res) => {
    const { logId } = req.params;
    const userId = req.user.userId;
    try {
        await listingLogger.deleteListingLog(userId, logId);
        res.json({ message: 'ログが正常に削除されました。' });
    } catch (error) {
        console.error(`[UserID: ${userId}] Error deleting listing log ${logId}:`, error);
        // "完了したログは削除できません。"のようなユーザー起因のエラーと、その他のサーバーエラーを区別
        if (error.message.includes('削除できません') || error.message.includes('見つかりません')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'ログの削除中にサーバーエラーが発生しました。' });
        }
    }
});

apiRouter.get('/research-logs', async (req, res) => {
    try {
        const logs = await researchLogger.getResearchLogs(req.user.userId);
        res.json(logs);
    } catch (error) {
        console.error(`[UserID: ${req.user.userId}] ログ一覧の取得中にエラー:`, error);
        res.status(500).json({ error: 'ログ一覧の取得中にエラーが発生しました。' });
    }
});

apiRouter.get('/research-logs/:logId', async (req, res) => {
    try {
        const { logId } = req.params;
        const details = await researchLogger.getResearchLogDetails(req.user.userId, logId);
        if (details) {
            res.json(details);
        } else {
            res.status(404).json({ error: '指定されたログが見つかりません。' });
        }
    } catch (error) {
        console.error(`[UserID: ${req.user.userId}] ログ詳細の取得中にエラー:`, error);
        res.status(500).json({ error: 'ログ詳細の取得中にエラーが発生しました。' });
    }
});

apiRouter.delete('/research-logs/:logId', async (req, res) => {
    try {
        const { logId } = req.params;
        const success = await researchLogger.deleteResearchLog(req.user.userId, logId);
        if (success) {
            res.json({ message: 'ログが削除されました。' });
        } else {
            res.status(404).json({ error: '削除対象のログが見つかりません。' });
        }
    } catch (error) {
        console.error(`[UserID: ${req.user.userId}] ログの削除中にエラー:`, error);
        res.status(500).json({ error: 'ログの削除中にエラーが発生しました。' });
    }
});


app.use('/api', apiRouter);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  startInventoryWatcher();
  startPriceAdjuster();
});

console.log("--- Server script finished ---");
