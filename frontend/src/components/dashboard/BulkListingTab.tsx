import React, { useState } from 'react';
import { 
  Typography, TextField, Button, Box, Alert, CircularProgress 
} from '@mui/material';
import api from '../../services/api';

const BulkListingTab: React.FC = () => {
  const [asinsToSubmit, setAsinsToSubmit] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [apiMessage, setApiMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStartAutoListing = async () => {
    setLoading(true);
    setApiMessage(null);
    try {
      const asins = asinsToSubmit.split(/[\s,]+/).map(asin => asin.trim()).filter(asin => asin !== '');
      if (asins.length === 0) {
        setApiMessage({ type: 'error', text: 'ASINが入力されていません。' });
        setLoading(false);
        return;
      }
      
      const response = await api.post('/bulk-listing-from-asins', { asins, title: jobTitle });
      setApiMessage({ type: 'success', text: response.data.message || '処理の受付が完了しました。出品ログを確認してください。' });

    } catch (err: any) {
      setApiMessage({ type: 'error', text: `エラー: ${err.response?.data?.error || '自動出品の開始に失敗しました。'}`});
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Typography variant="h5" component="h2" gutterBottom>
        ASINリストから自動出品
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        CSVなどからコピーしたASINのリストを貼り付けて、設定に基づいたフィルタリングと自動出品を開始します。
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        <TextField
          label="出品ジョブのタイトル (任意)"
          variant="outlined"
          fullWidth
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
        <TextField
          label="ASINリスト (カンマやスペース、改行区切りで複数可)"
          variant="outlined"
          multiline
          rows={10}
          fullWidth
          value={asinsToSubmit}
          onChange={(e) => setAsinsToSubmit(e.target.value)}
          placeholder="ここにASINを貼り付けます..."
        />
        <Box>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleStartAutoListing} 
            disabled={loading || !asinsToSubmit.trim()}
          >
            {loading ? <CircularProgress size={24} /> : '自動出品を開始'}
          </Button>
        </Box>
      </Box>
      {apiMessage && (
        <Alert severity={apiMessage.type} sx={{ mt: 2 }}>
          {apiMessage.text}
        </Alert>
      )}
    </>
  );
};

export default BulkListingTab;
