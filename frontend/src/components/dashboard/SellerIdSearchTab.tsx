import React, { useState } from 'react';
import {
  Typography, TextField, Button, Box, MenuItem, FormControl, InputLabel, Select, Alert
} from '@mui/material';

interface SellerIdSearchTabProps {
  onAddToQueue: (name: string, params: any) => void;
}

const SellerIdSearchTab: React.FC<SellerIdSearchTabProps> = ({ onAddToQueue }) => {
  const [sellerId, setSellerId] = useState('');
  const [limit, setLimit] = useState(1000);

  const handleSearch = () => {
    if (!sellerId.trim()) return;
    
    const params = { 
        searchType: 'seller', 
        query: sellerId.trim(),
        limit: limit 
    };
    const jobName = `収穫(セラーID): ${sellerId} (上限:${limit}件)`;
    onAddToQueue(jobName, params);
  };

  return (
    <>
      <Typography variant="h5" gutterBottom>ASINハーベスター (セラーID収穫)</Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        特定のセラーが出品している商品（ASIN）を一括で収穫し、利益計算を行います。
        成功している日本人セラーのIDを入力することで、効率的に利益商品を見つけることができます。
      </Alert>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 600 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
                label="AmazonセラーID (Merchant ID)"
                placeholder="例: AXXXXXXXXXXXXX"
                fullWidth
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
            />
            
            <FormControl sx={{ minWidth: 150 }}>
                <InputLabel>収穫件数上限</InputLabel>
                <Select
                    value={limit}
                    label="収穫件数上限"
                    onChange={(e) => setLimit(Number(e.target.value))}
                >
                    <MenuItem value={100}>100件</MenuItem>
                    <MenuItem value={500}>500件</MenuItem>
                    <MenuItem value={1000}>1,000件</MenuItem>
                    <MenuItem value={3000}>3,000件</MenuItem>
                    <MenuItem value={5000}>5,000件</MenuItem>
                    <MenuItem value={10000}>10,000件</MenuItem>
                </Select>
            </FormControl>
        </Box>

        <Box>
          <Button 
            variant="contained" 
            size="large"
            onClick={handleSearch} 
            disabled={!sellerId.trim()}
            fullWidth
          >
            収穫（リサーチジョブ）を開始
          </Button>
        </Box>
      </Box>
    </>
  );
};

export default SellerIdSearchTab;

