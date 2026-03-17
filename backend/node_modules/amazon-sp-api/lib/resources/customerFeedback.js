module.exports = {
  customerFeedback: {
    __versions: ['2024-06-01'],
    __operations: [
      'getItemReviewTopics',
      'getItemBrowseNode',
      'getBrowseNodeReviewTopics',
      'getItemReviewTrends',
      'getBrowseNodeReviewTrends',
      'getBrowseNodeReturnTopics',
      'getBrowseNodeReturnTrends'
    ],
    ...require('./versions/customer_feedback/customerFeedback_2024-06-01')
  }
};
