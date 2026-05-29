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
      shippingWeightGrams: null,
      isShippingWeightEstimated: false,
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

  // 2. 国際送料の計算
  const parseWeight = (weightInput, weightKg) => {
    if (typeof weightKg === 'number' && weightKg > 0) {
      return weightKg * 1000; // kg -> g
    }
    if (!weightInput) return null;

    let value = 0;
    let unit = 'g';

    if (typeof weightInput === 'number') {
      // 数値のみの場合、100未満ならkg、それ以上ならgと推測する（暫定ロジック）
      if (weightInput < 100) {
          return weightInput * 1000;
      }
      return weightInput;
    } else if (typeof weightInput === 'object') {
      value = Number(weightInput.value);
      unit = (weightInput.unit || 'g').toLowerCase();
    } else if (typeof weightInput === 'string') {
      const match = weightInput.trim().toLowerCase().match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-z]*)/);
      if (!match) return null;
      value = Number(match[1]);
      unit = match[2] || 'g';
    } else {
      return null;
    }

    if (!Number.isFinite(value) || value <= 0) return null;

    // 単位変換ロジック
    switch (unit) {
      case 'kg':
      case 'kilogram':
      case 'kilograms':
        return value * 1000;
      case 'g':
      case 'gram':
      case 'grams':
        return value;
      case 'ounce':
      case 'ounces':
      case 'oz':
        return value * 28.35;
      case 'pound':
      case 'pounds':
      case 'lb':
      case 'lbs':
        return value * 453.592;
      default:
        return value;
    }
  };
  const parsedWeightGrams = parseWeight(weight, product.weightKg);
  let shippingWeightGrams = parsedWeightGrams;
  let isShippingWeightEstimated = false;
  let internationalShippingBaseCostJpy = 0;
  let internationalShippingFscJpy = 0;
  let appliedInternationalShippingFixedFeeJpy = 0;
  let internationalShippingCostJpy = 0;
  if (shippingCostTiers && shippingCostTiers.length > 0) {
    const highestTier = shippingCostTiers.reduce((highest, tier) => (
      Number(tier.toWeight) > Number(highest.toWeight) ? tier : highest
    ), shippingCostTiers[0]);

    if (shippingWeightGrams === null) {
      shippingWeightGrams = Number(highestTier.toWeight) || null;
      isShippingWeightEstimated = true;
    }

    const shippingTier = shippingCostTiers.find(t => shippingWeightGrams >= t.fromWeight && shippingWeightGrams <= t.toWeight);
    if (shippingTier) {
      internationalShippingBaseCostJpy = shippingTier.cost;
    } else if (shippingWeightGrams > 0) {
      if (shippingWeightGrams > highestTier.toWeight) {
        internationalShippingBaseCostJpy = highestTier.cost;
        isShippingWeightEstimated = parsedWeightGrams === null;
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
    shippingWeightGrams,
    isShippingWeightEstimated,
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
