import React, { useState, useEffect, useCallback } from 'react';
import {
  Typography, Box, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, Modal, Alert, CircularProgress, Chip
} from '@mui/material';
import api from '../../services/api';
import { Product, ResearchLog } from '../../types';
import { SearchJob, SearchJobStatus } from '../../pages/DashboardPage';

interface ResearchLogsTabProps {
  activeJobs: SearchJob[];
  onCancelJob: (jobId: string) => void;
  onLogsLoaded?: (logs: ResearchLog[]) => void;
}

const ResearchLogsTab: React.FC<ResearchLogsTabProps> = ({ activeJobs, onCancelJob, onLogsLoaded }) => {
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [researchLogs, setResearchLogs] = useState<ResearchLog[]>([]);
  const [selectedLogDetails, setSelectedLogDetails] = useState<Product[] | null>(null);
  const [isLogDetailModalOpen, setIsLogDetailModalOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [listingAsin, setListingAsin] = useState<string | null>(null);

  const fetchResearchLogs = useCallback(async () => {
    setLoadingLogs(true);
    setError('');
    try {
      const response = await api.get('/research-logs');
      setResearchLogs(response.data);
      onLogsLoaded?.(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'リサーチログの読み込みに失敗しました。');
    } finally {
      setLoadingLogs(false);
    }
  }, [onLogsLoaded]);

  useEffect(() => {
    fetchResearchLogs();
  }, [fetchResearchLogs]);

  const handleListing = async (product: Product) => {
    if (!window.confirm(`ASIN: ${product.asin} を米国Amazonに出品しますか？`)) return;

    setListingAsin(product.asin);
    setError('');
    setSuccessMessage('');

    try {
      await api.post('/listing', {
        asin: product.asin,
        price: product.usPrice,
        quantity: product.jpSellerCount || 1,
        marketplaceId: 'ATVPDKIKX0DER',
        productType: product.productType || 'PRODUCT',
      });
      setSuccessMessage(`${product.asin} の出品に成功しました。`);
    } catch (err: any) {
      setError(err.response?.data?.error || '出品に失敗しました。');
    } finally {
      setListingAsin(null);
    }
  };

  const handleShowLogDetails = async (logId: string) => {
    setLoadingDetails(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await api.get(`/research-logs/${logId}`);
      setSelectedLogDetails(response.data);
      setIsLogDetailModalOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'ログ詳細の取得に失敗しました。');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDownloadLogCsv = async (logId: string) => {
    setDownloading(logId);
    setError('');
    try {
      const response = await api.post('/download-csv', { logId }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `research_log_${logId}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err: any) {
      setError(err.response?.data?.error || 'CSVダウンロード中にエラーが発生しました。');
    } finally {
      setDownloading(null);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!window.confirm('このリサーチログを削除しますか？')) return;

    setDeletingLogId(logId);
    setError('');
    setSuccessMessage('');
    try {
      await api.delete(`/research-logs/${logId}`);
      setResearchLogs(prev => prev.filter(log => log.id !== logId));
      setSuccessMessage('リサーチログを削除しました。');
      await fetchResearchLogs();
    } catch (err: any) {
      setError(err.response?.data?.error || 'ログの削除に失敗しました。');
    } finally {
      setDeletingLogId(null);
    }
  };

  const renderStatus = (status: SearchJobStatus) => {
    switch (status) {
      case 'fetching':
        return <Chip label="取得中" color="primary" size="small" icon={<CircularProgress size={14} color="inherit" />} />;
      case 'waiting':
        return <Chip label="待機中" color="default" size="small" />;
      case 'completed':
        return <Chip label="取得完了" color="success" variant="outlined" size="small" />;
      case 'error':
        return <Chip label="エラー" color="error" size="small" />;
      case 'cancelled':
        return <Chip label="キャンセル済み" color="warning" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h5">リサーチログ</Typography>
        {loadingLogs && <CircularProgress size={20} />}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}

      <TableContainer component={Paper}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '15%' }}>実行日時</TableCell>
              <TableCell sx={{ width: '15%' }}>ステータス</TableCell>
              <TableCell>検索クエリ/ジョブ名</TableCell>
              <TableCell align="right" sx={{ width: '10%' }}>ヒット件数</TableCell>
              <TableCell align="center" sx={{ width: '20%' }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {activeJobs.map((job) => (
              <TableRow key={job.id} sx={{ backgroundColor: job.status === 'error' ? 'rgba(255, 0, 0, 0.05)' : 'inherit' }}>
                <TableCell>{new Date(job.id.split('-')[0]).toLocaleString()}</TableCell>
                <TableCell>{renderStatus(job.status)}</TableCell>
                <TableCell>
                  {job.name}
                  {job.status === 'error' && (
                    <Typography variant="caption" color="error.main" display="block">
                      {job.message}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">-</TableCell>
                <TableCell align="center">
                  {(job.status === 'waiting' || job.status === 'fetching' || job.status === 'error') && (
                    <Button size="small" variant="outlined" color="warning" onClick={() => onCancelJob(job.id)}>
                      削除
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}

            {researchLogs.map((log) => (
              <TableRow key={log.id} hover>
                <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                <TableCell>{renderStatus('completed')}</TableCell>
                <TableCell>{log.query || 'N/A'}</TableCell>
                <TableCell align="right">{log.resultCount}</TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Button size="small" variant="outlined" onClick={() => handleShowLogDetails(log.id)} disabled={loadingDetails}>
                      詳細
                    </Button>
                    <Button size="small" variant="outlined" color="secondary" onClick={() => handleDownloadLogCsv(log.id)} disabled={downloading === log.id}>
                      {downloading === log.id ? '...' : 'CSV'}
                    </Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => handleDeleteLog(log.id)} disabled={deletingLogId === log.id}>
                      {deletingLogId === log.id ? '削除中' : '削除'}
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Modal open={isLogDetailModalOpen} onClose={() => setIsLogDetailModalOpen(false)}>
        <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', bgcolor: 'background.paper', border: '2px solid #000', boxShadow: 24, p: 4 }}>
          <Typography variant="h6" component="h2">リサーチ結果詳細</Typography>
          {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TableContainer component={Paper} sx={{ maxHeight: '70vh', mt: 2 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>ASIN</TableCell>
                  <TableCell>商品名</TableCell>
                  <TableCell align="right">米国価格 ($)</TableCell>
                  <TableCell align="right">日本価格 (円)</TableCell>
                  <TableCell align="right">利益 (円)</TableCell>
                  <TableCell align="right">利益率 (%)</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedLogDetails?.map((product) => (
                  <TableRow key={product.asin}>
                    <TableCell>{product.asin}</TableCell>
                    <TableCell>{product.productName}</TableCell>
                    <TableCell align="right">{product.usPrice?.toFixed(2)}</TableCell>
                    <TableCell align="right">{product.jpPrice?.toLocaleString()}</TableCell>
                    <TableCell align="right">{product.profitJpy?.toLocaleString()}</TableCell>
                    <TableCell align="right">{product.profitRate?.toFixed(2)}</TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        onClick={() => handleListing(product)}
                        disabled={listingAsin === product.asin}
                      >
                        {listingAsin === product.asin ? <CircularProgress size={20} /> : '出品'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Button onClick={() => setIsLogDetailModalOpen(false)} sx={{ mt: 2 }}>閉じる</Button>
        </Box>
      </Modal>
    </>
  );
};

export default ResearchLogsTab;
