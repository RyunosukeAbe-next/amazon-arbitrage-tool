module.exports = {
  v1: {
    // May return a pagination value that includes a nextToken --> this pagination will be added to the returned payload
    getInventorySummaries: (req_params) => {
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/fba/inventory/v1/summaries',
        restore_rate: 0.5
      });
    },
    createInventoryItem: (req_params) => {
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/fba/inventory/v1/items',
        restore_rate: 0.5,
        sandbox_only: true
      });
    },
    deleteInventoryItem: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          sellerSku: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'DELETE',
        api_path: 'fba/inventory/v1/items/' + req_params.path.sellerSku,
        restore_rate: 0.5,
        sandbox_only: true
      });
    },
    addInventory: (req_params) => {
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/fba/inventory/v1/items/inventory',
        restore_rate: 0.5,
        sandbox_only: true
      });
    }
  }
};
