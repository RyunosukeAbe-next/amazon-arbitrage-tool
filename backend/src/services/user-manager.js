const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcrypt');

const USERS_FILE = path.resolve(__dirname, '../../config/users.json');

/**
 * ユーザーリストをファイルから読み込む
 * @returns {Promise<object[]>}
 */
async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // ファイルがなければ空配列
    }
    throw error;
  }
}

/**
 * ユーザーリストをファイルに保存する
 * @param {object[]} users 
 */
async function saveUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
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
  const users = await loadUsers();
  const existingUser = users.find(user => user.username === username);
  if (existingUser) {
    throw new Error('このユーザー名は既に使用されています。');
  }

  // パスワードをハッシュ化
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const newUser = {
    id: `user_${Date.now()}`, // シンプルなユニークID
    username,
    password: hashedPassword,
  };

  users.push(newUser);
  await saveUsers(users);

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
