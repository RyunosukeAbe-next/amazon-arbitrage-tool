const spApiClient = require('./sp-api-client');
const { calculateProfit, isExcluded } = require('./profit-calculator');

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const JP_MARKETPLACE_ID = 'A1VC38T7YXB528';

async function getListingMarketData(userId, asins) {
  const uniqueAsins = [...new Set((asins || []).map(asin => String(asin).trim().toUpperCase()).filter(Boolean))];
  if (uniqueAsins.length === 0) {
    return {
      asins: [],
      usPricing: {},
      jpPricing: {},
      attributes: {},
    };
  }

  const [usPricing, jpPricing, attributes] = await Promise.all([
    spApiClient.getCompetitivePricingForAsins(uniqueAsins, US_MARKETPLACE_ID, userId),
    spApiClient.getCompetitivePricingForAsins(uniqueAsins, JP_MARKETPLACE_ID, userId),
    spApiClient.getProductAttributesForAsins(uniqueAsins, US_MARKETPLACE_ID, userId),
  ]);

  return {
    asins: uniqueAsins,
    usPricing,
    jpPricing,
    attributes,
  };
}

function buildProfitProduct(asin, marketData) {
  const normalizedAsin = String(asin).trim().toUpperCase();
  const usPriceInfo = marketData.usPricing[normalizedAsin];
  const jpPriceInfo = marketData.jpPricing[normalizedAsin];
  const productAttributes = marketData.attributes[normalizedAsin] || {};

  if (!usPriceInfo?.price || !jpPriceInfo?.price) {
    return null;
  }

  return {
    asin: normalizedAsin,
    usPrice: usPriceInfo.price,
    jpPrice: jpPriceInfo.price,
    weight: productAttributes.weight,
  };
}

function evaluateListingProfitability(asin, settings, marketData) {
  const product = buildProfitProduct(asin, marketData);
  if (!product) {
    return {
      product: null,
      profitResult: null,
      exclusionInfo: null,
    };
  }

  const profitResult = calculateProfit(product, settings);
  const exclusionInfo = isExcluded(product, settings, profitResult);

  return {
    product,
    profitResult,
    exclusionInfo,
  };
}

module.exports = {
  US_MARKETPLACE_ID,
  JP_MARKETPLACE_ID,
  getListingMarketData,
  evaluateListingProfitability,
};
