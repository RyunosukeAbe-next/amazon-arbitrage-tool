import React, { useState, useEffect } from 'react';
import {
  Typography, Box, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Button, Chip, CircularProgress, 
  TextField, InputAdornment, IconButton, Tooltip, Alert, Pagination
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import api from '../../services/api';

interface HarvestedProduct {
    asin: string;
    productName: string;
    brand: string;
    category: string;
    usPrice: number;
    jpPrice: number;
    profitJpy: number;
    profitRate: number;
    weightKg: number;
    isExcluded: boolean;
    exclusionReason?: string;
    lastHarvestedAt: string;
}

const HarvestedLibraryTab: React.FC = () => {
    const [products, setProducts] = useState<HarvestedProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedAsins, setSelectedAsins] = useState<Set<string>>(new Set());
    const [bulkListingLoading, setBulkListingLoading] = useState(false);

    const fetchLibrary = async () => {
        setLoading(true);
        setError('');
        try {
            // ライブラリ取得API（後ほどバックエンドに追加）
            const response = await api.get('/harvested-products', {
                params: {
                    page,
                    search,
                    minProfitRate: 15, // デフォルトで15%以上のものだけ表示
                }
            });
            setProducts(response.data.items);
            setTotalPages(response.data.totalPages);
        } catch (err: any) {
            setError('ライブラリの取得に失敗しました。まだ収穫データがないか、サーバーエラーです。');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLibrary();
    }, [page]);

    const handleBulkListing = async () => {
        if (selectedAsins.size === 0) return;
        setBulkListingLoading(true);
        try {
            await api.post('/bulk-listing-from-asins', {
                asins: Array.from(selectedAsins),
                title: `ライブラリから一括出品 (${new Date().toLocaleDateString()})`
            });
            alert(`${selectedAsins.size}件の出品処理を開始しました。「出品ログ」タブで進捗を確認してください。`);
            setSelectedAsins(new Set());
        } catch (err) {
            alert('一括出品の開始に失敗しました。');
        } finally {
            setBulkListingLoading(false);
        }
    };

    const toggleSelect = (asin: string) => {
        const newSelected = new Set(selectedAsins);
        if (newSelected.has(asin)) newSelected.delete(asin);
        else newSelected.add(asin);
        setSelectedAsins(newSelected);
    };

    const selectAllVisible = () => {
        const newSelected = new Set(selectedAsins);
        products.forEach(p => {
            if (!p.isExcluded) newSelected.add(p.asin);
        });
        setSelectedAsins(newSelected);
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">商品ライブラリ (収穫済み)</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button 
                        variant="contained" 
                        startIcon={bulkListingLoading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                        disabled={selectedAsins.size === 0 || bulkListingLoading}
                        onClick={handleBulkListing}
                    >
                        選択中の {selectedAsins.size} 件を一括出品
                    </Button>
                    <Button variant="outlined" onClick={fetchLibrary}>更新</Button>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <TextField
                    label="ASIN・商品名・ブランドで検索"
                    variant="outlined"
                    size="small"
                    fullWidth
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                    onKeyPress={(e) => e.key === 'Enter' && fetchLibrary()}
                />
                <Button variant="contained" onClick={fetchLibrary} startIcon={<SearchIcon />}>
                    検索
                </Button>
            </Box>

            {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Button size="small" onClick={selectAllVisible}>全選択</Button>
                            </TableCell>
                            <TableCell>ASIN</TableCell>
                            <TableCell>商品名</TableCell>
                            <TableCell align="right">利益率</TableCell>
                            <TableCell align="right">利益(円)</TableCell>
                            <TableCell align="right">米国価格</TableCell>
                            <TableCell align="right">重量(kg)</TableCell>
                            <TableCell>状態</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={8} align="center"><CircularProgress sx={{ m: 2 }} /></TableCell></TableRow>
                        ) : products.map((product) => (
                            <TableRow 
                                key={product.asin} 
                                hover 
                                selected={selectedAsins.has(product.asin)}
                                onClick={() => !product.isExcluded && toggleSelect(product.asin)}
                                sx={{ cursor: product.isExcluded ? 'default' : 'pointer' }}
                            >
                                <TableCell padding="checkbox">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedAsins.has(product.asin)} 
                                        disabled={product.isExcluded}
                                        readOnly 
                                    />
                                </TableCell>
                                <TableCell>{product.asin}</TableCell>
                                <TableCell>
                                    <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                                        {product.productName}
                                    </Typography>
                                    <Typography variant="caption" color="textSecondary">{product.brand}</Typography>
                                </TableCell>
                                <TableCell align="right">
                                    <Typography color={product.profitRate > 20 ? 'success.main' : 'inherit'} sx={{ fontWeight: 'bold' }}>
                                        {product.profitRate.toFixed(1)}%
                                    </Typography>
                                </TableCell>
                                <TableCell align="right">{Math.floor(product.profitJpy).toLocaleString()}円</TableCell>
                                <TableCell align="right">${product.usPrice}</TableCell>
                                <TableCell align="right">{product.weightKg || '-'}</TableCell>
                                <TableCell>
                                    {product.isExcluded ? (
                                        <Tooltip title={product.exclusionReason}>
                                            <Chip label="除外対象" size="small" color="error" variant="outlined" />
                                        </Tooltip>
                                    ) : (
                                        <Chip label="出品可能" size="small" color="success" />
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination 
                    count={totalPages} 
                    page={page} 
                    onChange={(_, v) => setPage(v)} 
                    color="primary" 
                />
            </Box>
        </Box>
    );
};

export default HarvestedLibraryTab;
