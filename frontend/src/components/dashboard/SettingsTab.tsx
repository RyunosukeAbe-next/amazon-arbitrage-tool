import React, { useState, useEffect } from 'react';
import { Typography, TextField, Button, Box, Alert, CircularProgress } from '@mui/material';
import api from '../../services/api';
import { AppSettings, ProfitabilityTier, AmazonFeeTier, ShippingCostTier } from '../../types';
import ProfitabilityTiersTable from './ProfitabilityTiersTable';
import AmazonFeeTiersTable from './AmazonFeeTiersTable';
import ShippingCostTiersTable from './ShippingCostTiersTable';

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    domesticShippingCostPerItem: 0,
    customsDutyRate: 0,
    exchangeRateJpyToUsd: 0,
    inventoryThreshold: 1,
    excludedAsins: [],
    excludedBrands: [],
    excludedKeywords: [],
    profitabilityTiers: [],
    amazonFeeTiers: [],
    shippingCostTiers: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const [isAmazonLinked, setIsAmazonLinked] = useState(false);
  const [sellingPartnerId, setSellingPartnerId] = useState<string | null>(null);
  const [linkedAt, setLinkedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchAmazonAuthStatus();
  }, []);

  const fetchAmazonAuthStatus = async () => {
    try {
      const response = await api.get('/amazon/auth-status');
      setIsAmazonLinked(response.data.isLinked);
      setSellingPartnerId(response.data.sellingPartnerId || null);
      setLinkedAt(response.data.linkedAt || null);
    } catch (err: any) {
      console.error('Amazon認証ステータスの取得に失敗しました。', err);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      const fetchedSettings = response.data;
      if (!fetchedSettings.profitabilityTiers) fetchedSettings.profitabilityTiers = [];
      if (!fetchedSettings.amazonFeeTiers) fetchedSettings.amazonFeeTiers = [];
      if (!fetchedSettings.shippingCostTiers) fetchedSettings.shippingCostTiers = [];
      setSettings(fetchedSettings);
    } catch (err: any) {
      setError(err.response?.data?.error || '設定の読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: name.includes('Rate') || name.includes('Cost') || name.includes('Threshold') ? parseFloat(value) || 0 : value
    }));
  };

  const handleArraySettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value.split(',').map(item => item.trim()).filter(item => item !== '')
    }));
  };

  const handleProfitabilityTiersChange = (tiers: ProfitabilityTier[]) => {
    setSettings(prev => ({ ...prev, profitabilityTiers: tiers }));
  };

  const handleFeeTiersChange = (tiers: AmazonFeeTier[]) => {
    setSettings(prev => ({ ...prev, amazonFeeTiers: tiers }));
  };

  const handleShippingTiersChange = (tiers: ShippingCostTier[]) => {
    setSettings(prev => ({ ...prev, shippingCostTiers: tiers }));
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    setError('');
    setSavedMessage('');
    try {
      await api.post('/settings', settings);
      setSavedMessage('設定が保存されました！');
    } catch (err: any) {
      setError(err.response?.data?.error || '設定の保存に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAmazon = async () => {
    setLoading(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await api.get('/amazon/authorize');
      window.location.href = response.data.authorizationUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Amazon認証URLの取得に失敗しました。');
      setLoading(false);
    }
  };

  const handleDisconnectAmazon = async () => {
    setLoading(true);
    setError('');
    setSavedMessage('');
    try {
      await api.delete('/amazon/disconnect');
      setSavedMessage('Amazonアカウントの連携を解除しました。');
      await fetchAmazonAuthStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Amazonアカウントの連携解除に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Typography variant="h5" component="h2" gutterBottom>設定</Typography>
      {loading ? (
        <CircularProgress />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <Box component="form" noValidate autoComplete="off" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="国内送料 (1個あたり円)" name="domesticShippingCostPerItem" type="number" value={settings.domesticShippingCostPerItem} onChange={handleSettingsChange} fullWidth />
            <TextField label="関税率 (例: 0.05)" name="customsDutyRate" type="number" value={settings.customsDutyRate} onChange={handleSettingsChange} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="為替レート (1ドルあたり円)" name="exchangeRateJpyToUsd" type="number" value={settings.exchangeRateJpyToUsd} onChange={handleSettingsChange} fullWidth />
            <TextField label="在庫取下閾値 (出品者数)" name="inventoryThreshold" type="number" value={settings.inventoryThreshold} onChange={handleSettingsChange} fullWidth />
          </Box>
          
          <ShippingCostTiersTable tiers={settings.shippingCostTiers || []} onTiersChange={handleShippingTiersChange} />
          <AmazonFeeTiersTable tiers={settings.amazonFeeTiers || []} onTiersChange={handleFeeTiersChange} />
          
          <TextField label="除外ASIN (カンマ区切り)" name="excludedAsins" value={settings.excludedAsins.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />
          <TextField label="除外ブランド (カンマ区切り)" name="excludedBrands" value={settings.excludedBrands.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />
          <TextField label="除外キーワード (カンマ区切り)" name="excludedKeywords" value={settings.excludedKeywords.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />

          <ProfitabilityTiersTable tiers={settings.profitabilityTiers || []} onTiersChange={handleProfitabilityTiersChange} />

          <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
            <Typography variant="h6" gutterBottom>Amazonアカウント連携</Typography>
            {isAmazonLinked ? (
              <>
                <Alert severity="success">
                  Amazonアカウントと連携済みです。<br />
                  Selling Partner ID: {sellingPartnerId}<br />
                  連携日時: {linkedAt ? new Date(linkedAt).toLocaleString() : 'N/A'}
                </Alert>
                <Button 
                  variant="outlined" 
                  color="secondary" 
                  onClick={handleDisconnectAmazon} 
                  disabled={loading} 
                  sx={{ mt: 2 }}
                >
                  Amazonアカウント連携を解除
                </Button>
              </>
            ) : (
              <>
                <Alert severity="warning">Amazonアカウントは連携されていません。</Alert>
                <Button 
                  variant="contained" 
                  onClick={handleLinkAmazon} 
                  disabled={loading} 
                  sx={{ mt: 2 }}
                >
                  Amazonアカウントと連携する
                </Button>
              </>
            )}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          </Box>
          
          <Box>
            <Button variant="contained" onClick={handleSaveSettings} disabled={loading}>設定を保存</Button>
          </Box>
          {savedMessage && <Alert severity="success" sx={{ mt: 2 }}>{savedMessage}</Alert>}
        </Box>
      )}
    </>
  );
};

export default SettingsTab;
