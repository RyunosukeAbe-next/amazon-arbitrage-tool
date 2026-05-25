import React, { useState, useEffect } from 'react';
import { Typography, TextField, Button, Box, Alert, CircularProgress, FormControlLabel, Switch } from '@mui/material';
import api from '../../services/api';
import { AppSettings, ProfitabilityTier, ShippingCostTier } from '../../types';
import ProfitabilityTiersTable from './ProfitabilityTiersTable';
import ShippingCostTiersTable from './ShippingCostTiersTable';

const US_MARKETPLACE_ID = 'ATVPDKIKX0DER';
const JP_MARKETPLACE_ID = 'A1VC38T7YXB528';

interface AuthStatusDetail {
  isLinked: boolean;
  sellingPartnerId?: string;
  linkedAt?: string;
}

interface AmazonAuthStatus {
  us: AuthStatusDetail;
  jp: AuthStatusDetail;
}

const SettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<Partial<AppSettings>>({
    domesticShippingCostPerItem: 0,
    internationalShippingFscRate: 0.204,
    internationalShippingFixedFeeJpy: 220,
    customsDutyRate: 0,
    amazonFeeRate: 0.15,
    exchangeRateJpyToUsd: 0,
    autoExchangeRateEnabled: true,
    exchangeRateRefreshIntervalMinutes: 360,
    exchangeRateUpdatedAt: null,
    exchangeRateDate: null,
    exchangeRateSource: null,
    inventoryThreshold: 1,
    leadTimeBuffer: 3,
    keepaSellerAsinLimit: 1000,
    excludedAsins: [],
    excludedBrands: [],
    excludedKeywords: [],
    profitabilityTiers: [],
    shippingCostTiers: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshingExchangeRate, setRefreshingExchangeRate] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const [authStatus, setAuthStatus] = useState<AmazonAuthStatus>({
    us: { isLinked: false },
    jp: { isLinked: false }
  });

  useEffect(() => {
    fetchSettings();
    fetchAmazonAuthStatus();
  }, []);

  const fetchAmazonAuthStatus = async () => {
    try {
      const response = await api.get('/amazon/auth-status');
      setAuthStatus(response.data);
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
    const numericFields = new Set([
      'domesticShippingCostPerItem',
      'internationalShippingFscRate',
      'internationalShippingFixedFeeJpy',
      'customsDutyRate',
      'amazonFeeRate',
      'exchangeRateJpyToUsd',
      'exchangeRateRefreshIntervalMinutes',
      'inventoryThreshold',
      'leadTimeBuffer',
      'keepaSellerAsinLimit'
    ]);

    setSettings(prev => ({
      ...prev,
      [name]: numericFields.has(name) ? parseFloat(value) || 0 : value
    }));
  };

  const handleSwitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: checked
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

  const handleRefreshExchangeRate = async () => {
    setRefreshingExchangeRate(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await api.post('/settings/exchange-rate/refresh');
      setSettings(response.data.settings);
      setSavedMessage(response.data.message || '為替レートを更新しました。');
    } catch (err: any) {
      setError(err.response?.data?.error || '為替レートの更新に失敗しました。');
    } finally {
      setRefreshingExchangeRate(false);
    }
  };

  const handleLinkAmazon = async (marketplaceId: string) => {
    setLoading(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await api.get(`/amazon/authorize?marketplaceId=${marketplaceId}`);
      window.location.href = response.data.authorizationUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Amazon認証URLの取得に失敗しました。');
      setLoading(false);
    }
  };

  const handleDisconnectAmazon = async (marketplaceId: string) => {
    if (!window.confirm(`${marketplaceId === JP_MARKETPLACE_ID ? '日本' : '米国'}Amazonアカウントの連携を解除しますか？`)) return;
    setLoading(true);
    setError('');
    setSavedMessage('');
    try {
      await api.delete(`/amazon/disconnect?marketplaceId=${marketplaceId}`);
      setSavedMessage(`${marketplaceId === JP_MARKETPLACE_ID ? '日本' : '米国'}Amazonアカウントの連携を解除しました。`);
      await fetchAmazonAuthStatus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Amazonアカウントの連携解除に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const renderAuthSection = (title: string, mktId: string, status: AuthStatusDetail) => (
    <Box sx={{ p: 2, border: '1px solid #ccc', borderRadius: '4px', flex: '1 1 300px' }}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {status.isLinked ? (
        <>
          <Alert severity="success" sx={{ mb: 1 }}>連携済み</Alert>
          <Typography variant="body2">Seller ID: {status.sellingPartnerId}</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>日時: {status.linkedAt ? new Date(status.linkedAt).toLocaleString() : 'N/A'}</Typography>
          <Button 
            variant="outlined" 
            color="secondary" 
            onClick={() => handleDisconnectAmazon(mktId)} 
            disabled={loading} 
            size="small"
          >
            連携解除
          </Button>
        </>
      ) : (
        <>
          <Alert severity="warning" sx={{ mb: 2 }}>未連携</Alert>
          <Button 
            variant="contained" 
            onClick={() => handleLinkAmazon(mktId)} 
            disabled={loading}
          >
            {title}と連携する
          </Button>
        </>
      )}
    </Box>
  );

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
            <TextField label="国際送料 FSC率 (例: 0.204)" name="internationalShippingFscRate" type="number" value={settings.internationalShippingFscRate} onChange={handleSettingsChange} fullWidth />
            <TextField label="国際送料 固定加算 (円)" name="internationalShippingFixedFeeJpy" type="number" value={settings.internationalShippingFixedFeeJpy} onChange={handleSettingsChange} fullWidth />
            <TextField label="関税率 (例: 0.05) ※立替手数料2%自動加算" name="customsDutyRate" type="number" value={settings.customsDutyRate} onChange={handleSettingsChange} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              label="為替レート (1ドルあたり円)"
              name="exchangeRateJpyToUsd"
              type="number"
              value={settings.exchangeRateJpyToUsd}
              onChange={handleSettingsChange}
              disabled={settings.autoExchangeRateEnabled}
              sx={{ flex: '1 1 220px' }}
            />
            <TextField
              label="為替自動更新間隔 (分)"
              name="exchangeRateRefreshIntervalMinutes"
              type="number"
              value={settings.exchangeRateRefreshIntervalMinutes}
              onChange={handleSettingsChange}
              disabled={!settings.autoExchangeRateEnabled}
              sx={{ flex: '1 1 180px' }}
            />
            <Box sx={{ flex: '1 1 260px' }}>
              <FormControlLabel
                control={
                  <Switch
                    name="autoExchangeRateEnabled"
                    checked={Boolean(settings.autoExchangeRateEnabled)}
                    onChange={handleSwitchChange}
                  />
                }
                label="為替レートを自動取得"
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  onClick={handleRefreshExchangeRate}
                  disabled={refreshingExchangeRate}
                  size="small"
                >
                  {refreshingExchangeRate ? <CircularProgress size={18} /> : '今すぐ取得'}
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {settings.exchangeRateUpdatedAt
                    ? `${settings.exchangeRateSource || 'API'} ${settings.exchangeRateDate || ''} / ${new Date(settings.exchangeRateUpdatedAt).toLocaleString()}`
                    : '未取得'}
                </Typography>
              </Box>
            </Box>
            <TextField label="在庫取下閾値 (出品者数)" name="inventoryThreshold" type="number" value={settings.inventoryThreshold} onChange={handleSettingsChange} fullWidth />
            <TextField label="リードタイムバッファ (n値)" name="leadTimeBuffer" type="number" value={settings.leadTimeBuffer} onChange={handleSettingsChange} fullWidth />
            <TextField label="Keepaセラー検索上限 (ASIN件数)" name="keepaSellerAsinLimit" type="number" value={settings.keepaSellerAsinLimit} onChange={handleSettingsChange} fullWidth />
          </Box>
          
          <Box sx={{ p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
             <TextField label="Amazon手数料率 (例: 0.15)" name="amazonFeeRate" type="number" value={settings.amazonFeeRate} onChange={handleSettingsChange} fullWidth />
          </Box>

          <ShippingCostTiersTable tiers={settings.shippingCostTiers || []} onTiersChange={handleShippingTiersChange} />
          
          <TextField label="除外ASIN (カンマ区切り)" name="excludedAsins" value={settings.excludedAsins?.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />
          <TextField label="除外ブランド (カンマ区切り)" name="excludedBrands" value={settings.excludedBrands?.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />
          <TextField label="除外キーワード (カンマ区切り)" name="excludedKeywords" value={settings.excludedKeywords?.join(', ')} onChange={handleArraySettingsChange} fullWidth multiline rows={2} />

          <ProfitabilityTiersTable tiers={settings.profitabilityTiers || []} onTiersChange={handleProfitabilityTiersChange} />

          <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {renderAuthSection("米国Amazonアカウント", US_MARKETPLACE_ID, authStatus.us)}
            {renderAuthSection("日本Amazonアカウント", JP_MARKETPLACE_ID, authStatus.jp)}
          </Box>
          
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={handleSaveSettings} disabled={loading}>設定を保存</Button>
          </Box>
          {savedMessage && <Alert severity="success" sx={{ mt: 2 }}>{savedMessage}</Alert>}
        </Box>
      )}
    </>
  );
};

export default SettingsTab;
