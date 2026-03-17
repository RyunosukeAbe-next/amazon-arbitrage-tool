module.exports = {
  externalFulfillmentReturns: {
    __versions: ['2024-09-11'],
    __operations: ['listReturns', 'getReturn'],
    ...require('./versions/external_fulfillment_returns/externalFulfillmentReturns_2024-09-11')
  }
};
