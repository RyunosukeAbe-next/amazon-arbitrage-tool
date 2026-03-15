const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  // 'Authorization' ヘッダーからトークンを取得
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" の形式

  if (token == null) {
    return res.status(401).json({ error: '認証トークンが必要です。' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '無効なトークンです。' }); // トークンが無効または期限切れ
    }

    // リクエストオブジェクトにユーザー情報を添付
    req.user = user;
    next(); // 次のミドルウェアまたはルートハンドラへ
  });
}

module.exports = authenticate;
