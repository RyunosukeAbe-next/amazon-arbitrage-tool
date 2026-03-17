module.exports = {
  fbaInventory: {
    __versions: ['v1'],
    __operations: ['getInventorySummaries', 'createInventoryItem', 'deleteInventoryItem', 'addInventory'],
    ...require('./versions/fba_inventory/fbaInventory_v1')
  }
};
