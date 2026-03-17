module.exports = {
  '2024-09-11': {
    batchInventory: (req_params) => {
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/externalFulfillment/inventory/2024-09-11/inventories',
        restore_rate: 0.02
      });
    }
  }
};
