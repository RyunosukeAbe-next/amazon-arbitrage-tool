module.exports = {
  transfers: {
    __versions: ['2024-06-01'],
    __operations: ['initiatePayout', 'getPaymentMethods'],
    ...require('./versions/transfers/transfers_2024-06-01')
  }
};
