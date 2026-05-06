import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom'; // 追加
import {
  Container, Typography, Box, Tabs, Tab, AppBar, Toolbar, Button,
  TableContainer, Paper
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

// タブコンポーネントをインポート
import KeywordSearchTab from '../components/dashboard/KeywordSearchTab';
import SellerIdSearchTab from '../components/dashboard/SellerIdSearchTab';
import AsinSearchTab from '../components/dashboard/AsinSearchTab';
import ResearchLogsTab from '../components/dashboard/ResearchLogsTab';
import ListingLogsTab from '../components/dashboard/ListingLogsTab'; // ★ 追加
import BulkListingTab from '../components/dashboard/BulkListingTab';
import SettingsTab from '../components/dashboard/SettingsTab';

const SEARCH_QUEUE_STORAGE_KEY = 'activeSearchQueue';

// 型定義
export interface ProductResult {
  asin: string;
  itemName: string;
  usPrice: number;
  jpPrice: number;
  usSellerCount: number;
}

export type SearchJobStatus = 'waiting' | 'fetching' | 'completed' | 'error' | 'cancelled';

export interface SearchJob {
  id: string;
  name: string;
  params: any;
  status: SearchJobStatus;
  message?: string;
  results?: ProductResult[];
  abortController?: AbortController;
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
  const [searchParams] = useSearchParams(); // 追加
  const initialTab = searchParams.get('tab') === 'settings' ? 6 : 0; // 追加

  const [currentTab, setCurrentTab] = useState(initialTab); // 変更
  const [searchQueue, setSearchQueue] = useState<SearchJob[]>(() => {
    try {
      const storedQueue = localStorage.getItem(SEARCH_QUEUE_STORAGE_KEY);
      if (!storedQueue) return [];
      const parsedQueue = JSON.parse(storedQueue);
      if (!Array.isArray(parsedQueue)) return [];
      return parsedQueue.map((job: SearchJob) => ({
        ...job,
        status: job.status === 'fetching' ? 'fetching' : 'waiting',
      }));
    } catch (error) {
      console.error('Failed to load active search queue', error);
      return [];
    }
  });
  const [completedSearchResults, setCompletedSearchResults] = useState<ProductResult[]>([]);
  
  // searchQueueの最新の状態をrefで保持（useEffectのクロージャ問題を回避するため）
  const queueRef = useRef(searchQueue);
  useEffect(() => {
    queueRef.current = searchQueue;
  }, [searchQueue]);

  useEffect(() => {
    const queueToStore = searchQueue.map(({ abortController, ...job }) => job);
    localStorage.setItem(SEARCH_QUEUE_STORAGE_KEY, JSON.stringify(queueToStore));
  }, [searchQueue]);

  // キュープロセッサー
  useEffect(() => {
    const isFetching = searchQueue.some(job => job.status === 'fetching');
    if (isFetching) return;

    const nextJob = searchQueue.find(job => job.status === 'waiting');
    if (nextJob) {
      runSearchJob(nextJob.id);
    }
  }, [searchQueue]);

  const runSearchJob = async (jobId: string) => {
    const controller = new AbortController();
    setSearchQueue(prev => prev.map(job => 
      job.id === jobId 
        ? { ...job, status: 'fetching', abortController: controller } 
        : job
    ));
    
    // staleなstateを避けるため、更新前のキューから実行対象のジョブ情報を取得
    const jobToRun = queueRef.current.find(job => job.id === jobId);
    if (!jobToRun) return;

    try {
      const { paramsSerializer, ...params } = jobToRun.params;
      const config = {
        params,
        signal: controller.signal,
        ...(paramsSerializer && { paramsSerializer })
      };
      const response = await api.get('/search', config);
      
      // 完了したジョブをキューから削除
      setSearchQueue(prev => prev.filter(j => j.id !== jobId));
      setCompletedSearchResults(response.data.products || []);
      
    } catch (err: any) {
      // キャンセルされた場合はエラーとして扱わない
      if (err.name === 'CanceledError') {
        console.log(`Job ${jobId} was cancelled.`);
        return; // handleCancelJobでキューから削除されるので、ここでは何もしない
      }
      
      const errorMessage = err.response?.data?.error || 'リサーチ中にエラーが発生しました。';
      setSearchQueue(prev => prev.map(job =>
        job.id === jobId
          ? { ...job, status: 'error', message: errorMessage }
          : job
      ));
    }
  };

  const handleAddToQueue = (name: string, params: any) => {
    const newJob: SearchJob = {
      id: `${new Date().toISOString()}-${Math.random()}`,
      name,
      params,
      status: 'waiting',
    };
    setSearchQueue(prev => [...prev, newJob]);
    setCurrentTab(3);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };
  
  const handleCancelJob = (jobId: string) => {
    const jobToCancel = queueRef.current.find(job => job.id === jobId);

    if (jobToCancel) {
      if (jobToCancel.status === 'fetching' && jobToCancel.abortController) {
        jobToCancel.abortController.abort();
      }
      setSearchQueue(prev => prev.filter(job => job.id !== jobId));
    }
  };

  const handlePruneCompletedJobs = useCallback((logs: any[]) => {
    setSearchQueue(prev => prev.filter(job => {
      const jobStartedAt = new Date(job.id.split('-')[0]).getTime();
      const matchingCompletedLog = logs.some(log => {
        const logCreatedAt = new Date(log.createdAt).getTime();
        return (
          Number.isFinite(jobStartedAt) &&
          logCreatedAt >= jobStartedAt &&
          String(log.query || '') === String(job.params?.query || '')
        );
      });
      return !matchingCompletedLog;
    }));
  }, []);

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
            <Tab label="出品ログ" />
            <Tab label="設定" />
          </Tabs>
        </Box>

        <TabPanel value={currentTab} index={0}>
          <KeywordSearchTab onAddToQueue={handleAddToQueue} />
        </TabPanel>
        <TabPanel value={currentTab} index={1}>
          <SellerIdSearchTab onAddToQueue={handleAddToQueue} />
        </TabPanel>
        <TabPanel value={currentTab} index={2}>
          <AsinSearchTab onAddToQueue={handleAddToQueue} />
        </TabPanel>
        <TabPanel value={currentTab} index={3}>
          <ResearchLogsTab activeJobs={searchQueue} onCancelJob={handleCancelJob} onLogsLoaded={handlePruneCompletedJobs} />
          {completedSearchResults.length > 0 && (
            <Box mt={4}>
              <Typography variant="h5" component="h2" gutterBottom>
                直近の検索結果
              </Typography>
              <TableContainer component={Paper}>
                {/* ... (変更なし) */}
              </TableContainer>
            </Box>
          )}
        </TabPanel>
        <TabPanel value={currentTab} index={4}>
          <BulkListingTab />
        </TabPanel>
        <TabPanel value={currentTab} index={5}>
          <ListingLogsTab />
        </TabPanel>
        <TabPanel value={currentTab} index={6}>
          <SettingsTab />
        </TabPanel>
      </Container>
    </>
  );
};

export default DashboardPage;
