import React, { useState } from 'react';
import {
  Typography, TextField, Button, Box, FormControl,
  InputLabel, Select, MenuItem
} from '@mui/material';

// TODO: 共有ファイルに移動する
const amazonCategories = [
  { name: 'おもちゃ＆ゲーム', id: '165793011', sub: [
    { name: 'フィギュア・コレクタードール', id: '2235355011' },
    { name: 'プラモデル・模型', id: '166342011' },
    { name: 'ラジコン・乗り物', id: '166133011' },
  ]},
  { name: 'ホーム＆キッチン', id: '1055398', sub: [
    { name: '調理・製菓道具', id: '289726' },
    { name: '弁当箱・水筒', id: '364821011' },
    { name: '掃除用品', id: '15332101' },
  ]},
  { name: 'エレクトロニクス', id: '172282', sub: [
    { name: 'カメラ・写真', id: '502394' },
    { name: 'ヘッドホン', id: '172541' },
    { name: '携帯電話・アクセサリ', id: '2335752011' },
  ]},
  { name: '本', id: '283155', sub: [
    { name: 'コミック・漫画', id: '4366' },
    { name: '文学・フィクション', id: '17' },
    { name: 'ビジネス・経済', id: '3' },
  ]},
  { name: '服＆ファッション小物', id: '7141123011', sub: [
    { name: 'メンズ', id: '7147441011' },
    { name: 'レディース', id: '7147440011' },
  ]},
  { name: 'ビューティー', id: '3760911', sub: [
    { name: 'スキンケア', id: '11060451' },
    { name: 'ヘアケア', id: '11057241' },
    { name: 'メイクアップ', id: '11058281' },
  ]},
  { name: 'スポーツ＆アウトドア', id: '3375251', sub: [
      { name: 'アウトドア', id: '3375301' },
      { name: 'フィットネス・トレーニング', id: '3407731' },
  ]},
];

interface KeywordSearchTabProps {
  onAddToQueue: (name: string, params: any) => void;
}

const KeywordSearchTab: React.FC<KeywordSearchTabProps> = ({ onAddToQueue }) => {
  const [keyword, setKeyword] = useState('');
  const [majorCategoryId, setMajorCategoryId] = useState('');
  const [minorCategoryId, setMinorCategoryId] = useState('');

  const handleSearch = () => {
    const params: { searchType: string; query: string; classificationId?: string } = {
      searchType: 'keyword',
      query: keyword,
    };
    if (minorCategoryId) {
      params.classificationId = minorCategoryId;
    } else if (majorCategoryId) {
      params.classificationId = majorCategoryId;
    }
    
    const categoryName = amazonCategories.find(c => c.id === majorCategoryId)?.name || '';
    const subCategoryName = amazonCategories.find(c => c.id === majorCategoryId)?.sub.find(sc => sc.id === minorCategoryId)?.name || '';
    const jobName = `キーワード: ${keyword}` + (categoryName ? ` (${categoryName}${subCategoryName ? ' > ' + subCategoryName : ''})` : '');

    onAddToQueue(jobName, params);
  };

  return (
    <>
      <Typography variant="h5" gutterBottom>キーワード検索</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 200px' }}>
            <FormControl fullWidth>
                <InputLabel>大カテゴリ</InputLabel>
                <Select value={majorCategoryId} label="大カテゴリ" onChange={(e) => { setMajorCategoryId(e.target.value); setMinorCategoryId(''); }}>
                    <MenuItem value=""><em>指定なし</em></MenuItem>
                    {amazonCategories.map((cat) => <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>)}
                </Select>
            </FormControl>
        </Box>
        <Box sx={{ flex: '1 1 200px' }}>
            <FormControl fullWidth disabled={!majorCategoryId}>
                <InputLabel>中カテゴリ</InputLabel>
                <Select value={minorCategoryId} label="中カテゴリ" onChange={(e) => setMinorCategoryId(e.target.value)}>
                    <MenuItem value=""><em>指定なし</em></MenuItem>
                    {amazonCategories.find(cat => cat.id === majorCategoryId)?.sub.map(subCat => <MenuItem key={subCat.id} value={subCat.id}>{subCat.name}</MenuItem>)}
                </Select>
            </FormControl>
        </Box>
        <Box sx={{ flex: '2 1 300px' }}>
          <TextField label="キーワード" fullWidth value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </Box>
        <Box>
          <Button variant="contained" onClick={handleSearch} disabled={!keyword}>
            検索実行
          </Button>
        </Box>
      </Box>
    </>
  );
};

export default KeywordSearchTab;
