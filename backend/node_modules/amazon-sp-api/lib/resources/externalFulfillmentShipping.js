module.exports = {
  externalFulfillmentShipping: {
    __versions: ['2024-09-11'],
    __operations: [
      'getShipments',
      'getShipment',
      'processShipment',
      'createPackages',
      'updatePackage',
      'updatePackageStatus',
      'retrieveShippingOptions',
      'generateInvoice',
      'retrieveInvoice',
      'generateShipLabels'
    ],
    ...require('./versions/external_fulfillment_shipping/externalFulfillmentShipping_2024-09-11')
  }
};
