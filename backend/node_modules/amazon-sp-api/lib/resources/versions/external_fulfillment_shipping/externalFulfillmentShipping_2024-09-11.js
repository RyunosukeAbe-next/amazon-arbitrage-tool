const utils = require('../../../utils');

module.exports = {
  '2024-09-11': {
    getShipments: (req_params) => {
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/externalFulfillment/2024-09-11/shipments',
        restore_rate: 0.5
      });
    },
    getShipment: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/externalFulfillment/2024-09-11/shipments/' + req_params.path.shipmentId,
        restore_rate: 0.5
      });
    },
    processShipment: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/externalFulfillment/2024-09-11/shipments/' + req_params.path.shipmentId,
        restore_rate: 1
      });
    },
    createPackages: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/externalFulfillment/2024-09-11/shipments/' + req_params.path.shipmentId + '/packages',
        restore_rate: 1
      });
    },
    updatePackage: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          },
          packageId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'PUT',
        api_path:
          '/externalFulfillment/2024-09-11/shipments/' +
          req_params.path.shipmentId +
          '/packages/' +
          req_params.path.packageId,
        restore_rate: 1
      });
    },
    updatePackageStatus: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          },
          packageId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'PATCH',
        api_path:
          '/externalFulfillment/2024-09-11/shipments/' +
          req_params.path.shipmentId +
          '/packages/' +
          req_params.path.packageId,
        restore_rate: 1
      });
    },
    retrieveShippingOptions: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/externalFulfillment/2024-09-11/shipments/' + req_params.path.shipmentId + '/shippingOptions',
        restore_rate: 1
      });
    },
    generateInvoice: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/externalFulfillment/2024-09-11/shipments/' + req_params.path.shipmentId + '/invoice',
        restore_rate: 1
      });
    },
    retrieveInvoice: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/externalFulfillment/2024-09-11/shipments/' + req_params.path.shipmentId + '/invoice',
        restore_rate: 1
      });
    },
    generateShipLabels: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          shipmentId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'PUT',
        api_path: '/externalFulfillment/2024-09-11/shipments/' + req_params.path.shipmentId + '/shipLabels',
        restore_rate: 1
      });
    }
  }
};
