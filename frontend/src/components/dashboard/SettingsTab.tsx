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
  // ... (rest of state variables)

  useEffect(() => {
    fetchSettings();
    fetchAmazonAuthStatus();
  }, []);

  // ... (fetchAmazonAuthStatus)

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
    // ... (same as before)
  };

  const handleArraySettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // ... (same as before)
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

  // ... (handleSaveSettings, handleLinkAmazon, etc.)

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

          {/* ... (Amazon Link Box) ... */}
          
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
