// 仮定: 商品データは { usPrice, jpPrice, weight (kg) } を含む
// 仮定: 設定データは { internationalShippingRatePerKg, domesticShippingCostPerItem, customsDutyRate, amazonFeeRate, exchangeRateJpyToUsd } を含む

function calculateProfit(product, settings) {
  const { usPrice, jpPrice, weight } = product;

  if (!jpPrice || jpPrice <= 0) {
    return { /* ... (same zero-value return) ... */ };
  }

  const {
    domesticShippingCostPerItem,
    customsDutyRate,
    amazonFeeRate, // Reverted to simple rate
    exchangeRateJpyToUsd,
    shippingCostTiers,
  } = settings;

  // 1. Amazon手数料の計算 (シンプルなレートに戻す)
  const sellingPriceJpy = usPrice * exchangeRateJpyToUsd;
  const amazonFeeJpy = sellingPriceJpy * amazonFeeRate;

  // 2. 国際送料の計算 (Tiered logic is kept)
  const parseWeight = (weightString) => {
    if (!weightString || typeof weightString !== 'string') return 0;
    const parts = weightString.toLowerCase().split(' ');
    const value = parseFloat(parts[0]) || 0;
    const unit = parts[1] || 'g';
    if (unit === 'kg') return value * 1000;
    if (unit === 'ounces' || unit === 'oz') return value * 28.35;
    if (unit === 'pounds' || unit === 'lb') return value * 453.592;
    return value; // Assume grams if no unit or unknown unit
  };
  const itemWeightGrams = parseWeight(weight);
  let internationalShippingCostJpy = 0;
  if (shippingCostTiers && shippingCostTiers.length > 0) {
    const shippingTier = shippingCostTiers.find(t => itemWeightGrams >= t.fromWeight && itemWeightGrams <= t.toWeight);
    if (shippingTier) {
      internationalShippingCostJpy = shippingTier.cost;
    } else if (itemWeightGrams > 0) {
      // If weight is above all tiers, use the highest tier's cost as a fallback
      internationalShippingCostJpy = shippingCostTiers[shippingCostTiers.length - 1].cost;
    }
  }

  // 3. その他のコスト計算
  const procurementCostJpy = jpPrice;
  const dutiableValueJpy = procurementCostJpy + internationalShippingCostJpy;
  const customsDutyJpy = dutiableValueJpy * customsDutyRate;
  const totalCostJpy = procurementCostJpy + internationalShippingCostJpy + customsDutyJpy + amazonFeeJpy + (domesticShippingCostPerItem || 0);

  // 4. 利益計算
  const profitJpy = sellingPriceJpy - totalCostJpy;
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
function isExcluded(product, settings, profitResult) {
  const { asin, brand, productName } = product;
  const { excludedAsins, excludedBrands, excludedKeywords, profitabilityTiers } = settings;

  // 従来の除外判定
  if (excludedAsins.includes(asin)) {
    return { excluded: true, reason: `除外ASIN: ${asin}` };
  }
  const excludedBrand = excludedBrands.find(b => brand && brand.toLowerCase().includes(b.toLowerCase()));
  if (excludedBrand) {
    return { excluded: true, reason: `除外ブランド: ${excludedBrand}` };
  }
  const excludedKeyword = excludedKeywords.find(k => productName && productName.toLowerCase().includes(k.toLowerCase()));
  if (excludedKeyword) {
    return { excluded: true, reason: `除外キーワード: ${excludedKeyword}` };
  }

  // 新しい利益ベースの除外判定
  if (profitResult && profitabilityTiers) {
    const { sellingPriceJpy, profitJpy, profitRate } = profitResult;

    // 該当する価格帯のルールを探す
    const tier = profitabilityTiers.find(t => sellingPriceJpy >= t.fromPrice && sellingPriceJpy <= t.toPrice);

    if (tier) {
      // 利益率チェック
      if (profitRate < tier.minProfitRate) {
        return { excluded: true, reason: `利益率が基準未満 (基準: ${tier.minProfitRate}% / 結果: ${profitRate.toFixed(2)}%)` };
      }
      // 利益額チェック
      if (profitJpy < tier.minProfitAmount) {
        return { excluded: true, reason: `利益額が基準未満 (基準: ${tier.minProfitAmount}円 / 結果: ${Math.floor(profitJpy)}円)` };
      }
    } else {
        // どの価格帯にも当てはまらない場合（設定漏れなど）は、安全のために除外する
        return { excluded: true, reason: '販売価格に対応する利益設定が見つかりません。' };
    }
  }

  // すべてのチェックをパス
  return { excluded: false, reason: null };
}

module.exports = {
  calculateProfit,
  isExcluded,
};
