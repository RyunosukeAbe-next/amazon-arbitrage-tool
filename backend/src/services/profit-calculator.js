// 仮定: 商品データは { usPrice, jpPrice, weight (kg) } を含む
// 仮定: 設定データは { internationalShippingRatePerKg, domesticShippingCostPerItem, customsDutyRate, amazonFeeRate, exchangeRateJpyToUsd } を含む

function calculateProfit(product, settings) {
  const { usPrice, jpPrice } = product;
  
  // ★ 追加: 日本価格が0以下の場合は、利益0として計算を終了する
  if (!jpPrice || jpPrice <= 0) {
    return {
      profitJpy: 0,
      profitRate: 0,
      procurementCostJpy: 0,
      internationalShippingCostJpy: 0,
      customsDutyJpy: 0,
      amazonFeeJpy: 0,
      sellingPriceJpy: 0,
      totalCostJpy: 0,
    };
  }

  const {
    internationalShippingRatePerKg,
    domesticShippingCostPerItem,
    customsDutyRate,
    amazonFeeRate,
    exchangeRateJpyToUsd,
  } = settings;

  // 0. 重量計算 (今回は簡単のため固定値またはダミーとする)
  const itemWeightKg = product.weight || 0.5; // 例: 0.5kgと仮定

  // 1. 仕入れコスト (日本円)
  const procurementCostJpy = jpPrice;

  // 2. 国際送料 (日本円)
  const internationalShippingCostJpy = internationalShippingRatePerKg * itemWeightKg;

  // 3. 関税 (日本円)
  const dutiableValueJpy = procurementCostJpy + internationalShippingCostJpy;
  const customsDutyJpy = dutiableValueJpy * customsDutyRate;

  // 4. Amazon USでの販売価格 (日本円換算)
  const sellingPriceUsd = usPrice;
  const sellingPriceJpy = sellingPriceUsd * exchangeRateJpyToUsd;

  // 5. Amazon手数料 (日本円)
  const amazonFeeJpy = sellingPriceJpy * amazonFeeRate;

  // 6. 国内送料 (米国) - 今回は0と仮定
  const domesticShippingCostJpy = 0;

  // 7. 総コスト (日本円)
  const totalCostJpy = procurementCostJpy + internationalShippingCostJpy + customsDutyJpy + amazonFeeJpy + domesticShippingCostJpy;

  // 8. 利益 (日本円)
  const profitJpy = sellingPriceJpy - totalCostJpy;

  // 9. 利益率 (%)
  const profitRate = sellingPriceJpy > 0 ? (profitJpy / sellingPriceJpy) * 100 : 0;

  return {
    profitJpy,
    profitRate,
    procurementCostJpy,
    internationalShippingCostJpy,
    customsDutyJpy,
    amazonFeeJpy,
    sellingPriceJpy,
    totalCostJpy,
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
