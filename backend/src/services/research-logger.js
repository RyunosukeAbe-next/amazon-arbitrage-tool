const fs = require('fs/promises');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const LOGS_DIR_NAME = 'research_logs';

/**
 * ユーザーごとのリサーチログディレクトリのパスを取得
 */
function getLogsDir(userId) {
    if (!userId) throw new Error('ユーザーIDが必要です。');
    return path.join(CONFIG_DIR, userId, LOGS_DIR_NAME);
}

/**
 * ユーザーごとのメタデータファイル(logs.json)のパスを取得
 */
function getMetaFilePath(userId) {
    return path.join(getLogsDir(userId), 'logs.json');
}

/**
 * リサーチログのメタデータを取得
 */
async function getResearchLogs(userId) {
    const metaFile = getMetaFilePath(userId);
    try {
        const data = await fs.readFile(metaFile, 'utf8');
        const logs = JSON.parse(data);
        // 新しい順にソートして返す
        return logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []; // ファイルがなければ空
        }
        throw error;
    }
}

/**
 * 特定のリサーチログの詳細（商品リスト）を取得
 */
async function getResearchLogDetails(userId, logId) {
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
 * 新しいリサーチログを保存
 */
async function saveResearchLog(userId, searchInfo, results) {
    const logsDir = getLogsDir(userId);
    await fs.mkdir(logsDir, { recursive: true });

    const logId = `log_${Date.now()}`;
    const newLogMeta = {
        id: logId,
        createdAt: new Date().toISOString(),
        searchType: searchInfo.searchType,
        query: searchInfo.query,
        resultCount: results.length,
    };

    // 1. 詳細な結果を保存
    const logDetailFile = path.join(logsDir, `${logId}.json`);
    await fs.writeFile(logDetailFile, JSON.stringify(results, null, 2), 'utf8');

    // 2. メタデータを更新
    const metaFile = getMetaFilePath(userId);
    let logs = [];
    try {
        const data = await fs.readFile(metaFile, 'utf8');
        logs = JSON.parse(data);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    logs.unshift(newLogMeta); // 配列の先頭に追加
    await fs.writeFile(metaFile, JSON.stringify(logs, null, 2), 'utf8');

    return newLogMeta;
}

/**
 * リサーチログを削除
 */
async function deleteResearchLog(userId, logId) {
    if (!logId) throw new Error('ログIDが必要です。');
    
    const metaFile = getMetaFilePath(userId);
    let logs = [];
    try {
        const data = await fs.readFile(metaFile, 'utf8');
        logs = JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') return false; // そもそもメタファイルがない
        throw error;
    }

    const initialLength = logs.length;
    logs = logs.filter(log => log.id !== logId);
    
    if (logs.length < initialLength) {
        await fs.writeFile(metaFile, JSON.stringify(logs, null, 2), 'utf8');

        // 詳細ファイルを削除
        const logDetailFile = path.join(getLogsDir(userId), `${logId}.json`);
        try {
            await fs.unlink(logDetailFile);
        } catch (error) {
            // ファイルがなくてもエラーにしない
            if (error.code !== 'ENOENT') {
                console.error(`ログファイル (${logDetailFile}) の削除に失敗しました:`, error);
            }
        }
        return true; // 削除成功
    }
    return false; // 該当ログなし
}

module.exports = {
    saveResearchLog,
    getResearchLogs,
    getResearchLogDetails,
    deleteResearchLog,
};
