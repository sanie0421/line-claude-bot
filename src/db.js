const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'chat.db');
const db = new Database(dbPath);

// WALモードで高速化
db.pragma('journal_mode = WAL');

// テーブル作成
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    character TEXT DEFAULT 'normal'
  )
`);

// 既存テーブルにcharacterカラムがない場合追加
try {
  db.exec(`ALTER TABLE user_settings ADD COLUMN character TEXT DEFAULT 'normal'`);
} catch {
  // カラムが既にある場合は無視
}

const insertMessage = db.prepare(
  'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)'
);

const getHistory = db.prepare(
  'SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?'
);

const deleteHistory = db.prepare(
  'DELETE FROM messages WHERE user_id = ?'
);

const getModel = db.prepare(
  'SELECT model FROM user_settings WHERE user_id = ?'
);

const upsertModel = db.prepare(`
  INSERT INTO user_settings (user_id, model) VALUES (?, ?)
  ON CONFLICT(user_id) DO UPDATE SET model = excluded.model
`);

const getCharacter = db.prepare(
  'SELECT character FROM user_settings WHERE user_id = ?'
);

const upsertCharacter = db.prepare(`
  INSERT INTO user_settings (user_id, model, character) VALUES (?, 'claude-sonnet-4-20250514', ?)
  ON CONFLICT(user_id) DO UPDATE SET character = excluded.character
`);

module.exports = {
  saveMessage(userId, role, content) {
    insertMessage.run(userId, role, content);
  },

  getMessages(userId, limit) {
    // 降順で取得して逆転 → 古い順にする
    const rows = getHistory.all(userId, limit);
    return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
  },

  clearHistory(userId) {
    deleteHistory.run(userId);
  },

  getModel(userId) {
    const row = getModel.get(userId);
    return row ? row.model : 'claude-sonnet-4-20250514';
  },

  setModel(userId, model) {
    upsertModel.run(userId, model);
  },

  getCharacter(userId) {
    const row = getCharacter.get(userId);
    return row ? row.character || 'normal' : 'normal';
  },

  setCharacter(userId, character) {
    upsertCharacter.run(userId, character);
  },
};
