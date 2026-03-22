const fs = require('fs/promises');
const path = require('path');

// Renderの永続ディスクに対応するため、DATA_DIR環境変数を参照
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const LOGS_DIR_NAME = 'listing_logs';

/**
 * ユーザーごとの出品ログディレクトリのパスを取得
 */
function getLogsDir(userId) {
    if (!userId) throw new Error('ユーザーIDが必要です。');
    return path.join(CONFIG_DIR, userId, LOGS_DIR_NAME);
}

/**
 * ユーザーごとのメタデータファイル(listing_logs.json)のパスを取得
 */
function getMetaFilePath(userId) {
    return path.join(getLogsDir(userId), 'listing_logs.json');
}

/**
 * メタデータファイルから全ログを読み込む
 */
async function readAllLogs(userId) {
    const metaFile = getMetaFilePath(userId);
    try {
        const data = await fs.readFile(metaFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // ファイルがなければ空
        }
        throw error;
    }
}

/**
 * 全ログをメタデータファイルに書き込む
 */
async function writeAllLogs(userId, logs) {
    const metaFile = getMetaFilePath(userId);
    await fs.mkdir(path.dirname(metaFile), { recursive: true });
    await fs.writeFile(metaFile, JSON.stringify(logs, null, 2), 'utf8');
}


/**
 * 出品ログのメタデータを取得
 */
async function getListingLogs(userId) {
    const logs = await readAllLogs(userId);
    // 新しい順にソートして返す
    return logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * 特定の出品ログの詳細（処理結果リスト）を取得
 */
async function getListingLogDetails(userId, logId) {
    if (!logId) throw new Error('ログIDが必要です。');
    const logFile = path.join(getLogsDir(userId), `${logId}.json`);
    try {
        const data = await fs.readFile(logFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // ログが見つからない
        }
        throw error;
    }
}

/**
 * 新しい出品ログを作成（処理開始時に呼び出す）
 * @returns {Promise<object>} 作成されたログのメタデータ
 */
async function createListingLog(userId, title, totalAsinCount) {
    const logId = `listing_${Date.now()}`;
    const newLogMeta = {
        id: logId,
        title: title,
        status: 'processing', // processing, completed, error
        totalAsinCount: totalAsinCount,
        listedProductCount: 0,
        createdAt: new Date().toISOString(),
        summary: '出品処理を開始しました...',
    };

    const logs = await readAllLogs(userId);
    logs.unshift(newLogMeta);
    await writeAllLogs(userId, logs);

    return newLogMeta;
}

/**
 * 既存の出品ログを更新（処理完了時に呼び出す）
 * @param {string} logId 更新対象のログID
 * @param {object} updates 更新する情報 { status, listedProductCount, summary, details }
 * @returns {Promise<object>} 更新されたログのメタデータ
 */
async function updateListingLog(userId, logId, updates) {
    const logs = await readAllLogs(userId);
    const logIndex = logs.findIndex(log => log.id === logId);

    if (logIndex === -1) {
        throw new Error(`ログIDが見つかりません: ${logId}`);
    }

    // メタデータを更新
    logs[logIndex] = { ...logs[logIndex], ...updates, updatedAt: new Date().toISOString() };

    // 'details' は大きなデータになる可能性があるため、別ファイルに保存
    if (updates.details) {
        const logsDir = getLogsDir(userId);
        const logDetailFile = path.join(logsDir, `${logId}.json`);
        await fs.writeFile(logDetailFile, JSON.stringify(updates.details, null, 2), 'utf8');
        // メタデータからは削除
        delete logs[logIndex].details;
    }

    await writeAllLogs(userId, logs);
    return logs[logIndex];
}

/**
 * 出品ログを削除する
 * @param {string} userId 
 * @param {string} logId 
 * @returns {Promise<boolean>}
 */
async function deleteListingLog(userId, logId) {
    const logs = await readAllLogs(userId);
    const logToDelete = logs.find(log => log.id === logId);

    if (!logToDelete) {
        throw new Error(`削除対象のログIDが見つかりません: ${logId}`);
    }

    // ステータスが 'completed' のログは削除させない
    if (logToDelete.status === 'completed') {
        throw new Error('完了したログは削除できません。');
    }

    // メタデータから削除
    const updatedLogs = logs.filter(log => log.id !== logId);
    await writeAllLogs(userId, updatedLogs);

    // 詳細ログファイルも削除
    const logDetailFile = path.join(getLogsDir(userId), `${logId}.json`);
    try {
        await fs.unlink(logDetailFile);
    } catch (error) {
        // ファイルが存在しない場合は無視
        if (error.code !== 'ENOENT') {
            console.error(`詳細ログファイル ${logDetailFile} の削除に失敗しました:`, error);
        }
    }

    return true;
}


module.exports = {
    getListingLogs,
    getListingLogDetails,
    createListingLog,
    updateListingLog,
    deleteListingLog,
};
