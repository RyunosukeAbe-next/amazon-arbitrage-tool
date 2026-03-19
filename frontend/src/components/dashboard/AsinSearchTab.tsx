import React, { useState } from 'react';
import {
  Typography, TextField, Button, Box
} from '@mui/material';

interface AsinSearchTabProps {
  onAddToQueue: (name: string, params: any) => void;
}

const AsinSearchTab: React.FC<AsinSearchTabProps> = ({ onAddToQueue }) => {
  const [asins, setAsins] = useState('');

  const handleSearch = () => {
    const asinList = asins.split(/[\s,]+/).filter(a => a.trim() !== '');
    if (asinList.length === 0) {
      alert('有効なASINが入力されていません。');
      return;
    }

    const params = {
      searchType: 'asin',
      query: asinList,
    };
    
    const jobName = `ASIN: ${asinList.slice(0, 3).join(', ')}${asinList.length > 3 ? '...' : ''}`;
    
    // paramsSerializerはAPI呼び出し時に使われるため、DashboardPageのrunSearchJobに渡す必要がある
    // ここではparamsの一部として渡す
    const fullParams = {
        ...params,
        paramsSerializer: (p: any) => {
            const searchParams = new URLSearchParams();
            for (const key in p) {
                const value = p[key];
                if (Array.isArray(value)) {
                    for (const item of value) {
                        searchParams.append(key, item);
                    }
                } else if (key !== 'paramsSerializer') { // paramsSerializer自体は含めない
                    searchParams.set(key, value);
                }
            }
            return searchParams.toString();
        }
    };
    
    onAddToQueue(jobName, fullParams);
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
            disabled={!asins}
            sx={{ height: '100%', minHeight: '56px' }}
          >
            検索実行
          </Button>
        </Box>
      </Box>
    </>
  );
};

export default AsinSearchTab;
