const axios = require('axios');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { readJsonFile, updateJsonFile, writeJsonFileAtomic } = require('./json-file-store');
const { isDatabaseEnabled, query } = require('./database');

// Renderの永続ディスクに対応するため、DATA_DIR環境変数を参照
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const AUTH_FILE_NAME = 'amazon_auth.json';
const OAUTH_STATE_FILE_NAME = 'amazon_oauth_state.json';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * ユーザーごとの認証情報ディレクトリのパスを取得
 */
function getUserAuthConfigDir(userId) {
    if (!userId) {
        throw new Error('ユーザーIDが必要です。');
    }
    return path.join(CONFIG_DIR, userId);
}

/**
 * ユーザーごとの認証情報ファイルのパスを取得
 */
function getUserAuthFilePath(userId, marketplaceId = 'ATVPDKIKX0DER') {
    return path.join(getUserAuthConfigDir(userId), `${marketplaceId}_${AUTH_FILE_NAME}`);
}

function getUserOAuthStateFilePath(userId) {
    return path.join(getUserAuthConfigDir(userId), OAUTH_STATE_FILE_NAME);
}

/**
 * ユーザーのAmazon認証情報を読み込む
 * @param {string} userId
 * @param {string} marketplaceId
 * @returns {Promise<object|null>}
 */
async function loadUserAmazonAuth(userId, marketplaceId = 'ATVPDKIKX0DER') {
    if (isDatabaseEnabled()) {
        const result = await query('SELECT data FROM amazon_auth WHERE user_id = $1 AND marketplace_id = $2', [userId, marketplaceId]);
        return result.rows[0]?.data || null;
    }

    const authFilePath = getUserAuthFilePath(userId, marketplaceId);
    return readJsonFile(authFilePath, null);
}

/**
 * ユーザーのAmazon認証情報を保存する
 * @param {string} userId
 * @param {object} authData
 */
async function saveUserAmazonAuth(userId, authData) {
    const marketplaceId = authData.marketplaceId || 'ATVPDKIKX0DER';
    if (isDatabaseEnabled()) {
        await query(
            `INSERT INTO amazon_auth (user_id, marketplace_id, data, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, marketplace_id) DO UPDATE SET
               data = EXCLUDED.data,
               updated_at = NOW()`,
            [userId, marketplaceId, JSON.stringify(authData)]
        );
        return;
    }

    const authFilePath = getUserAuthFilePath(userId, marketplaceId);
    await writeJsonFileAtomic(authFilePath, authData);
}

async function deleteUserAmazonAuth(userId, marketplaceId = 'ATVPDKIKX0DER') {
    if (isDatabaseEnabled()) {
        const result = await query('DELETE FROM amazon_auth WHERE user_id = $1 AND marketplace_id = $2', [userId, marketplaceId]);
        return result.rowCount > 0;
    }

    try {
        await fs.unlink(getUserAuthFilePath(userId, marketplaceId));
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

async function createUserOAuthState(userId, marketplaceId = 'ATVPDKIKX0DER') {
    const state = crypto.randomBytes(32).toString('hex');
    const issuedAt = new Date();
    const stateData = {
        state,
        marketplaceId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + OAUTH_STATE_TTL_MS).toISOString(),
    };

    if (isDatabaseEnabled()) {
        await query(
            `INSERT INTO amazon_oauth_states (user_id, state, issued_at, expires_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
               state = EXCLUDED.state,
               issued_at = EXCLUDED.issued_at,
               expires_at = EXCLUDED.expires_at`,
            [userId, JSON.stringify(stateData), stateData.issuedAt, stateData.expiresAt]
        );
        return state;
    }

    await writeJsonFileAtomic(getUserOAuthStateFilePath(userId), stateData);
    return state;
}

async function deleteUserOAuthState(userId) {
    if (isDatabaseEnabled()) {
        await query('DELETE FROM amazon_oauth_states WHERE user_id = $1', [userId]);
        return;
    }

    try {
        await fs.unlink(getUserOAuthStateFilePath(userId));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
}

async function verifyAndConsumeUserOAuthState(userId, receivedState) {
    if (!receivedState) {
        throw new Error('Amazon認証stateがありません。再度連携を開始してください。');
    }

    let stateData;
    try {
        if (isDatabaseEnabled()) {
            const result = await query(
                'SELECT state, issued_at AS "issuedAt", expires_at AS "expiresAt" FROM amazon_oauth_states WHERE user_id = $1',
                [userId]
            );
            if (!result.rows[0]) {
                const error = new Error('state not found');
                error.code = 'ENOENT';
                throw error;
            }
            try {
                stateData = JSON.parse(result.rows[0].state);
            } catch (e) {
                stateData = { state: result.rows[0].state, expiresAt: result.rows[0].expiresAt };
            }
        } else {
            stateData = await readJsonFile(getUserOAuthStateFilePath(userId));
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error('Amazon認証stateが見つかりません。再度連携を開始してください。');
        }
        throw error;
    }

    const expiresAt = new Date(stateData.expiresAt);
    if (!stateData.state || Number.isNaN(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
        await deleteUserOAuthState(userId);
        throw new Error('Amazon認証stateの有効期限が切れています。再度連携を開始してください。');
    }

    if (stateData.state !== receivedState) {
        throw new Error('Amazon認証stateが一致しません。再度連携を開始してください。');
    }

    await deleteUserOAuthState(userId);
    return stateData;
}

/**
 * Amazon MWS/SP-APIの認証URLを生成
 * @param {string} state - CSRF保護のためのランダムな文字列
 * @param {string} marketplaceId - 対象のマーケットプレイスID
 * @returns {string} 認証URL
 */
function getAuthorizationUrl(state, marketplaceId = 'ATVPDKIKX0DER') {
    const appId = process.env.AMAZON_APP_ID || process.env.SELLING_PARTNER_APP_ID;
    
    if (!appId) {
        console.error('[Amazon Auth] SELLING_PARTNER_APP_ID is missing.');
        throw new Error('システム設定エラー: SELLING_PARTNER_APP_ID が設定されていません。管理者に連絡してください。');
    }

    const isJP = marketplaceId === 'A1VC38T7YXB528';
    const domain = isJP ? 'sellercentral.amazon.co.jp' : 'sellercentral.amazon.com';

    console.log(`[Amazon Auth] Using Franchise-ready authorization flow for ${marketplaceId} on domain: ${domain}`);
    
    return `https://${domain}/apps/authorize/consent?application_id=${appId}&state=${state}&version=beta`;
}

async function exchangeCodeForTokens(code) {
    const clientId = process.env.AMAZON_CLIENT_ID || process.env.SELLING_PARTNER_APP_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET || process.env.SELLING_PARTNER_APP_CLIENT_SECRET;
    
    const redirectUri = process.env.AMAZON_REDIRECT_URI || 
                        (process.env.NODE_ENV === 'production' 
                            ? 'https://amazon-arbitrage-tool-1.onrender.com/api/amazon/callback' 
                            : 'http://localhost:3001/api/amazon/callback');

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Amazon API認証情報が完全に設定されていません。環境変数を確認してください。');
    }

    const tokenUrl = 'https://api.amazon.com/auth/o2/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('redirect_uri', redirectUri);

    try {
        const response = await axios.post(tokenUrl, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        });

        return {
            refreshToken: response.data.refresh_token,
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in,
            issuedAt: Date.now()
        };
    } catch (error) {
        console.error('Failed to exchange code for tokens:', error.response ? error.response.data : error.message);
        throw new Error('Amazonトークンの取得に失敗しました。');
    }
}

async function refreshAccessToken(refreshToken) {
    const clientId = process.env.AMAZON_CLIENT_ID || process.env.SELLING_PARTNER_APP_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET || process.env.SELLING_PARTNER_APP_CLIENT_SECRET;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Amazon API認証情報またはリフレッシュトークンが不足しています。');
    }

    const tokenUrl = 'https://api.amazon.com/auth/o2/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    try {
        const response = await axios.post(tokenUrl, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        });

        return {
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in,
            issuedAt: Date.now()
        };
    } catch (error) {
        console.error('Failed to refresh access token:', error.response ? error.response.data : error.message);
        throw new Error('アクセストークンの更新に失敗しました。');
    }
}


module.exports = {
    getUserAuthFilePath,
    getAuthorizationUrl,
    createUserOAuthState,
    verifyAndConsumeUserOAuthState,
    exchangeCodeForTokens,
    refreshAccessToken,
    loadUserAmazonAuth,
    saveUserAmazonAuth,
    deleteUserAmazonAuth,
};
