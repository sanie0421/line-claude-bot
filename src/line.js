const line = require('@line/bot-sdk');
const config = require('./config');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.line.channelAccessToken,
});

// LINEから画像データをダウンロードしてBase64に変換
async function getImageAsBase64(messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString('base64');
}

// メインのクイックリプライ（シンプル）
const quickReply = {
  items: [
    { type: 'action', action: { type: 'message', label: '🔄 リセット', text: 'リセット' } },
    { type: 'action', action: { type: 'message', label: '⚡ Haiku', text: '#haiku' } },
    { type: 'action', action: { type: 'message', label: '🟢 Sonnet', text: '#sonnet' } },
    { type: 'action', action: { type: 'message', label: '🟣 Opus', text: '#opus' } },
    { type: 'action', action: { type: 'message', label: '🎭 キャラ', text: '#キャラ' } },
  ],
};

// キャラ選択用のクイックリプライ
const characterQuickReply = {
  items: [
    { type: 'action', action: { type: 'message', label: '🌸 花梨', text: '#花梨' } },
    { type: 'action', action: { type: 'message', label: '🖤 華', text: '#華' } },
    { type: 'action', action: { type: 'message', label: '🎭 慶三郎', text: '#慶三郎' } },
    { type: 'action', action: { type: 'message', label: '☀️ 純菜', text: '#純菜' } },
    { type: 'action', action: { type: 'message', label: '🔥 ニーナ', text: '#ニーナ' } },
    { type: 'action', action: { type: 'message', label: '🎯 真琴', text: '#真琴' } },
    { type: 'action', action: { type: 'message', label: '👤 ノーマル', text: '#ノーマル' } },
  ],
};

// 5000文字で分割してリプライ
async function replyText(replyToken, text) {
  const chunks = splitText(text, 5000);

  // replyTokenは最初の1回しか使えないので、最初のチャンクをreplyで送る
  // 残りは送れない（Pushは月200通制限）ので、1メッセージに最大5つまで詰める
  const messages = chunks.slice(0, 5).map((chunk) => ({
    type: 'text',
    text: chunk,
  }));

  // 最後のメッセージにクイックリプライボタンをつける
  messages[messages.length - 1].quickReply = quickReply;

  await client.replyMessage({
    replyToken,
    messages,
  });
}

function splitText(text, maxLen) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // 改行位置で切るのを優先
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt <= 0) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  return chunks;
}

// LINEから音声データをダウンロードしてBase64に変換
async function getAudioAsBase64(messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString('base64');
}

// キャラ選択用リプライ
async function replyCharacterSelect(replyToken, currentChar) {
  await client.replyMessage({
    replyToken,
    messages: [{
      type: 'text',
      text: `現在の人格: ${currentChar}\n切り替えたいキャラを選んでね！`,
      quickReply: characterQuickReply,
    }],
  });
}

module.exports = { client, replyText, replyCharacterSelect, getImageAsBase64, getAudioAsBase64 };
