module.exports = {
  '2024-03-01': {
    listAccounts: (req_params) => {
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/wallet/2024-03-01/accounts',
        restore_rate: 2
      });
    },
    getAccount: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          accountId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/wallet/2024-03-01/accounts/' + req_params.path.accountId,
        restore_rate: 2
      });
    },
    listAccountBalances: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          accountId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/wallet/2024-03-01/accounts/' + req_params.path.accountId + '/balance',
        restore_rate: 2
      });
    },
    getTransferPreview: (req_params) => {
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/wallet/2024-03-01/transferPreview',
        restore_rate: 2
      });
    },
    listAccountTransactions: (req_params) => {
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/wallet/2024-03-01/transactions',
        restore_rate: 2
      });
    },
    createTransaction: (req_params) => {
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/finances/transfers/wallet/2024-03-01/transactions',
        restore_rate: 1
      });
    },
    getTransaction: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          transactionId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/wallet/2024-03-01/transactions/' + req_params.path.transactionId,
        restore_rate: 2
      });
    },
    listTransferSchedules: (req_params) => {
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/finances/transfers/wallet/2024-03-01/transferSchedules',
        restore_rate: 2
      });
    },
    createTransferSchedule: (req_params) => {
      return Object.assign(req_params, {
        method: 'POST',
        api_path: '/finances/transfers/wallet/2024-03-01/transferSchedules',
        restore_rate: 2
      });
    },
    updateTransferSchedule: (req_params) => {
      return Object.assign(req_params, {
        method: 'PUT',
        api_path: '/finances/transfers/wallet/2024-03-01/transferSchedules',
        restore_rate: 2
      });
    },
    getTransferSchedule: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          transferScheduleId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: 'finances/transfers/wallet/2024-03-01/transferSchedules/' + req_params.path.transferScheduleId,
        restore_rate: 2
      });
    },
    deleteScheduleTransaction: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          transferScheduleId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'DELETE',
        api_path: 'finances/transfers/wallet/2024-03-01/transferSchedules/' + req_params.path.transferScheduleId,
        restore_rate: 2
      });
    }
  }
};
