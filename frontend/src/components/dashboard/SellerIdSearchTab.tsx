import React, { useState } from 'react';
import {
  Typography, TextField, Button, Box, CircularProgress, Alert
} from '@mui/material';
import api from '../../services/api';

// ProductResult 型定義をここに追加
interface ProductResult {
  asin: string;
  itemName: string;
  usPrice: number;
  jpPrice: number;
  usSellerCount: number;
  // 他にも表示したいプロパティがあればここに追加
}

interface SellerIdSearchTabProps {
  onSearchComplete: (results: ProductResult[]) => void; // ★ 変更: 引数を受け取るように
}

const SellerIdSearchTab: React.FC<SellerIdSearchTabProps> = ({ onSearchComplete }) => {
  const [sellerId, setSellerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await api.get('/search', { params: { searchType: 'seller', query: sellerId } });
      setMessage(response.data.message);
      // ★ 変更: 検索結果を onSearchComplete に渡す
      onSearchComplete(response.data.products || []);
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'リサーチ中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Typography variant="h5" gutterBottom>セラーID検索</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <TextField
            label="セラーID"
            fullWidth
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
          />
        </Box>
        <Box>
          <Button variant="contained" onClick={handleSearch} disabled={loading || !sellerId}>
            {loading ? <CircularProgress size={24} /> : '検索実行'}
          </Button>
        </Box>
      </Box>
      {message && <Alert severity={message.includes('エラー') ? 'error' : 'info'} sx={{ mt: 2 }}>{message}</Alert>}
    </>
  );
};

export default SellerIdSearchTab;
