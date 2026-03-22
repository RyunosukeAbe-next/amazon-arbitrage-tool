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
      return;
    }

    const asins = usListings.map(l => l.asin);
    console.log(`[PriceAdjuster] User ${userId}: Checking prices for ${asins.length} ASINs.`);

    // Get both US and JP prices
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

      // Check for profitability before adjusting price
      const tempProduct = { asin: listing.asin, usPrice: newPrice, jpPrice: jpPriceInfo.price };
      const profitResult = calculateProfit(tempProduct, settings);
      const exclusionInfo = isExcluded(tempProduct, settings, profitResult);

      if (exclusionInfo.excluded) {
        console.log(`[PriceAdjuster] User ${userId}: SKU ${listing.sku} has become unprofitable. Delisting. Reason: ${exclusionInfo.reason}`);
        try {
          await spApiClient.deleteListingsItem(listing.sku, listing.marketplaceId, userId);
          await listingManager.removeTrackedListing(userId, listing.sku, listing.marketplaceId);
          console.log(`[PriceAdjuster] User ${userId}: Successfully delisted SKU ${listing.sku}.`);
        } catch (error) {
          console.error(`[PriceAdjuster] User ${userId}: Failed to delist SKU ${listing.sku}. Error:`, error.message);
        }
        continue; // Move to the next listing
      }

      // If not excluded, proceed with price adjustment logic
      if (newPrice > 0 && newPrice !== listing.price) {
        console.log(`[PriceAdjuster] User ${userId}: Price for SKU ${listing.sku} needs update. Old: ${listing.price}, New: ${newPrice}`);
        try {
          // Update the listing on Amazon
          await spApiClient.putListingsItem(listing.asin, listing.sku, newPrice, listing.quantity, listing.marketplaceId, userId);
          
          // Update the price in our local tracking file
          await listingManager.addTrackedListing(userId, listing.sku, listing.asin, listing.marketplaceId, listing.quantity, newPrice);
          
          console.log(`[PriceAdjuster] User ${userId}: Successfully updated price for SKU ${listing.sku} to ${newPrice}.`);
        } catch (error) {
          console.error(`[PriceAdjuster] User ${userId}: Failed to update price for SKU ${listing.sku}. Error:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error(`[PriceAdjuster] Failed to adjust prices for user ${userId}. Error:`, error);
  }
}

function startPriceAdjuster() {
  console.log(`[PriceAdjuster] Scheduling price adjustment task with schedule: ${CRON_SCHEDULE}`);
  cron.schedule(CRON_SCHEDULE, adjustAllUsersPrices);
}

module.exports = {
  startPriceAdjuster,
};
