import React from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Button, IconButton, Box, Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { ProfitabilityTier } from '../../types';

interface ProfitabilityTiersTableProps {
  tiers: ProfitabilityTier[];
  onTiersChange: (tiers: ProfitabilityTier[]) => void;
}

const ProfitabilityTiersTable: React.FC<ProfitabilityTiersTableProps> = ({ tiers, onTiersChange }) => {

  const handleTierChange = (index: number, field: keyof ProfitabilityTier, value: string) => {
    const newTiers = [...tiers];
    const numericValue = parseFloat(value) || 0;
    newTiers[index] = { ...newTiers[index], [field]: numericValue };
    onTiersChange(newTiers);
  };

  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newFromPrice = lastTier ? lastTier.toPrice + 1 : 0;
    const newToPrice = newFromPrice + 1000;
    
    onTiersChange([
      ...tiers,
      { fromPrice: newFromPrice, toPrice: newToPrice, minProfitRate: 10, minProfitAmount: 1000 }
    ]);
  };

  const removeTier = (index: number) => {
    const newTiers = tiers.filter((_, i) => i !== index);
    onTiersChange(newTiers);
  };

  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
      <Typography variant="h6" gutterBottom>価格帯別 利益ルール設定</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>販売価格 (From)</TableCell>
              <TableCell>販売価格 (To)</TableCell>
              <TableCell>最低利益率 (%)</TableCell>
              <TableCell>最低利益額 (円)</TableCell>
              <TableCell align="right">アクション</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tiers && tiers.map((tier, index) => (
              <TableRow key={index}>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.fromPrice}
                    onChange={(e) => handleTierChange(index, 'fromPrice', e.target.value)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.toPrice}
                    onChange={(e) => handleTierChange(index, 'toPrice', e.target.value)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.minProfitRate}
                    onChange={(e) => handleTierChange(index, 'minProfitRate', e.target.value)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.minProfitAmount}
                    onChange={(e) => handleTierChange(index, 'minProfitAmount', e.target.value)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => removeTier(index)} color="secondary">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Button
        startIcon={<AddIcon />}
        onClick={addTier}
        variant="outlined"
        sx={{ mt: 2 }}
      >
        ルールを追加
      </Button>
    </Box>
  );
};

export default ProfitabilityTiersTable;
