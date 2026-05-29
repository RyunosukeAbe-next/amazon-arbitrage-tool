const fs = require('fs/promises');
const path = require('path');
const { readJsonFile, updateJsonFile, writeJsonFileAtomic } = require('./json-file-store');
const { isDatabaseEnabled, query: dbQuery } = require('./database');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

function getLogsDir(userId) {
    return path.join(DATA_DIR, 'research_logs', userId);
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
        console.log(`[ResearchLogger] Saving log ${logId} with ${results.length} items to DB...`);
        // 1. リサーチログ本体を保存 (detailsに全結果を格納)
        await dbQuery(
            `INSERT INTO research_logs (user_id, id, created_at, search_type, query, result_count, meta, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, logId, newLogMeta.createdAt, searchInfo.searchType, searchInfo.query, results.length, JSON.stringify(newLogMeta), JSON.stringify(results)]
        );

        // 2. 商品ライブラリ (harvested_products) へ Upsert
        console.log(`[ResearchLogger] Upserting ${results.length} items to Product Library...`);
        for (const p of results) {
            try {
                await dbQuery(
                    `INSERT INTO harvested_products (user_id, asin, product_name, brand, category, weight_kg, us_price, jp_price, us_seller_count, jp_seller_count, profit_jpy, profit_rate, is_excluded, exclusion_reason, last_harvested_at, data)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15)
                     ON CONFLICT (user_id, asin) DO UPDATE SET
                        product_name = EXCLUDED.product_name, brand = EXCLUDED.brand, category = EXCLUDED.category,
                        weight_kg = EXCLUDED.weight_kg, us_price = EXCLUDED.us_price, jp_price = EXCLUDED.jp_price,
                        us_seller_count = EXCLUDED.us_seller_count, jp_seller_count = EXCLUDED.jp_seller_count,
                        profit_jpy = EXCLUDED.profit_jpy, profit_rate = EXCLUDED.profit_rate,
                        is_excluded = EXCLUDED.is_excluded, exclusion_reason = EXCLUDED.exclusion_reason,
                        last_harvested_at = NOW(), data = EXCLUDED.data`,
                    [userId, p.asin, p.productName, p.brand, p.category, p.weightKg || p.weight, p.usPrice, p.jpPrice, p.usSellerCount, p.jpSellerCount, p.profitJpy, p.profitRate, p.isExcluded, p.exclusionReason, JSON.stringify(p)]
                );
            } catch (e) {
                // 個別のエラーはログを出して続行
                console.error(`[ResearchLogger] Error upserting ASIN ${p.asin}:`, e.message);
            }
        }
        return newLogMeta;
    }

    const logsDir = getLogsDir(userId);
    await fs.mkdir(logsDir, { recursive: true });
    await writeJsonFileAtomic(path.join(logsDir, `${logId}.json`), results);
    await updateJsonFile(path.join(logsDir, 'index.json'), (index = []) => [newLogMeta, ...index]);
    return newLogMeta;
}

/**
 * ユーザーのリサーチログ一覧を取得
 */
async function getResearchLogs(userId) {
    if (isDatabaseEnabled()) {
        const result = await dbQuery(
            'SELECT id, created_at as "createdAt", search_type as "searchType", query, result_count as "resultCount", meta FROM research_logs WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows.map(row => ({
            ...row,
            ...(typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta)
        }));
    }

    try {
        return await readJsonFile(path.join(getLogsDir(userId), 'index.json')) || [];
    } catch (error) {
        return [];
    }
}

/**
 * 特定のリサーチログの詳細を取得
 */
async function getResearchLogDetails(userId, logId) {
    if (isDatabaseEnabled()) {
        console.log(`[ResearchLogger] Fetching details for ${logId}`);
        const result = await dbQuery(
            'SELECT details FROM research_logs WHERE user_id = $1 AND id = $2',
            [userId, logId]
        );
        if (result.rows.length === 0) return null;
        let details = result.rows[0].details;
        if (typeof details === 'string') details = JSON.parse(details);
        return details;
    }

    try {
        return await readJsonFile(path.join(getLogsDir(userId), `${logId}.json`));
    } catch (error) {
        return null;
    }
}

async function deleteResearchLog(userId, logId) {
    if (isDatabaseEnabled()) {
        await dbQuery('DELETE FROM research_logs WHERE user_id = $1 AND id = $2', [userId, logId]);
        return true;
    }

    const logsDir = getLogsDir(userId);
    await updateJsonFile(path.join(logsDir, 'index.json'), (index = []) => index.filter(l => l.id !== logId));
    try {
        await fs.unlink(path.join(logsDir, `${logId}.json`));
        return true;
    } catch (error) {
        return false;
    }
}

module.exports = {
    saveResearchLog,
    getResearchLogs,
    getResearchLogDetails,
    deleteResearchLog,
};
