const cron = require('node-cron');
const { loadTrackedListings, removeTrackedListing } = require('./listing-manager');
const { getCompetitivePricingForAsins, deleteListingsItem } = require('./sp-api-client');
const { loadSettings } = require('./settings-manager');
const { getAllUsers } = require('./user-manager');
const { calculateProfit, isExcluded } = require('./profit-calculator');

const cronSchedule = '0 * * * *'; 
let isRunning = false;

async function checkAllUsersInventory() {
  if (isRunning) {
    console.log('全ユーザーの在庫チェックは既に実行中です。');
    return;
  }
  
  console.log('全ユーザーの在庫チェックを開始します...');
  isRunning = true;

  try {
    const allUsers = await getAllUsers();
    if (allUsers.length === 0) {
        console.log('処理対象のユーザーがいません。');
        return;
    }

    for (const user of allUsers) {
      console.log(`--- ユーザー[${user.username} (${user.id})] の在庫チェックを開始 ---`);
      await checkInventoryForUser(user.id);
      console.log(`--- ユーザー[${user.username} (${user.id})] の在庫チェックを終了 ---`);
    }

  } catch (error) {
    console.error('全ユーザーの在庫チェック中にエラーが発生しました:', error);
  } finally {
    isRunning = false;
    console.log('全ユーザーの在庫チェックを終了します。');
  }
}

async function checkInventoryForUser(userId) {
  try {
    const trackedListings = await loadTrackedListings(userId);
    if (trackedListings.length === 0) {
      console.log(`[ユーザーID: ${userId}] 追跡中の商品はありません。`);
      return;
    }

    const settings = await loadSettings(userId);
    const inventoryThreshold = settings.inventoryThreshold || 1; 

    const usListings = trackedListings.filter(l => l.marketplaceId === 'ATVPDKIKX0DER');
    if (usListings.length === 0) {
        console.log(`[ユーザーID: ${userId}] 追跡中の米国商品はありません。`);
        return;
    }
    
    const asinsToCheck = usListings.map(l => l.asin);

    const [usPricing, jpPricing] = await Promise.all([
        getCompetitivePricingForAsins(asinsToCheck, 'ATVPDKIKX0DER', userId),
        getCompetitivePricingForAsins(asinsToCheck, 'A1VC38T7YXB528', userId)
    ]);

    for (const listing of usListings) {
      const jpPriceInfo = jpPricing[listing.asin];
      const sellerCount = jpPriceInfo ? jpPriceInfo.sellerCount : 0;

      console.log(`[ユーザーID: ${userId}][在庫チェック] SKU: ${listing.sku}, 日本での出品者数: ${sellerCount}`);

      if (sellerCount <= inventoryThreshold) {
        console.log(`[ユーザーID: ${userId}][出品取下] SKU: ${listing.sku} の日本での出品者数(${sellerCount})が閾値(${inventoryThreshold})以下です。出品を削除します。`);
        try {
          await deleteListingsItem(listing.sku, listing.marketplaceId, userId);
          await removeTrackedListing(userId, listing.sku, listing.marketplaceId);
          console.log(`[ユーザーID: ${userId}][出品取下成功] SKU: ${listing.sku} を削除しました。`);
        } catch (error) {
          console.error(`[ユーザーID: ${userId}][出品取下失敗] SKU: ${listing.sku} の削除に失敗しました:`, error);
        }
        continue; 
      }

      const usPriceInfo = usPricing[listing.asin];
      if (!usPriceInfo || !usPriceInfo.price || !jpPriceInfo || !jpPriceInfo.price) {
          console.log(`[ユーザーID: ${userId}][利益チェック] SKU: ${listing.sku} の価格情報が不足しているためスキップします。`);
          continue;
      }
      
      const tempProduct = { asin: listing.asin, usPrice: usPriceInfo.price, jpPrice: jpPriceInfo.price };
      const profitResult = calculateProfit(tempProduct, settings);
      const exclusionInfo = isExcluded(tempProduct, settings, profitResult);

      if (exclusionInfo.excluded) {
        console.log(`[ユーザーID: ${userId}][出品取下] SKU: ${listing.sku} が利益基準を満たさなくなりました。理由: ${exclusionInfo.reason}。出品を削除します。`);
        try {
          await deleteListingsItem(listing.sku, listing.marketplaceId, userId);
          await removeTrackedListing(userId, listing.sku, listing.marketplaceId);
          console.log(`[ユーザーID: ${userId}][出品取下成功] SKU: ${listing.sku} を削除しました。`);
        } catch (error) {
          console.error(`[ユーザーID: ${userId}][出品取下失敗] SKU: ${listing.sku} の削除に失敗しました:`, error);
        }
      }
    }
  } catch (error) {
      console.error(`ユーザー(${userId})の在庫チェック中にエラーが発生しました:`, error);
  }
}

function startInventoryWatcher() {
  console.log(`在庫監視タスクをスケジュールしました。実行スケジュール: ${cronSchedule}`);
  cron.schedule(cronSchedule, checkAllUsersInventory);
}

module.exports = {
  startInventoryWatcher,
};
