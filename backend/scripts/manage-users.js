const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const userManager = require('../src/services/user-manager');
const { initDatabase, isDatabaseEnabled } = require('../src/services/database');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('--- 管理者用ユーザー管理ツール ---');
  
  try {
    await initDatabase();
    if (isDatabaseEnabled()) {
        console.log('ストレージ: PostgreSQL');
    } else {
        console.log('ストレージ: ローカルJSONファイル');
    }

    const action = await question('実行する操作を選択してください (1: ユーザー追加, 2: ユーザー一覧, 3: 終了): ');

    if (action === '1') {
      const username = await question('新規ユーザー名: ');
      if (!username.trim()) {
          console.error('ユーザー名は必須です。');
          process.exit(1);
      }
      
      const password = await question('初期パスワード: ');
      if (password.length < 6) {
          console.error('パスワードは6文字以上で入力してください。');
          process.exit(1);
      }

      console.log(`ユーザー '${username}' を作成しています...`);
      try {
        const newUser = await userManager.addUser(username, password);
        console.log('\n✅ ユーザーの作成に成功しました。');
        console.log(`ID: ${newUser.id}`);
        console.log(`ユーザー名: ${newUser.username}`);
        console.log(`パスワード: (入力したパスワードをお客様へお伝えください)`);
      } catch (error) {
        console.error(`\n❌ エラー: ${error.message}`);
      }
    } else if (action === '2') {
        const users = await userManager.getAllUsers();
        console.log('\n--- 登録済みユーザー一覧 ---');
        if (users.length === 0) {
            console.log('ユーザーはまだ登録されていません。');
        } else {
            users.forEach((u, index) => {
                console.log(`${index + 1}. [${u.id}] ${u.username}`);
            });
        }
        console.log('----------------------------');
    } else {
      console.log('終了します。');
    }

  } catch (error) {
    console.error('予期せぬエラーが発生しました:', error);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();