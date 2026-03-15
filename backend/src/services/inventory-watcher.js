const cron = require('node-cron');
const { loadTrackedListings, removeTrackedListing } = require('./listing-manager');
const { getCompetitivePricingForAsins, deleteListingsItem } = require('./sp-api-client');
const { loadSettings } = require('./settings-manager');
const { getAllUsers } = require('./user-manager'); // ユーザーマネージャーをインポート

// 例: 毎時0分に実行
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

    // 全ユーザーをループして処理
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

    // TODO: このAPI呼び出しはユーザーごとの認証情報(SP-APIトークン)を使うように将来的に改修が必要
    const jpPricing = await getCompetitivePricingForAsins(asinsToCheck, 'A1VC38T7YXB528');

    for (const listing of usListings) {
      const priceInfo = jpPricing[listing.asin];
      const sellerCount = priceInfo ? priceInfo.sellerCount : 0;

      console.log(`[ユーザーID: ${userId}][在庫チェック] SKU: ${listing.sku}, 日本での出品者数: ${sellerCount}`);

      if (sellerCount <= inventoryThreshold) {
        console.log(`[ユーザーID: ${userId}][出品取下] SKU: ${listing.sku} の日本での出品者数(${sellerCount})が閾値(${inventoryThreshold})以下です。出品を削除します。`);
        try {
          // TODO: このAPI呼び出しもユーザーごとの認証情報を使うように将来的に改修が必要
          await deleteListingsItem(listing.sku, listing.marketplaceId);
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
  cron.schedule(cronSchedule, checkAllUsersInventory); // 呼び出す関数を変更
}

module.exports = {
  startInventoryWatcher,
};
