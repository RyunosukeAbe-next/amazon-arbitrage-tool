// 仮定: 商品データは { usPrice, jpPrice, weight (kg) } を含む
// 仮定: 設定データは { internationalShippingRatePerKg, domesticShippingCostPerItem, customsDutyRate, amazonFeeRate, exchangeRateJpyToUsd } を含む

function calculateProfit(product, settings) {
  const { usPrice, jpPrice } = product;
  const {
    internationalShippingRatePerKg,
    domesticShippingCostPerItem,
    customsDutyRate,
    amazonFeeRate,
    exchangeRateJpyToUsd,
  } = settings;

  // 0. 重量計算 (今回は簡単のため固定値またはダミーとする)
  // 実際のツールでは、SP-APIから取得した商品の重量や体積重量に基づいて計算する
  const itemWeightKg = product.weight || 0.5; // 例: 0.5kgと仮定

  // 1. 仕入れコスト (日本円)
  const procurementCostJpy = jpPrice;

  // 2. 国際送料 (日本円) - 例: 商品重量1kgあたり国際送料
  const internationalShippingCostJpy = internationalShippingRatePerKg * itemWeightKg;

  // 3. 関税 (日本円) - 例: 仕入れ価格 + 国際送料に対して関税率を適用
  const dutiableValueJpy = procurementCostJpy + internationalShippingCostJpy;
  const customsDutyJpy = dutiableValueJpy * customsDutyRate;

  // 4. Amazon USでの販売価格 (日本円換算)
  const sellingPriceUsd = usPrice;
  const sellingPriceJpy = sellingPriceUsd * exchangeRateJpyToUsd;

  // 5. Amazon手数料 (日本円) - 例: 販売価格に対してAmazon手数料率を適用
  const amazonFeeJpy = sellingPriceJpy * amazonFeeRate;

  // 6. 国内送料 (米国アマゾン倉庫への送料など、今回は日本から米国への送料として国際送料に含める)
  // あるいは、出品者から購入者への米国内送料
  // 今回は、簡単のためdomesticShippingCostPerItem を出品者が負担する米国内配送費用として扱う
  const domesticShippingCostUsdToBuyer = 0; // 今回は購入者負担と仮定
  const domesticShippingCostJpy = domesticShippingCostUsdToBuyer * exchangeRateJpyToUsd;

  // 7. 総コスト (日本円)
  const totalCostJpy = procurementCostJpy + internationalShippingCostJpy + customsDutyJpy + amazonFeeJpy + domesticShippingCostJpy;

  // 8. 利益 (日本円)
  const profitJpy = sellingPriceJpy - totalCostJpy;

  // 9. 利益率 (%)
  const profitRate = sellingPriceJpy > 0 ? (profitJpy / sellingPriceJpy) * 100 : 0;

  return {
    profitJpy: profitJpy,
    profitRate: profitRate,
    procurementCostJpy: procurementCostJpy,
    internationalShippingCostJpy: internationalShippingCostJpy,
    customsDutyJpy: customsDutyJpy,
    amazonFeeJpy: amazonFeeJpy,
    sellingPriceJpy: sellingPriceJpy,
    totalCostJpy: totalCostJpy,
  };
}

// 除外判定
function isExcluded(product, settings) {
  const { asin, brand, productName } = product;
  const { excludedAsins, excludedBrands, excludedKeywords } = settings;

  if (excludedAsins.includes(asin)) {
    return true;
  }
  if (excludedBrands.some(b => brand.toLowerCase().includes(b.toLowerCase()))) {
    return true;
  }
  if (excludedKeywords.some(k => productName.toLowerCase().includes(k.toLowerCase()))) {
    return true;
  }
  return false;
}

module.exports = {
  calculateProfit,
  isExcluded,
};
