import React from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Button, IconButton, Box, Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { ShippingCostTier } from '../../types';

interface ShippingCostTiersTableProps {
  tiers: ShippingCostTier[];
  onTiersChange: (tiers: ShippingCostTier[]) => void;
}

const ShippingCostTiersTable: React.FC<ShippingCostTiersTableProps> = ({ tiers, onTiersChange }) => {

  const handleTierChange = (index: number, field: keyof ShippingCostTier, value: string) => {
    const newTiers = [...tiers];
    const numericValue = parseInt(value, 10) || 0;
    newTiers[index] = { ...newTiers[index], [field]: numericValue };
    onTiersChange(newTiers);
  };

  const addTier = () => {
    const lastTier = tiers[tiers.length - 1];
    const newFromWeight = lastTier ? lastTier.toWeight + 1 : 0;
    const newToWeight = newFromWeight + 500;

    onTiersChange([
      ...tiers,
      { fromWeight: newFromWeight, toWeight: newToWeight, cost: (lastTier?.cost || 1500) + 500 }
    ]);
  };

  const removeTier = (index: number) => {
    const newTiers = tiers.filter((_, i) => i !== index);
    onTiersChange(newTiers);
  };

  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
      <Typography variant="h6" gutterBottom>重量別 国際送料 基本運賃設定</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>重量 (From g)</TableCell>
              <TableCell>重量 (To g)</TableCell>
              <TableCell>基本運賃 (円・FSC前)</TableCell>
              <TableCell align="right">アクション</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tiers && tiers.map((tier, index) => (
              <TableRow key={index}>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.fromWeight}
                    onChange={(e) => handleTierChange(index, 'fromWeight', e.target.value)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.toWeight}
                    onChange={(e) => handleTierChange(index, 'toWeight', e.target.value)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.cost}
                    onChange={(e) => handleTierChange(index, 'cost', e.target.value)}
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
        送料ルールを追加
      </Button>
    </Box>
  );
};

export default ShippingCostTiersTable;
