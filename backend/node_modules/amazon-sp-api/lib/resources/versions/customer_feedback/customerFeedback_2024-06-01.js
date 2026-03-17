const utils = require('../../../utils');

module.exports = {
  '2024-06-01': {
    getItemReviewTopics: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          asin: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/customerFeedback/2024-06-01/items/' + req_params.path.asin + '/reviews/topics',
        restore_rate: 1
      });
    },

    getItemBrowseNode: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          asin: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/customerFeedback/2024-06-01/items/' + req_params.path.asin + '/browseNode',
        restore_rate: 1
      });
    },

    getBrowseNodeReviewTopics: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          browseNodeId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/customerFeedback/2024-06-01/browseNodes/' + req_params.path.browseNodeId + '/reviews/topics',
        restore_rate: 0.5
      });
    },

    getItemReviewTrends: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          asin: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/customerFeedback/2024-06-01/items/' + req_params.path.asin + '/reviews/trends',
        restore_rate: 1
      });
    },

    getBrowseNodeReviewTrends: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          browseNodeId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/customerFeedback/2024-06-01/browseNodes/' + req_params.path.browseNodeId + '/reviews/trends',
        restore_rate: 1
      });
    },

    getBrowseNodeReturnTopics: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          browseNodeId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/customerFeedback/2024-06-01/browseNodes/' + req_params.path.browseNodeId + '/returns/topics',
        restore_rate: 1
      });
    },

    getBrowseNodeReturnTrends: (req_params) => {
      req_params = utils.checkAndEncodeParams(req_params, {
        path: {
          browseNodeId: {
            type: 'string'
          }
        }
      });
      return Object.assign(req_params, {
        method: 'GET',
        api_path: '/customerFeedback/2024-06-01/browseNodes/' + req_params.path.browseNodeId + '/returns/trends',
        restore_rate: 1
      });
    }
  }
};
