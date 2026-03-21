import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container, Typography, CircularProgress, Box, Alert } from '@mui/material';
import api from '../services/api';

const AmazonCallbackPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Amazon認証を処理しています...');
  const [severity, setSeverity] = useState<'info' | 'success' | 'error'>('info');

  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const state = params.get('state');
      const sellingPartnerId = params.get('selling_partner_id'); // SP-APIからの情報

      if (!code || !state) {
        setMessage('Amazon認証情報が不足しています。');
        setSeverity('error');
        // エラー後、ダッシュボードの設定タブにリダイレクト
        setTimeout(() => navigate('/?tab=settings'), 3000);
        return;
      }

      try {
        const response = await api.get('/amazon/callback', { 
          params: { code, state, selling_partner_id: sellingPartnerId } 
        });
        setMessage(response.data.message || 'Amazonアカウントとの連携に成功しました！');
        setSeverity('success');
      } catch (err: any) {
        setMessage(err.response?.data?.error || 'Amazonアカウントとの連携に失敗しました。');
        setSeverity('error');
      } finally {
        // 処理後、ダッシュボードの設定タブにリダイレクト
        setTimeout(() => navigate('/?tab=settings'), 3000);
      }
    };

    processCallback();
  }, [location, navigate]);

  return (
    <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
      <Box sx={{ p: 4, bgcolor: 'background.paper', borderRadius: 2, boxShadow: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Amazon連携コールバック
        </Typography>
        {severity === 'info' ? (
          <CircularProgress sx={{ my: 3 }} />
        ) : (
          <Alert severity={severity} sx={{ my: 3 }}>
            {message}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary">
          {message.includes('成功') ? 'ダッシュボードにリダイレクト中です...' : '問題が発生しました。ダッシュボードに戻ります...'}
        </Typography>
      </Box>
    </Container>
  );
};

export default AmazonCallbackPage;
