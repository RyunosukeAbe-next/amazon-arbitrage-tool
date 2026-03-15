import React, { useState, useEffect } from 'react';
import { 
  Typography, Box, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, Button, Modal, Alert, CircularProgress 
} from '@mui/material';
import api from '../../services/api';
import { Product, ResearchLog } from '../../types';

const ResearchLogsTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [researchLogs, setResearchLogs] = useState<ResearchLog[]>([]);
  const [selectedLogDetails, setSelectedLogDetails] = useState<Product[] | null>(null);
  const [isLogDetailModalOpen, setIsLogDetailModalOpen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null); // logIdを保持

  useEffect(() => {
    fetchResearchLogs();
  }, []);

  const fetchResearchLogs = async () => {
    setLoading(true);
    try {
      const response = await api.get('/research-logs');
      setResearchLogs(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'リサーチログの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleShowLogDetails = async (logId: string) => {
    setLoading(true);
    try {
      const response = await api.get(`/research-logs/${logId}`);
      setSelectedLogDetails(response.data);
      setIsLogDetailModalOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'ログ詳細の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadLogCsv = async (logId: string) => {
    setDownloading(logId);
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
    if (!window.confirm('このログを本当に削除しますか？')) return;
    setLoading(true);
    try {
      await api.delete(`/research-logs/${logId}`);
      await fetchResearchLogs();
    } catch (err: any) {
      setError(err.response?.data?.error || 'ログの削除に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Typography variant="h5" gutterBottom>リサーチログ</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress sx={{ mb: 2 }} />}
      <Button onClick={fetchResearchLogs} sx={{ mb: 2 }}>ログを更新</Button>
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>実行日時</TableCell>
              <TableCell>検索タイプ</TableCell>
              <TableCell>検索クエリ</TableCell>
              <TableCell>カテゴリ</TableCell>
              <TableCell align="right">ヒット件数</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {researchLogs.map((log) => (
              <TableRow key={log.id} hover>
                <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                <TableCell>{log.searchType}</TableCell>
                <TableCell>{log.query}</TableCell>
                <TableCell>{log.classification?.name || 'N/A'}</TableCell>
                <TableCell align="right">{log.resultCount}</TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Button size="small" variant="outlined" onClick={() => handleShowLogDetails(log.id)}>詳細</Button>
                    <Button size="small" variant="outlined" color="secondary" onClick={() => handleDownloadLogCsv(log.id)} disabled={downloading === log.id}>
                      {downloading === log.id ? '...' : 'CSV'}
                    </Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => handleDeleteLog(log.id)}>削除</Button>
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
          <TableContainer component={Paper} sx={{ maxHeight: '70vh', mt: 2 }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>ASIN</TableCell>
                  <TableCell>商品名</TableCell>
                  <TableCell align="right">米国価格 ($)</TableCell>
                  <TableCell align="right">日本価格 (¥)</TableCell>
                  <TableCell align="right">利益 (円)</TableCell>
                  <TableCell align="right">利益率 (%)</TableCell>
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
