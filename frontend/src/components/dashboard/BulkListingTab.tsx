import React, { useState } from 'react';
import { 
  Typography, TextField, Button, Box, Paper, Alert, CircularProgress 
} from '@mui/material';
import api from '../../services/api';

const BulkListingTab: React.FC = () => {
  const [bulkAsins, setBulkAsins] = useState('');
  const [bulkListingResult, setBulkListingResult] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBulkListing = async () => {
    setLoading(true);
    setBulkListingResult('');
    try {
      const asins = bulkAsins.split('\n').map(asin => asin.trim()).filter(asin => asin !== '');
      if (asins.length === 0) {
        setBulkListingResult('ASINが入力されていません。');
        setLoading(false);
        return;
      }
      
      const response = await api.post('/bulk-listing', { asins });
      setBulkListingResult(response.data.details || '処理が完了しました。');

    } catch (err: any) {
      setBulkListingResult(`エラー: ${err.response?.data?.error || '一括出品処理中にエラーが発生しました。'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Typography variant="h5" component="h2" gutterBottom>
        一括出品
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        <TextField
          label="ASINリスト (1行に1ASIN)"
          variant="outlined"
          multiline
          rows={10}
          fullWidth
          value={bulkAsins}
          onChange={(e) => setBulkAsins(e.target.value)}
          placeholder="ここにASINを貼り付けます..."
        />
        <Box>
          <Button 
            variant="contained" 
            onClick={handleBulkListing} 
            disabled={loading || !bulkAsins.trim()}
          >
            {loading ? <CircularProgress size={24} /> : '一括出品を実行'}
          </Button>
        </Box>
      </Box>
      {bulkListingResult && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6">処理結果:</Typography>
          <Paper sx={{ p: 2, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', backgroundColor: '#f5f5f5' }}>
            <Typography component="pre" variant="body2">
              {bulkListingResult}
            </Typography>
          </Paper>
        </Box>
      )}
    </>
  );
};

export default BulkListingTab;
