import React, { useState, useEffect } from 'react';
import {
  Typography, Box, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, Chip, CircularProgress, LinearProgress, IconButton, Tooltip, Modal, Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import api from '../../services/api';

interface ListingLog {
    id: string;
    title: string;
    status: 'processing' | 'completed' | 'error' | 'cancelled';
    totalAsinCount: number;
    listedProductCount: number;
    processedAsinCount?: number;
    resolvedAsinCount?: number;
    currentAsin?: string;
    createdAt: string;
    updatedAt?: string;
    summary: string;
}

interface ListingDetail {
    asin: string;
    sku?: string;
    status: 'success' | 'error' | 'skipped';
    message?: string;
    reason?: string;
}

const ListingLogsTab: React.FC = () => {
    const [logs, setLogs] = useState<ListingLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [selectedLogDetails, setSelectedLogDetails] = useState<ListingDetail[] | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const fetchLogs = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/listing-logs');
            setLogs(response.data);
        } catch (err: any) {
            setError(err.response?.data?.error || '出品ログの取得に失敗しました。');
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        const hasProcessingJob = logs.some(log => log.status === 'processing');
        if (hasProcessingJob && !loading) {
            const interval = setInterval(() => {
                fetchLogs();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [logs, loading]);

    const handleDelete = async (logId: string) => {
        if (!window.confirm(`本当にこのログを削除しますか？ (ID: ${logId})`)) {
            return;
        }
        setDeleting(logId);
        setError('');
        try {
            await api.delete(`/listing-logs/${logId}`);
            setLogs(prevLogs => prevLogs.filter(log => log.id !== logId));
        } catch (err: any) {
            setError(err.response?.data?.error || 'ログの削除に失敗しました。');
        } finally {
            setDeleting(null);
        }
    };

    const handleShowDetails = async (logId: string) => {
        setLoadingDetails(true);
        setError('');
        try {
            const response = await api.get(`/listing-logs/${logId}`);
            setSelectedLogDetails(response.data);
            setIsDetailModalOpen(true);
        } catch (err: any) {
            setError(err.response?.data?.error || '詳細ログの取得に失敗しました。');
        } finally {
            setLoadingDetails(false);
        }
    };

    const renderStatus = (log: ListingLog) => {
        switch (log.status) {
            case 'processing':
                return <Chip label="処理中" color="primary" size="small" icon={<CircularProgress size={14} color="inherit" />} />;
            case 'completed':
                return <Chip label="完了" color="success" variant="outlined" size="small" />;
            case 'error':
                return <Chip label="エラー" color="error" size="small" />;
            case 'cancelled':
                return <Chip label="キャンセル済" color="warning" variant="outlined" size="small" />;
            default:
                return <Chip label={log.status} size="small" />;
        }
    };

    const renderDetailStatus = (status: string) => {
        switch (status) {
            case 'success':
                return <Chip label="成功" color="success" size="small" />;
            case 'error':
                return <Chip label="エラー" color="error" size="small" />;
            case 'skipped':
                return <Chip label="スキップ" color="warning" size="small" />;
            default:
                return <Chip label={status} size="small" />;
        }
    };

    const getProgressValue = (log: ListingLog) => {
        if (!log.totalAsinCount) return 0;
        const processed = Math.min(log.processedAsinCount || 0, log.totalAsinCount);
        return Math.round((processed / log.totalAsinCount) * 100);
    };

    return (
        <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" component="h2">
                    出品ログ
                </Typography>
                <Button onClick={fetchLogs} variant="outlined" disabled={loading}>
                    {loading ? '更新中...' : 'ログを更新'}
                </Button>
            </Box>
            {loading && logs.length === 0 && <LinearProgress sx={{ mb: 1 }} />}
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TableContainer component={Paper}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{width: '10%'}}>ID</TableCell>
                            <TableCell sx={{width: '15%'}}>タイトル</TableCell>
                            <TableCell sx={{width: '10%'}}>ステータス</TableCell>
                            <TableCell sx={{width: '10%'}} align="right">進捗</TableCell>
                            <TableCell sx={{width: '5%'}} align="right">出品数</TableCell>
                            <TableCell sx={{width: '15%'}}>作成日時</TableCell>
                            <TableCell sx={{width: '25%'}}>摘要</TableCell>
                            <TableCell sx={{width: '10%'}} align="center">操作</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {logs.map((log) => (
                            <TableRow key={log.id} hover>
                                <TableCell>
                                    <Typography variant="caption" display="block">{log.id}</Typography>
                                </TableCell>
                                <TableCell>{log.title}</TableCell>
                                <TableCell>{renderStatus(log)}</TableCell>
                                <TableCell align="right">
                                    <Typography variant="caption" display="block">
                                        {log.processedAsinCount || 0}/{log.totalAsinCount}
                                    </Typography>
                                    <LinearProgress
                                        variant="determinate"
                                        value={log.status === 'completed' ? 100 : getProgressValue(log)}
                                        sx={{ minWidth: 80 }}
                                    />
                                </TableCell>
                                <TableCell align="right">{log.listedProductCount}</TableCell>
                                <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                                <TableCell>{log.summary}</TableCell>
                                <TableCell align="center">
                                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                        <Tooltip title="詳細を見る">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleShowDetails(log.id)}
                                                disabled={loadingDetails}
                                            >
                                                <InfoIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        {log.status !== 'completed' && (
                                            <Tooltip title="このログを削除">
                                                <IconButton
                                                    aria-label="delete"
                                                    onClick={() => handleDelete(log.id)}
                                                    disabled={deleting === log.id}
                                                    size="small"
                                                >
                                                    {deleting === log.id ? <CircularProgress size={20} /> : <DeleteIcon fontSize="small" />}
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Modal open={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)}>
                <Box sx={{ 
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
                    width: '80%', maxHeight: '80vh', bgcolor: 'background.paper', boxShadow: 24, p: 4,
                    overflowY: 'auto', borderRadius: 1
                }}>
                    <Typography variant="h6" component="h2" gutterBottom>出品処理結果詳細</Typography>
                    <TableContainer component={Paper} sx={{ mt: 2 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>ASIN</TableCell>
                                    <TableCell>SKU</TableCell>
                                    <TableCell>ステータス</TableCell>
                                    <TableCell>メッセージ/理由</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {selectedLogDetails?.map((detail, idx) => (
                                    <TableRow key={`${detail.asin}-${idx}`} hover>
                                        <TableCell>{detail.asin}</TableCell>
                                        <TableCell>{detail.sku || '-'}</TableCell>
                                        <TableCell>{renderDetailStatus(detail.status)}</TableCell>
                                        <TableCell>{detail.message || detail.reason || '-'}</TableCell>
                                    </TableRow>
                                ))}
                                {(!selectedLogDetails || selectedLogDetails.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center">詳細データがありません。</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button onClick={() => setIsDetailModalOpen(false)} variant="contained">閉じる</Button>
                    </Box>
                </Box>
            </Modal>
        </>
    );
};

export default ListingLogsTab;
