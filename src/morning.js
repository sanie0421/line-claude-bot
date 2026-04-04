const cron = require('node-cron');
const config = require('./config');
const { client } = require('./line');
const calendar = require('./calendar');

// ゴミ出しスケジュール判定
function getGarbageInfo() {
  const now = new Date();
  const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const dayOfWeek = jst.getDay(); // 0=日, 1=月, ...
  const date = jst.getDate();
  const month = jst.getMonth();
  const year = jst.getFullYear();

  // 第N週判定: その月の同じ曜日が何回目か
  const firstOfMonth = new Date(year, month, 1);
  let count = 0;
  for (let d = 1; d <= date; d++) {
    const tmp = new Date(year, month, d);
    if (tmp.getDay() === dayOfWeek) count++;
  }
  const weekNum = count; // 第N

  const items = [];

  switch (dayOfWeek) {
    case 1: // 月曜
      items.push('🔥 燃やすゴミ');
      if (weekNum === 2) items.push('🧱 不燃ごみ');
      break;
    case 2: // 火曜
      items.push('♻️ プラゴミ');
      break;
    case 3: // 水曜
      if (weekNum === 2 || weekNum === 4) items.push('📰 古紙・布・ペットボトル');
      break;
    case 4: // 木曜
      items.push('🔥 燃やすゴミ');
      if (weekNum === 3) items.push('☠️ 有害ごみ');
      break;
    case 5: // 金曜
      if (weekNum === 1 || weekNum === 3) items.push('🫙 ビン');
      if (weekNum === 2 || weekNum === 4) items.push('🥫 カン');
      // 第5金曜はビン収集なし（上の条件で自然に除外）
      break;
  }

  if (items.length === 0) return '今日はゴミ収集なし';
  return items.join('\n');
}

// 朝の通知を開始
function startMorningNotification() {
  const pushUserId = config.line.pushUserId;
  if (!pushUserId) {
    console.log('Morning notification: LINE_PUSH_USER_ID not set, skipping');
    return;
  }

  // 毎朝7:00 JST（UTC 22:00前日）
  cron.schedule('0 7 * * *', async () => {
    try {
      const parts = [];

      // ゴミ出し
      parts.push(`🗑️ ゴミ出し\n${getGarbageInfo()}`);

      // Googleカレンダー
      if (calendar.isEnabled()) {
        try {
          const events = await calendar.getTodayEvents();
          parts.push(`📅 今日の予定\n${events}`);
        } catch (err) {
          console.error('Morning calendar error:', err.message);
        }
      }

      const message = `☀️ おはよう！今日の情報だよ\n\n${parts.join('\n\n')}`;

      await client.pushMessage({
        to: pushUserId,
        messages: [{ type: 'text', text: message }],
      });

      console.log('Morning notification sent');
    } catch (err) {
      console.error('Morning notification error:', err);
    }
  }, {
    timezone: 'Asia/Tokyo',
  });

  console.log('Morning notification scheduled (7:00 JST)');
}

module.exports = { startMorningNotification, getGarbageInfo };
