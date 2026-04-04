const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getCharacterPrompt } = require('./characters');

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// システムプロンプトを読み込み（{{TODAY}}を今日の日付に置換）
function getSystemPrompt() {
  const filePath = path.join(__dirname, '..', 'system-prompt.txt');
  try {
    const template = fs.readFileSync(filePath, 'utf-8').trim();
    const today = new Date().toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
      timeZone: 'Asia/Tokyo',
    });
    return template.replace('{{TODAY}}', today);
  } catch {
    return 'あなたはフミヤの個人アシスタントです。フランクな日本語で応答してください。';
  }
}

// テキストのみの会話
async function chat(messages, model, characterKey) {
  const systemPrompt = getSystemPrompt() + getCharacterPrompt(characterKey);
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  return extractText(response);
}

// 画像付きの会話
async function chatWithImage(base64Image, text, history, model, characterKey) {
  // 履歴 + 今回の画像付きメッセージ
  const messages = [
    ...history,
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          type: 'text',
          text: text || 'この画像について説明して。',
        },
      ],
    },
  ];

  const systemPrompt = getSystemPrompt() + getCharacterPrompt(characterKey);
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  return extractText(response);
}

function extractText(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

// 音声付きの会話
async function chatWithAudio(base64Audio, history, model, characterKey) {
  const messages = [
    ...history,
    {
      role: 'user',
      content: [
        {
          type: 'input_audio',
          source: {
            type: 'base64',
            media_type: 'audio/m4a',
            data: base64Audio,
          },
        },
        {
          type: 'text',
          text: 'この音声メッセージに応答して。まず内容を書き起こしてから返答して。',
        },
      ],
    },
  ];

  const systemPrompt = getSystemPrompt() + getCharacterPrompt(characterKey);
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages,
  });

  return extractText(response);
}

module.exports = { chat, chatWithImage, chatWithAudio, getSystemPrompt };
