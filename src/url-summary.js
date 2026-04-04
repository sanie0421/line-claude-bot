const cheerio = require('cheerio');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const URL_REGEX = /https?:\/\/[^\s]+/g;

// テキスト中のURLを抽出
function extractUrls(text) {
  return text.match(URL_REGEX) || [];
}

// URLからテキストを取得して要約
async function summarizeUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LineChatBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return `URLを取得できなかった (${res.status})`;

    const html = await res.text();
    const $ = cheerio.load(html);

    // 不要要素を除去
    $('script, style, nav, header, footer, aside, iframe').remove();

    // メインテキストを抽出
    const title = $('title').text().trim();
    const body = $('article, main, .content, .post, body')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000); // 5000文字まで

    if (!body) return `ページの内容を取得できなかった`;

    // Claudeで要約
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `以下のWebページの内容を3〜5行で簡潔に要約して。日本語で。\n\nタイトル: ${title}\n\n${body}`,
        },
      ],
    });

    const summary = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    return `📎 ${title}\n\n${summary}`;
  } catch (err) {
    return `URL要約エラー: ${err.message}`;
  }
}

module.exports = { extractUrls, summarizeUrl };
