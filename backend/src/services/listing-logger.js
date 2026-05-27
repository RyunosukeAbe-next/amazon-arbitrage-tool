const fs = require('fs/promises');
const path = require('path');
const { readJsonFile, updateJsonFile, writeJsonFileAtomic } = require('./json-file-store');
const { isDatabaseEnabled, query: dbQuery } = require('./database');

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
    return readJsonFile(metaFile, []);
}

/**
 * 全ログをメタデータファイルに書き込む
 */
async function writeAllLogs(userId, logs) {
    const metaFile = getMetaFilePath(userId);
    await writeJsonFileAtomic(metaFile, logs);
}


/**
 * 出品ログのメタデータを取得
 */
async function getListingLogs(userId) {
    if (isDatabaseEnabled()) {
        const result = await dbQuery(
            `SELECT
                id,
                title,
                status,
                total_asin_count AS "totalAsinCount",
                listed_product_count AS "listedProductCount",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                summary,
                meta
             FROM listing_logs
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows.map(({ meta, ...row }) => ({ ...(meta || {}), ...row }));
    }

    const logs = await readAllLogs(userId);
    // 新しい順にソートして返す
    return logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * 特定の出品ログの詳細（処理結果リスト）を取得
 */
async function getListingLogDetails(userId, logId) {
    if (!logId) throw new Error('ログIDが必要です。');

    if (isDatabaseEnabled()) {
        const result = await dbQuery(
            'SELECT details FROM listing_logs WHERE user_id = $1 AND id = $2',
            [userId, logId]
        );
        return result.rows[0]?.details || null;
    }

    const logFile = path.join(getLogsDir(userId), `${logId}.json`);
    try {
        return await readJsonFile(logFile);
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

    if (isDatabaseEnabled()) {
        await dbQuery(
            `INSERT INTO listing_logs (
                user_id, id, title, status, total_asin_count, listed_product_count, created_at, summary, meta
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                userId,
                newLogMeta.id,
                newLogMeta.title,
                newLogMeta.status,
                newLogMeta.totalAsinCount,
                newLogMeta.listedProductCount,
                newLogMeta.createdAt,
                newLogMeta.summary,
                newLogMeta
            ]
        );
        return newLogMeta;
    }

    await updateJsonFile(getMetaFilePath(userId), [], logs => [newLogMeta, ...logs]);

    return newLogMeta;
}

/**
 * 既存の出品ログを更新（処理完了時に呼び出す）
 * @param {string} logId 更新対象のログID
 * @param {object} updates 更新する情報 { status, listedProductCount, summary, details }
 * @returns {Promise<object>} 更新されたログのメタデータ
 */
async function updateListingLog(userId, logId, updates) {
    let updatedLog;

    if (isDatabaseEnabled()) {
        const current = await dbQuery(
            'SELECT * FROM listing_logs WHERE user_id = $1 AND id = $2',
            [userId, logId]
        );
        const currentLog = current.rows[0];
        if (!currentLog) {
            throw new Error(`ログIDが見つかりません: ${logId}`);
        }

        const mergedLog = {
            ...(currentLog.meta || {}),
            id: currentLog.id,
            title: currentLog.title,
            status: currentLog.status,
            totalAsinCount: currentLog.total_asin_count,
            listedProductCount: currentLog.listed_product_count,
            createdAt: currentLog.created_at,
            updatedAt: currentLog.updated_at,
            summary: currentLog.summary,
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        delete mergedLog.details;

        const result = await dbQuery(
            `UPDATE listing_logs
             SET title = $3,
                 status = $4,
                 total_asin_count = $5,
                 listed_product_count = $6,
                 summary = $7,
                 updated_at = $8,
                 meta = $9,
                 details = COALESCE($10::jsonb, details)
             WHERE user_id = $1 AND id = $2
             RETURNING
                id,
                title,
                status,
                total_asin_count AS "totalAsinCount",
                listed_product_count AS "listedProductCount",
                created_at AS "createdAt",
                updated_at AS "updatedAt",
                summary`,
            [
                userId,
                logId,
                mergedLog.title,
                mergedLog.status,
                mergedLog.totalAsinCount,
                mergedLog.listedProductCount,
                mergedLog.summary,
                mergedLog.updatedAt,
                JSON.stringify(mergedLog),
                updates.details ? JSON.stringify(updates.details) : null
            ]
        );
        return result.rows[0];
    }

    await updateJsonFile(getMetaFilePath(userId), [], async logs => {
        const logIndex = logs.findIndex(log => log.id === logId);

        if (logIndex === -1) {
            throw new Error(`ログIDが見つかりません: ${logId}`);
        }

        logs[logIndex] = { ...logs[logIndex], ...updates, updatedAt: new Date().toISOString() };

        // 'details' は大きなデータになる可能性があるため、別ファイルに保存
        if (updates.details) {
            await writeJsonFileAtomic(path.join(getLogsDir(userId), `${logId}.json`), updates.details);
            // メタデータからは削除
            delete logs[logIndex].details;
        }

        updatedLog = logs[logIndex];
        return logs;
    });

    return updatedLog;
}

/**
 * 出品ログを削除する
 * @param {string} userId 
 * @param {string} logId 
 * @returns {Promise<boolean>}
 */
async function deleteListingLog(userId, logId) {
    if (isDatabaseEnabled()) {
        const current = await dbQuery(
            'SELECT status FROM listing_logs WHERE user_id = $1 AND id = $2',
            [userId, logId]
        );
        const logToDelete = current.rows[0];
        if (!logToDelete) {
            throw new Error(`削除対象のログIDが見つかりません: ${logId}`);
        }
        if (logToDelete.status === 'completed') {
            throw new Error('完了したログは削除できません。');
        }
        await dbQuery('DELETE FROM listing_logs WHERE user_id = $1 AND id = $2', [userId, logId]);
        return true;
    }

    await updateJsonFile(getMetaFilePath(userId), [], logs => {
        const logToDelete = logs.find(log => log.id === logId);

        if (!logToDelete) {
            throw new Error(`削除対象のログIDが見つかりません: ${logId}`);
        }

        // ステータスが 'completed' のログは削除させない
        if (logToDelete.status === 'completed') {
            throw new Error('完了したログは削除できません。');
        }

        // メタデータから削除
        return logs.filter(log => log.id !== logId);
    });

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
