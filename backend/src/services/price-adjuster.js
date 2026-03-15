const cron = require('node-cron');
const { loadTrackedListings } = require('./listing-manager');
const { getCompetitivePricingForAsins, putListingsItem, getCatalogItemAttributes } = require('./sp-api-client');
const { calculateProfit } = require('./profit-calculator');
const { loadSettings } = require('./settings-manager');
const { getAllUsers } = require('./user-manager'); // ユーザーマネージャーをインポート

// 実行スケジュール（例: 毎時15分に実行）
const cronSchedule = '15 * * * *'; 

let isRunning = false;

async function adjustAllUsersPrices() {
  if (isRunning) {
    console.log('全ユーザーの価格調整は既に実行中です。');
    return;
  }
  
  console.log('全ユーザーの価格調整を開始します...');
  isRunning = true;

  try {
    const allUsers = await getAllUsers();
    if (allUsers.length === 0) {
        console.log('処理対象のユーザーがいません。');
        return;
    }

    // 全ユーザーをループして処理
    for (const user of allUsers) {
        console.log(`--- ユーザー[${user.username} (${user.id})] の価格調整を開始 ---`);
        await adjustPricesForUser(user.id);
        console.log(`--- ユーザー[${user.username} (${user.id})] の価格調整を終了 ---`);
    }

  } catch (error) {
    console.error('全ユーザーの価格調整中にエラーが発生しました:', error);
  } finally {
    isRunning = false;
    console.log('全ユーザーの価格調整を終了します。');
  }
}

async function adjustPricesForUser(userId) {
  try {
    const trackedListings = await loadTrackedListings(userId);
    if (trackedListings.length === 0) {
      console.log(`[ユーザーID: ${userId}] 価格調整対象の商品はありません。`);
      return;
    }
    
    const settings = await loadSettings(userId);
    const usListings = trackedListings.filter(l => l.marketplaceId === 'ATVPDKIKX0DER');
    const asinsToAdjust = usListings.map(l => l.asin);

    if (asinsToAdjust.length === 0) {
        return;
    }

    console.log(`[ユーザーID: ${userId}][価格調整] ${asinsToAdjust.length}件の商品の価格情報を取得します...`);
    // TODO: このAPI呼び出しはユーザーごとの認証情報(SP-APIトークン)を使うように将来的に改修が必要
    const [usPricing, jpPricing] = await Promise.all([
        getCompetitivePricingForAsins(asinsToAdjust, 'ATVPDKIKX0DER'),
        getCompetitivePricingForAsins(asinsToAdjust, 'A1VC38T7YXB528')
    ]);

    for (const listing of usListings) {
      const jpPriceInfo = jpPricing[listing.asin];
      const usPriceInfo = usPricing[listing.asin];

      if (!jpPriceInfo || !jpPriceInfo.price || !usPriceInfo || !usPriceInfo.price) {
        console.log(`[ユーザーID: ${userId}][価格調整スキップ] SKU: ${listing.sku} の価格情報が不足しています。`);
        continue;
      }
      
      const {
        internationalShippingRatePerKg, customsDutyRate, amazonFeeRate,
        targetProfitRate, exchangeRateJpyToUsd,
      } = settings;
      
      // TODO: このAPI呼び出しもユーザーごとの認証情報を使うように将来的に改修が必要
      const attributes = await getCatalogItemAttributes(listing.asin, 'ATVPDKIKX0DER');
      let itemWeightKg = 0.5;
      if (attributes && attributes.weight) {
          const { value, unit } = attributes.weight;
          if (unit.toLowerCase() === 'pounds') itemWeightKg = value * 0.453592;
          else if (unit.toLowerCase() === 'kilograms') itemWeightKg = value;
      }

      const procurementCostJpy = jpPriceInfo.price;
      const internationalShippingCostJpy = internationalShippingRatePerKg * itemWeightKg;
      const dutiableValueJpy = procurementCostJpy + internationalShippingCostJpy;
      const customsDutyJpy = dutiableValueJpy * customsDutyRate;
      
      const totalFixedCostJpy = procurementCostJpy + internationalShippingCostJpy + customsDutyJpy;
      const targetSellingPriceJpy = totalFixedCostJpy / (1 - amazonFeeRate - (targetProfitRate / 100));
      const newSellingPriceUsd = parseFloat((targetSellingPriceJpy / exchangeRateJpyToUsd).toFixed(2));

      const currentSellingPriceUsd = usPriceInfo.price;
      const priceDifference = Math.abs(newSellingPriceUsd - currentSellingPriceUsd);
      const priceDifferencePercentage = (currentSellingPriceUsd > 0) ? (priceDifference / currentSellingPriceUsd) * 100 : 100;

      console.log(`[ユーザーID: ${userId}][価格評価] SKU: ${listing.sku} | 現在: $${currentSellingPriceUsd} | 新: $${newSellingPriceUsd}`);

      if (newSellingPriceUsd > 0 && isFinite(newSellingPriceUsd) && priceDifferencePercentage > 1) {
        console.log(`[ユーザーID: ${userId}][価格更新実行] SKU: ${listing.sku} を $${newSellingPriceUsd} に更新します。`);
        try {
          // TODO: このAPI呼び出しもユーザーごとの認証情報を使うように将来的に改修が必要
          await putListingsItem(listing.sku, listing.asin, newSellingPriceUsd, listing.quantity, listing.marketplaceId);
          console.log(`[ユーザーID: ${userId}][価格更新成功] SKU: ${listing.sku}`);
        } catch (error) {
          console.error(`[ユーザーID: ${userId}][価格更新失敗] SKU: ${listing.sku}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`ユーザー(${userId})の価格調整中にエラーが発生しました:`, error);
  }
}

function startPriceAdjuster() {
  console.log(`価格調整タスクをスケジュールしました。実行スケジュール: ${cronSchedule}`);
  cron.schedule(cronSchedule, adjustAllUsersPrices); // 呼び出す関数を変更
}

module.exports = {
  startPriceAdjuster,
};
