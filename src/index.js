const express = require('express');
const line = require('@line/bot-sdk');
const config = require('./config');
const db = require('./db');
const claude = require('./claude');
const { replyText, replyCharacterSelect, getImageAsBase64, getAudioAsBase64 } = require('./line');
const notion = require('./notion');
const { getCharacterKey, getCharacterName } = require('./characters');
const calendar = require('./calendar');
const urlSummary = require('./url-summary');
const { startMorningNotification } = require('./morning');

const app = express();

// モデルマッピング
const MODEL_MAP = {
  '#sonnet': { id: 'claude-sonnet-4-20250514', name: 'Sonnet' },
  '#opus': { id: 'claude-opus-4-20250514', name: 'Opus' },
  '#haiku': { id: 'claude-haiku-4-5-20251001', name: 'Haiku' },
};

// LINE署名検証ミドルウェア
const lineMiddleware = line.middleware({
  channelSecret: config.line.channelSecret,
});

// Webhook エンドポイント
app.post('/webhook', lineMiddleware, (req, res) => {
  // 先に200を返す（タイムアウト対策）
  res.sendStatus(200);

  // イベント処理は非同期で
  Promise.all(req.body.events.map(handleEvent)).catch(console.error);
});

// ヘルスチェック
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function handleEvent(event) {
  if (event.type !== 'message') return;

  const msgType = event.message.type;
  if (!['text', 'image', 'audio', 'location'].includes(msgType)) return;

  const userId = event.source.userId;
  const replyToken = event.replyToken;

  try {
    // --- 音声メッセージ ---
    if (msgType === 'audio') {
      const audioBase64 = await getAudioAsBase64(event.message.id);
      const history = db.getMessages(userId, config.chat.historyLimit);
      const model = db.getModel(userId);
      const character = db.getCharacter(userId);

      db.saveMessage(userId, 'user', '[音声メッセージを送信]');

      const reply = await claude.chatWithAudio(audioBase64, history, model, character);

      db.saveMessage(userId, 'assistant', reply);
      await replyText(replyToken, reply);
      return;
    }

    // --- 位置情報メッセージ ---
    if (msgType === 'location') {
      const { title, address, latitude, longitude } = event.message;
      const history = db.getMessages(userId, config.chat.historyLimit);
      const model = db.getModel(userId);
      const character = db.getCharacter(userId);

      const locationText = `📍 位置情報が送信されました\n場所: ${title || '不明'}\n住所: ${address || '不明'}\n緯度: ${latitude}\n経度: ${longitude}`;
      db.saveMessage(userId, 'user', locationText);

      const reply = await claude.chat(
        [...history, { role: 'user', content: locationText + '\nこの場所について教えて。周辺の情報や天気なども分かる範囲で。' }],
        model,
        character
      );

      db.saveMessage(userId, 'assistant', reply);
      await replyText(replyToken, reply);
      return;
    }

    // --- 画像メッセージ ---
    if (msgType === 'image') {
      const base64 = await getImageAsBase64(event.message.id);
      const history = db.getMessages(userId, config.chat.historyLimit);
      const model = db.getModel(userId);
      const character = db.getCharacter(userId);

      // 履歴に「画像を送信」と記録
      db.saveMessage(userId, 'user', '[画像を送信]');

      const reply = await claude.chatWithImage(base64, 'この画像について説明して。', history, model, character);

      db.saveMessage(userId, 'assistant', reply);
      await replyText(replyToken, reply);
      return;
    }

    // --- テキストメッセージ ---
    const text = event.message.text.trim();

    // --- キャラ選択メニュー ---
    const normalizedText = text.replace(/＃/g, '#');
    if (normalizedText === '#キャラ') {
      const currentChar = getCharacterName(db.getCharacter(userId));
      await replyCharacterSelect(replyToken, currentChar);
      return;
    }

    // --- 人格切替 ---
    const charKey = getCharacterKey(text);
    if (charKey !== null) {
      db.setCharacter(userId, charKey);
      const charName = getCharacterName(charKey);
      await replyText(replyToken, `人格を${charName}に切り替えたよ！`);
      return;
    }

    // --- モデル切替 ---
    const modelKey = normalizedText.toLowerCase();
    if (MODEL_MAP[modelKey]) {
      const { id, name } = MODEL_MAP[modelKey];
      db.setModel(userId, id);
      await replyText(replyToken, `モデルを${name}に切り替えたよ！`);
      return;
    }

    // --- 会話リセット ---
    if (['リセット', '忘れて'].includes(text)) {
      db.clearHistory(userId);
      await replyText(replyToken, 'リセットしたよ！');
      return;
    }

    // --- Notion メモ ---
    const memoPatterns = ['メモして', '覚えて', '記録して'];
    const memoMatch = memoPatterns.find((p) => text.startsWith(p));
    if (memoMatch) {
      const memoText = text.slice(memoMatch.length).trim();
      if (!memoText) {
        await replyText(replyToken, 'メモする内容を書いてね！');
        return;
      }
      if (notion.isEnabled()) {
        await notion.saveMemo(memoText);
        await replyText(replyToken, 'Notionにメモしたよ！');
      } else {
        await replyText(replyToken, 'Notion連携がまだ設定されてないよ。.envにNOTION_API_KEYとNOTION_DATABASE_IDを設定してね。');
      }
      return;
    }

    // --- 家計簿 ---
    const expenseMatch = text.match(/^[¥￥]?\s*(\d+)\s+(.+)$/);
    if (expenseMatch && notion.isExpenseEnabled()) {
      const amount = parseInt(expenseMatch[1], 10);
      const desc = expenseMatch[2].trim();
      // カテゴリ自動分類
      const category = classifyExpense(desc);
      await notion.addExpense(amount, desc, category);
      await replyText(replyToken, `💰 ${desc}（${category}）¥${amount.toLocaleString()} を記録したよ！`);
      return;
    }

    if (/今月(の支出|いくら|の家計)/.test(text) && notion.isExpenseEnabled()) {
      const data = await notion.getMonthlyExpenses();
      if (data) {
        let msg = `💰 今月の支出: ¥${data.total.toLocaleString()}（${data.count}件）\n`;
        for (const [cat, amt] of Object.entries(data.byCategory)) {
          msg += `  ${cat}: ¥${amt.toLocaleString()}\n`;
        }
        await replyText(replyToken, msg.trim());
      } else {
        await replyText(replyToken, '家計簿データを取得できなかったよ');
      }
      return;
    }

    // --- 買い物リスト ---
    if (/買い物リスト|買い物一覧/.test(text) && notion.isShoppingEnabled()) {
      const items = await notion.getShoppingList();
      if (items && items.length > 0) {
        await replyText(replyToken, `🛒 買い物リスト:\n${items.map((i) => `・${i}`).join('\n')}`);
      } else {
        await replyText(replyToken, '🛒 買い物リストは空だよ！');
      }
      return;
    }

    const shoppingMatch = text.match(/^(.+)(買って|追加して|買い物)/);
    if (shoppingMatch && notion.isShoppingEnabled() && !text.includes('リスト')) {
      const item = shoppingMatch[1].trim();
      await notion.addShoppingItem(item);
      await replyText(replyToken, `🛒 「${item}」を買い物リストに追加したよ！`);
      return;
    }

    // --- タスク ---
    if (/タスク一覧|TODO一覧|やること一覧/.test(text) && notion.isTaskEnabled()) {
      const tasks = await notion.getOpenTasks();
      if (tasks && tasks.length > 0) {
        await replyText(replyToken, `✅ タスク一覧:\n${tasks.map((t) => `・${t}`).join('\n')}`);
      } else {
        await replyText(replyToken, '✅ 未完了のタスクはないよ！');
      }
      return;
    }

    const taskMatch = text.match(/^(タスク|TODO|やること)[：:]?\s*(.+)/i);
    if (taskMatch && notion.isTaskEnabled()) {
      const taskText = taskMatch[2].trim();
      await notion.addTask(taskText);
      await replyText(replyToken, `✅ タスク「${taskText}」を追加したよ！`);
      return;
    }

    // --- URL要約 ---
    const urls = urlSummary.extractUrls(text);
    if (urls.length > 0 && (text.includes('要約') || text.includes('まとめ') || urls.length === text.trim().split(/\s+/).length)) {
      // URLだけ送った場合、または「要約」「まとめ」を含む場合
      const summaries = await Promise.all(urls.slice(0, 3).map((u) => urlSummary.summarizeUrl(u)));
      await replyText(replyToken, summaries.join('\n\n---\n\n'));
      return;
    }

    // --- Googleカレンダー確認 ---
    if (calendar.isEnabled() && /今日の予定|明日の予定|予定(は|を)?[確認教]/.test(text)) {
      let events;
      if (text.includes('明日')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        events = await calendar.getEventsForDate(tomorrow);
      } else {
        events = await calendar.getTodayEvents();
      }
      const label = text.includes('明日') ? '明日' : '今日';
      await replyText(replyToken, `📅 ${label}の予定:\n${events}`);
      return;
    }

    // --- Claude応答 ---
    db.saveMessage(userId, 'user', text);

    const history = db.getMessages(userId, config.chat.historyLimit);
    const model = db.getModel(userId);
    const character = db.getCharacter(userId);

    const reply = await claude.chat(history, model, character);

    db.saveMessage(userId, 'assistant', reply);
    await replyText(replyToken, reply);
  } catch (err) {
    console.error('Error handling event:', err);
    try {
      await replyText(replyToken, 'エラーが発生したよ。もう一度試してみて！');
    } catch {
      // replyTokenが既に使われている場合は無視
    }
  }
}

// 支出カテゴリ自動分類
function classifyExpense(description) {
  const rules = [
    { pattern: /ランチ|昼食|夕食|朝食|外食|レストラン|カフェ|コーヒー|弁当|ラーメン|寿司|居酒屋|飲み/, category: '食費' },
    { pattern: /電車|バス|タクシー|交通|Suica|PASMO|定期/, category: '交通費' },
    { pattern: /スーパー|コンビニ|食材|野菜|肉|魚/, category: '食料品' },
    { pattern: /本|書籍|kindle|雑誌/, category: '書籍' },
    { pattern: /映画|ゲーム|Netflix|サブスク|娯楽/, category: '娯楽' },
    { pattern: /服|靴|ファッション|ユニクロ|GU/, category: '衣服' },
    { pattern: /病院|薬|医療|歯医者/, category: '医療' },
    { pattern: /電気|ガス|水道|家賃|光熱/, category: '固定費' },
  ];

  for (const { pattern, category } of rules) {
    if (pattern.test(description)) return category;
  }
  return 'その他';
}

app.listen(config.server.port, () => {
  console.log(`LINE Claude Bot running on port ${config.server.port}`);
  console.log(`Notion integration: ${notion.isEnabled() ? 'enabled' : 'disabled'}`);
  console.log(`Google Calendar: ${calendar.isEnabled() ? 'enabled' : 'disabled'}`);
  startMorningNotification();
});
