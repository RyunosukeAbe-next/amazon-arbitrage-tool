import React, { useState } from 'react';
import {
  Typography, TextField, Button, Box
} from '@mui/material';

interface SellerIdSearchTabProps {
  onAddToQueue: (name: string, params: any) => void;
}

const SellerIdSearchTab: React.FC<SellerIdSearchTabProps> = ({ onAddToQueue }) => {
  const [sellerId, setSellerId] = useState('');

  const handleSearch = () => {
    const params = { searchType: 'seller', query: sellerId };
    const jobName = `セラーID: ${sellerId}`;
    onAddToQueue(jobName, params);
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
          <Button variant="contained" onClick={handleSearch} disabled={!sellerId}>
            検索実行
          </Button>
        </Box>
      </Box>
    </>
  );
};

export default SellerIdSearchTab;

