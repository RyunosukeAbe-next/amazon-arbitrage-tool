const axios = require('axios');
const path = require('path');
const fs = require('fs/promises');

// Renderの永続ディスクに対応するため、DATA_DIR環境変数を参照
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const AUTH_FILE_NAME = 'amazon_auth.json';

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
function getUserAuthFilePath(userId) {
    return path.join(getUserAuthConfigDir(userId), AUTH_FILE_NAME);
}

/**
 * ユーザーのAmazon認証情報を読み込む
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function loadUserAmazonAuth(userId) {
    const authFilePath = getUserAuthFilePath(userId);
    try {
        const data = await fs.readFile(authFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // ファイルがなければ認証情報なし
        }
        throw error;
    }
}

/**
 * ユーザーのAmazon認証情報を保存する
 * @param {string} userId
 * @param {object} authData
 */
async function saveUserAmazonAuth(userId, authData) {
    const authDirPath = getUserAuthConfigDir(userId);
    await fs.mkdir(authDirPath, { recursive: true });
    const authFilePath = getUserAuthFilePath(userId);
    await fs.writeFile(authFilePath, JSON.stringify(authData, null, 2), 'utf8');
}

/**
 * Amazon MWS/SP-APIの認証URLを生成
 * @param {string} state - CSRF保護のためのランダムな文字列
 * @returns {string} 認証URL
 */
function getAuthorizationUrl(state) {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const redirectUri = process.env.AMAZON_REDIRECT_URI;
    if (!clientId || !redirectUri) {
        throw new Error('AMAZON_CLIENT_IDまたはAMAZON_REDIRECT_URIが設定されていません。');
    }
    return `https://sellercentral.amazon.com/apps/authorize/consent?application_id=${clientId}&state=${state}&version=beta&redirect_uri=${redirectUri}`;
}

/**
 * 認証コードをリフレッシュトークンとアクセストークンに交換する
 * @param {string} code - Amazonから返された認証コード
 * @returns {Promise<object>} トークン情報 { refreshToken, accessToken, expiresIn }
 */
async function exchangeCodeForTokens(code) {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;
    const redirectUri = process.env.AMAZON_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Amazon API認証情報が完全に設定されていません。');
    }

    const tokenUrl = 'https://api.amazon.com/auth/o2/token'; // グローバルな認証エンドポイント

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('redirect_uri', redirectUri);

    try {
        const response = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
        });

        return {
            refreshToken: response.data.refresh_token,
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in,
        };
    } catch (error) {
        console.error('Failed to exchange code for tokens:', error.response ? error.response.data : error.message);
        throw new Error('Amazonトークンの取得に失敗しました。');
    }
}

/**
 * リフレッシュトークンを使用してアクセストークンを更新する
 * @param {string} refreshToken
 * @returns {Promise<object>} 新しいアクセストークン情報 { accessToken, expiresIn }
 */
async function refreshAccessToken(refreshToken) {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;

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
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
        });

        return {
            accessToken: response.data.access_token,
            expiresIn: response.data.expires_in,
        };
    } catch (error) {
        console.error('Failed to refresh access token:', error.response ? error.response.data : error.message);
        throw new Error('アクセストークンの更新に失敗しました。');
    }
}


module.exports = {
    getAuthorizationUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    loadUserAmazonAuth,
    saveUserAmazonAuth,
};
