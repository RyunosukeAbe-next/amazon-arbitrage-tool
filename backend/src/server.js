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
const userManager = require('./services/user-manager');
const authenticate = require('./middleware/authenticate');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

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
});
app.use('/api/auth', authRouter);


// --- 認証が必要なAPIルート ---
const apiRouter = express.Router();
apiRouter.use(authenticate);

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const JP_MARKETPLACE_ID = 'A1VC38T7YXB528';

// ▼▼▼ /api/search の改修 ▼▼▼
apiRouter.get('/search', async (req, res) => {
  const { searchType, query, classificationId } = req.query;
  const userId = req.user.userId;

  if (!searchType || !query) {
    return res.status(400).json({ error: '検索タイプとクエリは必須です。' });
  }

  try {
    const settings = await loadSettings(userId);
    let spApiProducts = [];
    let asins = [];

    // ステップ1: 検索タイプに応じてASINリストと基本商品情報を取得
    if (searchType === 'keyword') {
      spApiProducts = await searchProductsByKeywords(query.split(','), US_MARKETPLACE_ID, classificationId);
      if (spApiProducts.length > 0) {
        asins = spApiProducts.map(p => p.asin);
      }
    } else if (searchType === 'seller') {
      const sellerId = query;
      console.log(`[DEBUG] Seller Search: Fetching ASINs for seller ID: ${sellerId}`); // 追加
      asins = await getASINsBySellerId(sellerId, 'com');
      console.log(`[DEBUG] Seller Search: Keepa API returned ${asins.length} ASINs. ASINs: ${asins.join(', ')}`); // 追加

      if (asins.length > 0) {
        console.log(`[DEBUG] Seller Search: Fetching catalog items for ${asins.length} ASINs from SP-API.`); // 追加
        spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID);
        console.log(`[DEBUG] Seller Search: SP-API returned ${spApiProducts.length} catalog items.`); // 追加
      } else {
        console.log(`[DEBUG] Seller Search: No ASINs found by Keepa API for seller ID: ${sellerId}.`); // 追加
      }
    } else if (searchType === 'asin') {
      asins = Array.isArray(query) ? query : query.split(/[\s,]+/);
      if (asins.length > 0) {
        spApiProducts = await getCatalogItemsByAsins(asins, US_MARKETPLACE_ID);
      }
    } else {
      return res.status(400).json({ error: '無効な検索タイプです。' });
    }

    // ステップ2: 商品情報と価格情報を取得し、利益計算
    let finalResults = [];
    if (spApiProducts.length > 0) {
      const [usPricing, jpPricing] = await Promise.all([
        getCompetitivePricingForAsins(asins, US_MARKETPLACE_ID),
        getCompetitivePricingForAsins(asins, JP_MARKETPLACE_ID)
      ]);

      finalResults = spApiProducts.map(product => {
        const usPriceInfo = usPricing[product.asin] || { price: 0, sellerCount: 0 };
        const jpPriceInfo = jpPricing[product.asin] || { price: 0 };
        const combinedProduct = { ...product, usPrice: usPriceInfo.price, jpPrice: jpPriceInfo.price, usSellerCount: usPriceInfo.sellerCount };
        const profitResult = calculateProfit(combinedProduct, settings);
        const excluded = isExcluded(combinedProduct, settings);
        return { ...combinedProduct, ...profitResult, isExcluded: excluded };
      });
    }

    // ステップ3: 結果をログに保存
    const logMeta = await researchLogger.saveResearchLog(
      userId,
      { searchType, query, classificationId: classificationId || null },
      finalResults
    );

    res.json({ message: `${logMeta.resultCount}件の商品が見つかりました。ログに保存しました。`, log: logMeta, products: finalResults });

  } catch (error) {
    console.error('リサーチ処理中にエラーが発生しました:', error);
    res.status(500).json({ error: error.message || 'サーバー内部でエラーが発生しました。' });
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
        const csv = await json2csv(products);
        res.header('Content-Type', 'text/csv');
        res.attachment(`research_log_${logId}.csv`);
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: 'CSVファイルの生成中にエラーが発生しました。' });
    }
});
apiRouter.post('/listing', async (req, res) => {
    const { asin, sku, price, quantity, marketplaceId } = req.body;
    if (!asin || !sku || !price || !quantity || !marketplaceId) {
        return res.status(400).json({ error: '出品に必要な情報が不足しています。' });
    }
    try {
        const result = await putListingsItem(asin, sku, price, quantity, marketplaceId);
        await addTrackedListing(req.user.userId, sku, asin, marketplaceId, quantity);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || '出品処理中にエラーが発生しました。' });
    }
});
apiRouter.delete('/listing', async (req, res) => {
    const { sku, marketplaceId } = req.body;
    if (!sku || !marketplaceId) {
        return res.status(400).json({ error: '出品削除に必要な情報が不足しています。' });
    }
    try {
        const result = await deleteListingsItem(sku, marketplaceId);
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
        const prices = await getCompetitivePricingForAsins(asins, marketplaceId);
        const promises = asins.map(async (asin) => {
            const priceInfo = prices[asin];
            if (!priceInfo || !priceInfo.price) return `ASIN: ${asin} - 価格が取得できず、スキップしました。`;
            const now = new Date();
            const sku = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${asin}`;
            const price = priceInfo.price;
            const quantity = defaultQuantity;
            try {
                await putListingsItem(sku, asin, price, quantity, marketplaceId);
                await addTrackedListing(userId, sku, asin, marketplaceId, quantity);
                return `ASIN: ${asin} - SKU: ${sku}, 価格: $${price} で出品に成功しました。（ダミー）`;
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

// ▼▼▼ リサーチログ用の新しいAPI ▼▼▼
apiRouter.get('/research-logs', async (req, res) => {
    try {
        const logs = await researchLogger.getResearchLogs(req.user.userId);
        res.json(logs);
    } catch (error) {
        console.error(`[ユーザーID: ${req.user.userId}] ログ一覧の取得中にエラー:`, error);
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
        console.error(`[ユーザーID: ${req.user.userId}] ログ詳細の取得中にエラー:`, error);
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
        console.error(`[ユーザーID: ${req.user.userId}] ログの削除中にエラー:`, error);
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
