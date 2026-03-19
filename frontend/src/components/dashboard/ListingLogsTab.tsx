import React, { useState, useEffect } from 'react';
import {
  Typography, Box, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, Chip, CircularProgress, LinearProgress, IconButton, Tooltip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import api from '../../services/api';

interface ListingLog {
    id: string;
    title: string;
    status: 'processing' | 'completed' | 'error' | 'cancelled';
    totalAsinCount: number;
    listedProductCount: number;
    createdAt: string;
    updatedAt?: string;
    summary: string;
}

const ListingLogsTab: React.FC = () => {
    const [logs, setLogs] = useState<ListingLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null); // 削除中のログIDを保持
    const [error, setError] = useState('');

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

    // processing中のログがある場合、5秒ごとに自動更新
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
            {error && <Typography color="error" sx={{ my: 1 }}>{error}</Typography>}
            <TableContainer component={Paper}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{width: '15%'}}>ID</TableCell>
                            <TableCell sx={{width: '20%'}}>タイトル</TableCell>
                            <TableCell sx={{width: '10%'}}>ステータス</TableCell>
                            <TableCell sx={{width: '5%'}} align="right">総数</TableCell>
                            <TableCell sx={{width: '5%'}} align="right">出品数</TableCell>
                            <TableCell sx={{width: '15%'}}>作成日時</TableCell>
                            <TableCell sx={{width: '25%'}}>摘要</TableCell>
                            <TableCell sx={{width: '5%'}}>操作</TableCell>
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
                                <TableCell align="right">{log.totalAsinCount}</TableCell>
                                <TableCell align="right">{log.listedProductCount}</TableCell>
                                <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                                <TableCell>{log.summary}</TableCell>
                                <TableCell>
                                    {log.status !== 'completed' && (
                                        <Tooltip title="このログを削除">
                                            <span>
                                                <IconButton
                                                    edge="end"
                                                    aria-label="delete"
                                                    onClick={() => handleDelete(log.id)}
                                                    disabled={deleting === log.id}
                                                    size="small"
                                                >
                                                    {deleting === log.id ? <CircularProgress size={20} /> : <DeleteIcon />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </>
    );
};

export default ListingLogsTab;
