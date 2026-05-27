const fs = require('fs/promises');
const path = require('path');
const { readJsonFile, updateJsonFile, writeJsonFileAtomic } = require('./json-file-store');
const { isDatabaseEnabled, query: dbQuery } = require('./database');

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
    if (isDatabaseEnabled()) {
        const result = await dbQuery(
            `SELECT id, created_at AS "createdAt", search_type AS "searchType", query, result_count AS "resultCount", meta
             FROM research_logs
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows.map(({ meta, ...row }) => ({ ...(meta || {}), ...row }));
    }

    const metaFile = getMetaFilePath(userId);
    const logs = await readJsonFile(metaFile, []);
    // 新しい順にソートして返す
    return logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * 特定のリサーチログの詳細（商品リスト）を取得
 */
function paginateDetails(details, options = {}) {
    if (!options || (options.limit === undefined && options.offset === undefined)) {
        return details;
    }

    const items = Array.isArray(details) ? details : [];
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 100, 1), 500);
    const offset = Math.max(parseInt(options.offset, 10) || 0, 0);
    return {
        items: items.slice(offset, offset + limit),
        total: items.length,
        limit,
        offset,
    };
}

async function getResearchLogDetails(userId, logId, options = {}) {
    if (!logId) throw new Error('ログIDが必要です。');

    if (isDatabaseEnabled()) {
        const result = await dbQuery(
            'SELECT details FROM research_logs WHERE user_id = $1 AND id = $2',
            [userId, logId]
        );
        const details = result.rows[0]?.details || null;
        return details ? paginateDetails(details, options) : null;
    }

    const logFile = path.join(getLogsDir(userId), `${logId}.json`);
    try {
        const details = await readJsonFile(logFile);
        return paginateDetails(details, options);
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
    const logId = `log_${Date.now()}`;
    const newLogMeta = {
        id: logId,
        createdAt: new Date().toISOString(),
        searchType: searchInfo.searchType,
        query: searchInfo.query,
        classificationId: searchInfo.classificationId || null,
        resultCount: results.length,
    };

    if (isDatabaseEnabled()) {
        await dbQuery(
            `INSERT INTO research_logs (
                user_id, id, created_at, search_type, query, result_count, meta, details
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId,
                newLogMeta.id,
                newLogMeta.createdAt,
                newLogMeta.searchType,
                newLogMeta.query,
                newLogMeta.resultCount,
                JSON.stringify(newLogMeta),
                JSON.stringify(results)
            ]
        );
        return newLogMeta;
    }

    const logsDir = getLogsDir(userId);

    // 1. 詳細な結果を保存
    const logDetailFile = path.join(logsDir, `${logId}.json`);
    await writeJsonFileAtomic(logDetailFile, results);

    // 2. メタデータを更新
    const metaFile = getMetaFilePath(userId);
    await updateJsonFile(metaFile, [], logs => [newLogMeta, ...logs]);

    return newLogMeta;
}

/**
 * リサーチログを削除
 */
async function deleteResearchLog(userId, logId) {
    if (!logId) throw new Error('ログIDが必要です。');

    if (isDatabaseEnabled()) {
        const result = await dbQuery(
            'DELETE FROM research_logs WHERE user_id = $1 AND id = $2',
            [userId, logId]
        );
        return result.rowCount > 0;
    }
    
    const metaFile = getMetaFilePath(userId);
    let deleted = false;

    await updateJsonFile(metaFile, [], logs => {
        const updatedLogs = logs.filter(log => log.id !== logId);
        deleted = updatedLogs.length < logs.length;
        return updatedLogs;
    });
    
    if (deleted) {
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
