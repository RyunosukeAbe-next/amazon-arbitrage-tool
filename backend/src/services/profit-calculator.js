// 仮定: 商品データは { usPrice, jpPrice, weight (kg) } を含む
// 仮定: 設定データは { internationalShippingRatePerKg, domesticShippingCostPerItem, customsDutyRate, amazonFeeRate, exchangeRateJpyToUsd } を含む

function calculateProfit(product, settings) {
  const { usPrice, jpPrice, weight } = product;

  if (!jpPrice || jpPrice <= 0) {
    return {
      profitJpy: 0,
      profitRate: 0,
      procurementCostJpy: 0,
      internationalShippingCostJpy: 0,
      internationalShippingBaseCostJpy: 0,
      internationalShippingFscJpy: 0,
      internationalShippingFixedFeeJpy: 0,
      customsDutyJpy: 0,
      amazonFeeJpy: 0,
      sellingPriceJpy: 0,
      totalCostJpy: 0,
    };
  }

  const {
    domesticShippingCostPerItem,
    customsDutyRate,
    amazonFeeRate,
    exchangeRateJpyToUsd,
    shippingCostTiers,
    internationalShippingFscRate,
    internationalShippingFixedFeeJpy,
  } = settings;

  // 1. Amazon手数料の計算 (シンプルなレートに戻す)
  const sellingPriceJpy = usPrice * exchangeRateJpyToUsd;
  const amazonFeeJpy = sellingPriceJpy * (amazonFeeRate || 0.15);

  // 2. 国際送料の計算 (Tiered logic is kept)
  const parseWeight = (weightString) => {
    if (!weightString || typeof weightString !== 'string') return 0;
    const parts = weightString.toLowerCase().split(' ');
    const value = parseFloat(parts[0]) || 0;
    const unit = parts[1] || 'g';
    if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') return value * 1000;
    if (unit === 'g' || unit === 'gram' || unit === 'grams') return value;
    if (unit === 'ounce' || unit === 'ounces' || unit === 'oz') return value * 28.35;
    if (unit === 'pound' || unit === 'pounds' || unit === 'lb' || unit === 'lbs') return value * 453.592;
    return value; // Assume grams if no unit or unknown unit
  };
  const itemWeightGrams = parseWeight(weight);
  let internationalShippingBaseCostJpy = 0;
  let internationalShippingFscJpy = 0;
  let appliedInternationalShippingFixedFeeJpy = 0;
  let internationalShippingCostJpy = 0;
  if (shippingCostTiers && shippingCostTiers.length > 0) {
    const shippingTier = shippingCostTiers.find(t => itemWeightGrams >= t.fromWeight && itemWeightGrams <= t.toWeight);
    if (shippingTier) {
      internationalShippingBaseCostJpy = shippingTier.cost;
    } else if (itemWeightGrams > 0) {
      const highestTier = shippingCostTiers[shippingCostTiers.length - 1];
      if (itemWeightGrams > highestTier.toWeight) {
         internationalShippingBaseCostJpy = highestTier.cost; // Use highest cost as fallback
      }
    }
  }
  if (internationalShippingBaseCostJpy > 0) {
    const fscRate = Number(internationalShippingFscRate) || 0;
    internationalShippingFscJpy = internationalShippingBaseCostJpy * fscRate;
    appliedInternationalShippingFixedFeeJpy = Number(internationalShippingFixedFeeJpy) || 0;
    internationalShippingCostJpy = internationalShippingBaseCostJpy + internationalShippingFscJpy + appliedInternationalShippingFixedFeeJpy;
  }

  // 3. その他のコスト計算
  const procurementCostJpy = jpPrice;
  const dutiableValueJpy = procurementCostJpy + internationalShippingCostJpy;
  const baseCustomsDutyJpy = dutiableValueJpy * customsDutyRate;
  // DDP: 関税額に関税立替手数料(2%)を加算
  const customsDutyJpy = baseCustomsDutyJpy * 1.02;
  const totalCostJpy = procurementCostJpy + internationalShippingCostJpy + customsDutyJpy + amazonFeeJpy + (domesticShippingCostPerItem || 0);

  // 4. 利益計算
  const profitJpy = sellingPriceJpy - totalCostJpy;
  const profitRate = sellingPriceJpy > 0 ? (profitJpy / sellingPriceJpy) * 100 : 0;

  return {
    profitJpy,
    profitRate,
    procurementCostJpy,
    internationalShippingCostJpy,
    internationalShippingBaseCostJpy,
    internationalShippingFscJpy,
    internationalShippingFixedFeeJpy: appliedInternationalShippingFixedFeeJpy,
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
