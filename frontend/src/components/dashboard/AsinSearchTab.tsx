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

interface AsinSearchTabProps {
  onSearchComplete: (results: ProductResult[]) => void; // ★ 変更: 引数を受け取るように
}

const AsinSearchTab: React.FC<AsinSearchTabProps> = ({ onSearchComplete }) => {
  const [asins, setAsins] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setMessage('');
    try {
      const asinList = asins.split(/[\s,]+/).filter(a => a.trim() !== '');
      if (asinList.length === 0) {
        setMessage('ASINが入力されていません。');
        setLoading(false);
        return;
      }

      const response = await api.get('/search', {
        params: { searchType: 'asin', query: asinList },
        // 配列をクエリパラメータで送るための設定 (重要)
        paramsSerializer: params => {
          const searchParams = new URLSearchParams();
          for (const key in params) {
            const value = params[key];
            if (Array.isArray(value)) {
              for (const item of value) {
                searchParams.append(key, item);
              }
            } else {
              searchParams.set(key, value);
            }
          }
          return searchParams.toString();
        }
      });
      setMessage(response.data.message);
      // ★ 変更: 検索結果を onSearchComplete に渡す
      onSearchComplete(response.data.products || []);

    } catch (err: any) {
      setMessage(err.response?.data?.error || 'リサーチ中にエラーが発生しました。');
      setLoading(false);
    }
  };

  return (
    <>
      <Typography variant="h5" gutterBottom>ASIN検索</Typography>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <TextField
            label="ASIN (カンマやスペース区切りで複数可)"
            fullWidth
            multiline
            rows={4}
            value={asins}
            onChange={(e) => setAsins(e.target.value)}
          />
        </Box>
        <Box>
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading || !asins}
            sx={{ height: '100%', minHeight: '56px' }}
          >
            {loading ? <CircularProgress size={24} /> : '検索実行'}
          </Button>
        </Box>
      </Box>
      {message && <Alert severity={message.includes('エラー') ? 'error' : 'info'} sx={{ mt: 2 }}>{message}</Alert>}
    </>
  );
};

export default AsinSearchTab;
