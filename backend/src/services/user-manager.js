const path = require('path');
const bcrypt = require('bcrypt');
const { readJsonFile, updateJsonFile, writeJsonFileAtomic } = require('./json-file-store');
const { isDatabaseEnabled, query } = require('./database');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const USERS_FILE = path.join(CONFIG_DIR, 'users.json');

/**
 * ユーザーリストをファイルから読み込む
 * @returns {Promise<object[]>}
 */
async function loadUsers() {
  if (isDatabaseEnabled()) {
    const result = await query(
      'SELECT id, username, password_hash AS password FROM app_users ORDER BY created_at ASC'
    );
    return result.rows;
  }

  return readJsonFile(USERS_FILE, []);
}

/**
 * ユーザーリストをファイルに保存する
 * @param {object[]} users 
 */
async function saveUsers(users) {
  if (isDatabaseEnabled()) {
    for (const user of users) {
      await query(
        `INSERT INTO app_users (id, username, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash`,
        [user.id, user.username, user.password]
      );
    }
    return;
  }

  await writeJsonFileAtomic(USERS_FILE, users);
}

/**
 * 全てのユーザー情報を取得する（パスワード抜き）
 * @returns {Promise<object[]>}
 */
async function getAllUsers() {
    const users = await loadUsers();
    return users.map(user => {
        const { password, ...userToReturn } = user;
        return userToReturn;
    });
}

/**
 * ユーザー名でユーザーを検索する
 * @param {string} username 
 * @returns {Promise<object|undefined>}
 */
async function findUserByUsername(username) {
  if (isDatabaseEnabled()) {
    const result = await query(
      'SELECT id, username, password_hash AS password FROM app_users WHERE username = $1 LIMIT 1',
      [username]
    );
    return result.rows[0];
  }

  const users = await loadUsers();
  return users.find(user => user.username === username);
}

/**
 * 新規ユーザーを追加する
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<object>}
 */
async function addUser(username, password) {
  // パスワードをハッシュ化
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  let newUser;

  if (isDatabaseEnabled()) {
    newUser = {
      id: `user_${Date.now()}`,
      username,
      password: hashedPassword,
    };

    try {
      await query(
        'INSERT INTO app_users (id, username, password_hash) VALUES ($1, $2, $3)',
        [newUser.id, newUser.username, newUser.password]
      );
    } catch (error) {
      if (error.code === '23505') {
        throw new Error('このユーザー名は既に使用されています。');
      }
      throw error;
    }

    const { password: _, ...userToReturn } = newUser;
    return userToReturn;
  }

  await updateJsonFile(USERS_FILE, [], users => {
    const existingUser = users.find(user => user.username === username);
    if (existingUser) {
      throw new Error('このユーザー名は既に使用されています。');
    }

    newUser = {
      id: `user_${Date.now()}`, // シンプルなユニークID
      username,
      password: hashedPassword,
    };

    return [...users, newUser];
  });

  // パスワードは返さない
  const { password: _, ...userToReturn } = newUser;
  return userToReturn;
}

/**
 * パスワードを検証する
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<object|null>}
 */
async function verifyUser(username, password) {
    const user = await findUserByUsername(username);
    if (user && await bcrypt.compare(password, user.password)) {
        const { password: _, ...userToReturn } = user;
        return userToReturn;
    }
    return null;
}

module.exports = {
  getAllUsers,
  findUserByUsername,
  addUser,
  verifyUser,
};
