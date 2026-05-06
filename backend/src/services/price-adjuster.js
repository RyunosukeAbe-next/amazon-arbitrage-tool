const cron = require('node-cron');
const listingManager = require('./listing-manager');
const spApiClient = require('./sp-api-client');
const settingsManager = require('./settings-manager');
const userManager = require('./user-manager');
const { calculateProfit, isExcluded } = require('./profit-calculator');

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const JP_MARKETPLACE_ID = 'A1VC38T7YXB528';

// At every 15th minute.
const CRON_SCHEDULE = '*/15 * * * *';
let isRunning = false;

async function adjustAllUsersPrices() {
  if (isRunning) {
    console.log('[PriceAdjuster] Task is already running. Skipping this cycle.');
    return;
  }

  console.log('[PriceAdjuster] Starting price adjustment task for all users...');
  isRunning = true;

  try {
    const allUsers = await userManager.getAllUsers();
    if (allUsers.length === 0) {
      console.log('[PriceAdjuster] No users found. Task finished.');
      return;
    }

    for (const user of allUsers) {
      console.log(`[PriceAdjuster] Processing user: ${user.username} (ID: ${user.id})`);
      await adjustPricesForUser(user.id);
    }
  } catch (error) {
    console.error('[PriceAdjuster] An unexpected error occurred during the main task:', error);
  } finally {
    isRunning = false;
    console.log('[PriceAdjuster] Price adjustment task finished.');
  }
}

async function adjustPricesForUser(userId) {
  try {
    const settings = await settingsManager.loadSettings(userId);
    // TODO: Add a setting for enabling/disabling this feature. For now, it's always on.
    // if (!settings.autoPricingEnabled) {
    //   console.log(`[PriceAdjuster] Auto-pricing is disabled for user ${userId}.`);
    //   return;
    // }

    const trackedListings = await listingManager.loadTrackedListings(userId);
    const usListings = trackedListings.filter(l => l.marketplaceId === US_MARKETPLACE_ID);

    if (usListings.length === 0) {
      console.log(`[PriceAdjuster] User ${userId} has no tracked US listings.`);
    } else {
      await updateActiveListings(userId, settings, usListings);
    }

    await relistRecoveredSuspendedListings(userId, settings);
  } catch (error) {
    console.error(`[PriceAdjuster] Failed to adjust prices for user ${userId}. Error:`, error);
  }
}

async function updateActiveListings(userId, settings, usListings) {
  const asins = [...new Set(usListings.map(l => l.asin))];
  console.log(`[PriceAdjuster] User ${userId}: Checking prices for ${asins.length} ASINs.`);

  const [usCompetitivePrices, jpCompetitivePrices] = await Promise.all([
    spApiClient.getCompetitivePricingForAsins(asins, US_MARKETPLACE_ID, userId),
    spApiClient.getCompetitivePricingForAsins(asins, JP_MARKETPLACE_ID, userId)
  ]);

  for (const listing of usListings) {
    const usPriceInfo = usCompetitivePrices[listing.asin];
    const jpPriceInfo = jpCompetitivePrices[listing.asin];
    const newPrice = usPriceInfo ? usPriceInfo.price : null;

    if (!newPrice || !jpPriceInfo || !jpPriceInfo.price) {
      console.log(`[PriceAdjuster] User ${userId}: Skipping SKU ${listing.sku} due to missing pricing info.`);
      continue;
    }

    const tempProduct = { asin: listing.asin, usPrice: newPrice, jpPrice: jpPriceInfo.price };
    const profitResult = calculateProfit(tempProduct, settings);
    const exclusionInfo = isExcluded(tempProduct, settings, profitResult);

    if (exclusionInfo.excluded) {
      console.log(`[PriceAdjuster] User ${userId}: SKU ${listing.sku} has become unprofitable. Delisting. Reason: ${exclusionInfo.reason}`);
      try {
        await spApiClient.deleteListingsItem(listing.sku, listing.marketplaceId, userId);
        await listingManager.addSuspendedListing(userId, listing, 'profitability', exclusionInfo.reason);
        await listingManager.removeTrackedListing(userId, listing.sku, listing.marketplaceId);
        console.log(`[PriceAdjuster] User ${userId}: Successfully delisted SKU ${listing.sku}.`);
      } catch (error) {
        console.error(`[PriceAdjuster] User ${userId}: Failed to delist SKU ${listing.sku}. Error:`, error.message);
      }
      continue;
    }

    const updatedQuantity = Math.max(1, (jpPriceInfo && jpPriceInfo.sellerCount) || 1);
    const leadTimeBuffer = settings.leadTimeBuffer || 3;
    const calculatedLeadTime = (jpPriceInfo.leadTime || 2) + leadTimeBuffer;
    const needsOfferUpdate = newPrice > 0 && (newPrice !== listing.price || updatedQuantity !== listing.quantity);

    if (needsOfferUpdate) {
      console.log(`[PriceAdjuster] User ${userId}: Offer for SKU ${listing.sku} needs update. Price ${listing.price} -> ${newPrice}, Qty ${listing.quantity} -> ${updatedQuantity}`);
      try {
        const result = await spApiClient.putListingsItem(
          listing.asin,
          listing.sku,
          newPrice,
          updatedQuantity,
          listing.marketplaceId,
          userId,
          listing.productType || 'GENERIC',
          calculatedLeadTime
        );
        
        if (result.status === 'INCOMPLETE') {
          console.log(`[PriceAdjuster] User ${userId}: SKU ${listing.sku} is incomplete on Amazon. Delisting. Reason: Catalog data missing.`);
          try {
            await spApiClient.deleteListingsItem(listing.sku, listing.marketplaceId, userId);
            await listingManager.removeTrackedListing(userId, listing.sku, listing.marketplaceId);
            console.log(`[PriceAdjuster] User ${userId}: Successfully delisted incomplete SKU ${listing.sku}.`);
          } catch (delError) {
            console.error(`[PriceAdjuster] User ${userId}: Failed to delist incomplete SKU ${listing.sku}. Error:`, delError.message);
          }
          continue;
        }

        await listingManager.addTrackedListing(userId, listing.sku, listing.asin, listing.marketplaceId, updatedQuantity, newPrice, listing.productType || 'GENERIC');
        console.log(`[PriceAdjuster] User ${userId}: Successfully updated SKU ${listing.sku} (Price: ${newPrice}, Qty: ${updatedQuantity}).`);
      } catch (error) {
        console.error(`[PriceAdjuster] User ${userId}: Failed to update SKU ${listing.sku}. Error:`, error.message);
      }
    }
  }
}

async function relistRecoveredSuspendedListings(userId, settings) {
  const suspendedListings = await listingManager.loadSuspendedListings(userId);
  const listingsToCheck = suspendedListings.filter(l => (
    l.marketplaceId === US_MARKETPLACE_ID &&
    l.suspendedReasonType === 'profitability'
  ));

  if (listingsToCheck.length === 0) {
    return;
  }

  const activeListings = await listingManager.loadTrackedListings(userId);
  const activeAsins = new Set(activeListings.map(l => l.asin));
  const asins = [...new Set(listingsToCheck.map(l => l.asin))];

  console.log(`[PriceAdjuster] User ${userId}: Checking ${listingsToCheck.length} suspended listings for relist.`);

  const [usCompetitivePrices, jpCompetitivePrices] = await Promise.all([
    spApiClient.getCompetitivePricingForAsins(asins, US_MARKETPLACE_ID, userId),
    spApiClient.getCompetitivePricingForAsins(asins, JP_MARKETPLACE_ID, userId)
  ]);

  const inventoryThreshold = settings.inventoryThreshold || 1;

  for (const listing of listingsToCheck) {
    if (activeAsins.has(listing.asin)) {
      await listingManager.removeSuspendedListing(userId, listing.sku, listing.marketplaceId);
      continue;
    }

    const usPriceInfo = usCompetitivePrices[listing.asin];
    const jpPriceInfo = jpCompetitivePrices[listing.asin];

    if (!usPriceInfo?.price || !jpPriceInfo?.price) {
      console.log(`[PriceAdjuster] User ${userId}: Suspended SKU ${listing.sku} still lacks pricing info.`);
      continue;
    }

    if ((jpPriceInfo.sellerCount || 0) <= inventoryThreshold) {
      console.log(`[PriceAdjuster] User ${userId}: Suspended SKU ${listing.sku} still has low JP inventory.`);
      continue;
    }

    const tempProduct = { asin: listing.asin, usPrice: usPriceInfo.price, jpPrice: jpPriceInfo.price };
    const profitResult = calculateProfit(tempProduct, settings);
    const exclusionInfo = isExcluded(tempProduct, settings, profitResult);

    if (exclusionInfo.excluded) {
      console.log(`[PriceAdjuster] User ${userId}: Suspended SKU ${listing.sku} is still excluded. Reason: ${exclusionInfo.reason}`);
      continue;
    }

    const quantityToUse = Math.max(1, jpPriceInfo.sellerCount || 1);
    const leadTimeBuffer = settings.leadTimeBuffer || 3;
    const calculatedLeadTime = (jpPriceInfo.leadTime || 2) + leadTimeBuffer;

    try {
      const result = await spApiClient.putListingsItem(
        listing.asin,
        listing.sku,
        usPriceInfo.price,
        quantityToUse,
        listing.marketplaceId,
        userId,
        listing.productType || 'GENERIC',
        calculatedLeadTime
      );

      if (result.status === 'INCOMPLETE') {
        await listingManager.addSuspendedListing(userId, listing, 'incomplete', 'Amazonのカタログ情報が不足しています。');
        console.log(`[PriceAdjuster] User ${userId}: Suspended SKU ${listing.sku} remains incomplete.`);
        continue;
      }

      await listingManager.addTrackedListing(userId, listing.sku, listing.asin, listing.marketplaceId, quantityToUse, usPriceInfo.price, listing.productType || 'GENERIC');
      await listingManager.removeSuspendedListing(userId, listing.sku, listing.marketplaceId);
      console.log(`[PriceAdjuster] User ${userId}: Relisted recovered SKU ${listing.sku} (Price: ${usPriceInfo.price}, Qty: ${quantityToUse}).`);
    } catch (error) {
      console.error(`[PriceAdjuster] User ${userId}: Failed to relist suspended SKU ${listing.sku}. Error:`, error.message);
    }
  }
}

function startPriceAdjuster() {
  console.log(`[PriceAdjuster] Scheduling price adjustment task with schedule: ${CRON_SCHEDULE}`);
  cron.schedule(CRON_SCHEDULE, adjustAllUsersPrices);
}

module.exports = {
  startPriceAdjuster,
};
