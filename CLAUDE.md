# LINE Claude Bot

## プロジェクト概要
フミヤの個人アシスタントLINE Bot。Mac mini上で24時間稼働。
Claude APIによる会話に加え、聖鳳学館キャラクターの人格切替、Notion連携（メモ・家計簿・買い物・タスク）、Googleカレンダー、URL要約、音声・画像・位置情報対応、朝の自動通知など多機能。

## セッション起動方法
```bash
cd ~/line-claude-bot && claude --remote-control
```

## 技術スタック
- **ランタイム**: Node.js (CommonJS)
- **サーバー**: Express 5
- **AI**: Claude API (@anthropic-ai/sdk)
- **LINE**: @line/bot-sdk
- **DB**: SQLite (better-sqlite3) — `data/chat.db`
- **Notion**: @notionhq/client
- **Google Calendar**: googleapis
- **HTML解析**: cheerio
- **スケジューラ**: node-cron
- **プロセス管理**: pm2
- **公開**: Cloudflare Tunnel → `linebot.fumiya-bot.win`

## アーキテクチャ
```
LINE App ↔ Cloudflare Tunnel (linebot.fumiya-bot.win) ↔ Express (:3000)

src/
├── index.js        … ルーティング・イベントハンドラ（全機能の振り分け）
├── claude.js       … Claude API (chat / chatWithImage / chatWithAudio)
├── line.js         … LINE API (replyText / replyCharacterSelect / getImageAsBase64 / getAudioAsBase64)
├── db.js           … SQLite (messages, user_settings)
├── characters.js   … 聖鳳学館6キャラの人格プロンプト定義
├── notion.js       … Notion API (メモ / 家計簿 / 買い物リスト / タスク)
├── calendar.js     … Google Calendar API
├── url-summary.js  … URL fetch → cheerio → Claude要約
├── morning.js      … 毎朝7:00 cron (ゴミ出し + カレンダー Push通知)
└── config.js       … dotenv → 設定オブジェクト
```

## 設計決定

### メッセージルーティング（index.js handleEvent）
テキストメッセージは上から順にマッチ。**順番が重要**:
1. `#キャラ` → キャラ選択メニュー表示
2. `#花梨` 等 → 人格切替
3. `#sonnet` 等 → モデル切替
4. `リセット` / `忘れて` → 履歴クリア
5. `メモして` / `覚えて` / `記録して` → Notion メモ
6. `¥1000 ランチ` → 家計簿
7. `今月いくら？` → 月次集計
8. `買い物リスト` → 一覧 / `〜買って` → 追加
9. `タスク〜` → 追加 / `タスク一覧` → 一覧
10. URL検出 → 要約
11. `今日の予定` / `明日の予定` → Googleカレンダー
12. （上記いずれにもマッチしない）→ Claude会話

### 全角ハッシュ対応
LINEの日本語キーボードは `＃`（全角）を送る。`＃` → `#` に正規化してからマッチング。

### 人格システム
- `characters.js` に6キャラのシステムプロンプトを定義
- `user_settings.character` カラムでユーザーごとに保持
- `claude.js` でベースのシステムプロンプト + キャラプロンプトを結合
- Quick Reply: メインに「キャラ」ボタン → 押すとキャラ選択メニュー（2段階UI）

### 聖鳳学館キャラクター
全員「対橋本フミヤ」の体で応答。キャラ詳細はNotionの聖鳳ページに原典あり。
- 一条花梨 / 中院華 / 土御門慶三郎 / 広幡純菜 / ニーナ / 近衛真琴

### ゴミ出しスケジュール
`system-prompt.txt` に大井町のゴミ収集カレンダーを埋め込み。`{{TODAY}}` を起動時に置換。
`morning.js` の `getGarbageInfo()` にも同じロジックを実装（Push通知用）。

## 環境変数（.env）
```
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
ANTHROPIC_API_KEY=
NOTION_API_KEY=              # ※現在401エラー。トークン再発行が必要
NOTION_DATABASE_ID=          # メモ用DB
NOTION_EXPENSE_DB_ID=        # 家計簿用（未作成）
NOTION_SHOPPING_DB_ID=       # 買い物リスト用（未作成）
NOTION_TASK_DB_ID=           # タスク用（未作成）
GOOGLE_CREDENTIALS_PATH=     # サービスアカウントJSON（未設定）
GOOGLE_CALENDAR_ID=primary
LINE_PUSH_USER_ID=           # 朝通知の送信先（未設定）
PORT=3000
```

## 未解決・TODO
- **Notion API 401エラー**: APIキーが無効。Notion側でインテグレーション再作成が必要
- **Google Calendar**: サービスアカウントのcredentials.json未配置
- **LINE_PUSH_USER_ID**: 朝通知のために自分のuserIdを.envに設定する必要あり
- **Notion追加DB**: 家計簿・買い物・タスク用のDBをNotionに作成する必要あり
- **天気API**: 朝通知に天気を含めるならOpenWeather APIキーが必要

## アカウント情報
- **GitHub**: sanie0421
- **Cloudflare**: fumiya89@gmail.com
- **ドメイン**: linebot.fumiya-bot.win

## プロセス管理
```bash
# pm2コマンド（PATHが通らない場合）
export PATH="/usr/local/bin:$PATH"
/usr/local/bin/npx pm2 restart line-claude-bot
/usr/local/bin/npx pm2 logs line-claude-bot --nostream --lines 20
```

## 開発ルール
- コミュニケーションは日本語
- フミヤはプログラミング素人。コマンドやコードは1行ずつ解説すること
- iCloud上の旧ファイル（`~/Library/Mobile Documents/iCloud~md~obsidian/Documents/AI要塞/line-claude-bot`）は参考資料として残す
- 詳細設計は `DESIGN.md` を参照
