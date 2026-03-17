module.exports = {
  sellerWallet: {
    __versions: ['2024-03-01'],
    __operations: [
      'listAccounts',
      'getAccount',
      'listAccountBalances',
      'getTransferPreview',
      'listAccountTransactions',
      'createTransaction',
      'getTransaction',
      'listTransferSchedules',
      'createTransferSchedule',
      'updateTransferSchedule',
      'getTransferSchedule',
      'deleteScheduleTransaction'
    ],
    ...require('./versions/seller_wallet/sellerWallet_2024-03-01.js')
  }
};
