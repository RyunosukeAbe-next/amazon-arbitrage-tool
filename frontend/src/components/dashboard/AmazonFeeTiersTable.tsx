import React from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Button, IconButton, Box, Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { AmazonFeeTier } from '../../types';

interface AmazonFeeTiersTableProps {
  tiers: AmazonFeeTier[];
  onTiersChange: (tiers: AmazonFeeTier[]) => void;
}

const AmazonFeeTiersTable: React.FC<AmazonFeeTiersTableProps> = ({ tiers, onTiersChange }) => {

  const handleTierChange = (index: number, field: keyof AmazonFeeTier, value: string | number) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    onTiersChange(newTiers);
  };

  const addTier = () => {
    onTiersChange([
      ...tiers,
      { category: '', rate: 0.15 }
    ]);
  };

  const removeTier = (index: number) => {
    // Prevent deleting the default tier
    if (tiers[index].category === 'DEFAULT') {
      alert('DEFAULTカテゴリは削除できません。');
      return;
    }
    const newTiers = tiers.filter((_, i) => i !== index);
    onTiersChange(newTiers);
  };

  return (
    <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
      <Typography variant="h6" gutterBottom>カテゴリ別 Amazon手数料設定</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>カテゴリ名</TableCell>
              <TableCell>手数料率 (例: 0.15)</TableCell>
              <TableCell align="right">アクション</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tiers && tiers.map((tier, index) => (
              <TableRow key={index}>
                <TableCell>
                  <TextField
                    value={tier.category}
                    onChange={(e) => handleTierChange(index, 'category', e.target.value)}
                    size="small"
                    variant="outlined"
                    disabled={tier.category === 'DEFAULT'}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={tier.rate}
                    onChange={(e) => handleTierChange(index, 'rate', parseFloat(e.target.value) || 0)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">
                  {tier.category !== 'DEFAULT' && (
                    <IconButton onClick={() => removeTier(index)} color="secondary">
                      <DeleteIcon />
                    </IconButton>
                  )}
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
        手数料ルールを追加
      </Button>
    </Box>
  );
};

export default AmazonFeeTiersTable;
