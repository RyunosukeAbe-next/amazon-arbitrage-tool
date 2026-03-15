import React, { useState } from 'react';
import {
  Container, Typography, Box, Tabs, Tab, AppBar, Toolbar, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';

// タブコンポーネントをインポート
import KeywordSearchTab from '../components/dashboard/KeywordSearchTab';
import SellerIdSearchTab from '../components/dashboard/SellerIdSearchTab';
import AsinSearchTab from '../components/dashboard/AsinSearchTab';
import ResearchLogsTab from '../components/dashboard/ResearchLogsTab';
import BulkListingTab from '../components/dashboard/BulkListingTab';
import SettingsTab from '../components/dashboard/SettingsTab';

// 商品データの型定義 (必要に応じてservices/api.tsなどからインポートすることも検討)
interface ProductResult {
  asin: string;
  itemName: string;
  usPrice: number;
  jpPrice: number;
  usSellerCount: number;
  // 他にも表示したいプロパティがあればここに追加
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} id={`tabpanel-${index}`} {...other}>
      {value === index && (<Box sx={{ p: 3 }}>{children}</Box>)}
    </div>
  );
}

const DashboardPage: React.FC = () => {
  const { logout } = useAuth();
  const [currentTab, setCurrentTab] = useState(0);
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]); // ★ 追加: 検索結果を保持するステート

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  // ★ 変更: 検索結果を受け取り、ステートにセットするように変更
  const handleSearchComplete = (results: ProductResult[] = []) => {
    setSearchResults(results);
    setCurrentTab(3); // Go to logs tab (もしくは検索結果表示用の新しいタブを設けることも検討)
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            日米Amazonアービトラージツール
          </Typography>
          <Button color="inherit" onClick={logout} startIcon={<LogoutIcon />}>
            ログアウト
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={currentTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" aria-label="dashboard tabs">
            <Tab label="キーワード検索" />
            <Tab label="セラーID検索" />
            <Tab label="ASIN検索" />
            <Tab label="リサーチログ" />
            <Tab label="出品管理" />
            <Tab label="設定" />
          </Tabs>
        </Box>

        <TabPanel value={currentTab} index={0}>
          <KeywordSearchTab onSearchComplete={handleSearchComplete} />
        </TabPanel>
        <TabPanel value={currentTab} index={1}>
          <SellerIdSearchTab onSearchComplete={handleSearchComplete} />
        </TabPanel>
        <TabPanel value={currentTab} index={2}>
          <AsinSearchTab onSearchComplete={handleSearchComplete} />
        </TabPanel>
        <TabPanel value={currentTab} index={3}>
          {/* ★ 変更: リサーチログタブ内で検索結果も表示する */}
          <ResearchLogsTab />
          {searchResults.length > 0 && (
            <Box mt={4}>
              <Typography variant="h5" component="h2" gutterBottom>
                検索結果
              </Typography>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>ASIN</TableCell>
                      <TableCell>商品名</TableCell>
                      <TableCell align="right">米国価格</TableCell>
                      <TableCell align="right">日本価格</TableCell>
                      <TableCell align="right">米国セラー数</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {searchResults.map((product) => (
                      <TableRow key={product.asin}>
                        <TableCell component="th" scope="row">
                          {product.asin}
                        </TableCell>
                        <TableCell>{product.itemName}</TableCell>
                        <TableCell align="right">${product.usPrice}</TableCell>
                        <TableCell align="right">¥{product.jpPrice}</TableCell>
                        <TableCell align="right">{product.usSellerCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </TabPanel>
        <TabPanel value={currentTab} index={4}>
          <BulkListingTab />
        </TabPanel>
        <TabPanel value={currentTab} index={5}>
          <SettingsTab />
        </TabPanel>

      </Container>
    </>
  );
};

export default DashboardPage;
