module.exports = {
  '2024-06-01': {
    initiatePayout: (req_params) => {
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/finances/transfers/2024-06-01/payouts',
        restore_rate: 60
      });
    },
    getPaymentMethods: (req_params) => {
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/2024-06-01/paymentMethods',
        restore_rate: 2
      });
    }
  }
};
