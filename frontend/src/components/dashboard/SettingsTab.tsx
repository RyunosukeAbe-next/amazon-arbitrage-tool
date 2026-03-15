import React, { useState, useEffect } from 'react';
import { 
  Typography, TextField, Button, Box, Alert, CircularProgress 
} from '@mui/material';
import api from '../../services/api';
import { AppSettings } from '../../types';

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    internationalShippingRatePerKg: 0,
    domesticShippingCostPerItem: 0,
    customsDutyRate: 0,
    amazonFeeRate: 0,
    exchangeRateJpyToUsd: 0,
    inventoryThreshold: 1,
    excludedAsins: [],
    excludedBrands: [],
    excludedKeywords: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      setSettings(response.data);
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
      [name]: name.includes('Rate') || name.includes('Cost') || name.includes('Threshold') || name.includes('RatePerKg') || name.includes('CostPerItem') ? parseFloat(value) || 0 : value
    }));
  };

  const handleArraySettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value.split(',').map(item => item.trim()).filter(item => item !== '')
    }));
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
            <TextField label="国際送料 (1kgあたり円)" name="internationalShippingRatePerKg" type="number" value={settings.internationalShippingRatePerKg} onChange={handleSettingsChange} fullWidth />
            <TextField label="国内送料 (1個あたり円)" name="domesticShippingCostPerItem" type="number" value={settings.domesticShippingCostPerItem} onChange={handleSettingsChange} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="関税率 (例: 0.05)" name="customsDutyRate" type="number" value={settings.customsDutyRate} onChange={handleSettingsChange} fullWidth />
            <TextField label="Amazon手数料率 (例: 0.15)" name="amazonFeeRate" type="number" value={settings.amazonFeeRate} onChange={handleSettingsChange} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="為替レート (1ドルあたり円)" name="exchangeRateJpyToUsd" type="number" value={settings.exchangeRateJpyToUsd} onChange={handleSettingsChange} fullWidth />
            <TextField label="在庫取下閾値 (出品者数)" name="inventoryThreshold" type="number" value={settings.inventoryThreshold} onChange={handleSettingsChange} fullWidth />
          </Box>
          <TextField label="除外ASIN (カンマ区切り)" name="excludedAsins" value={settings.excludedAsins.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />
          <TextField label="除外ブランド (カンマ区切り)" name="excludedBrands" value={settings.excludedBrands.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />
          <TextField label="除外キーワード (カンマ区切り)" name="excludedKeywords" value={settings.excludedKeywords.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />
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
