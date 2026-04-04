# LINE Claude Bot 設計書 v2.0

## 概要
フミヤの個人アシスタントLINE Bot。Claude APIを使った会話機能に加え、Notion連携・Googleカレンダー連携・人格切替など多機能を備える。

## アーキテクチャ

```
LINE App
  ↕ Webhook (HTTPS)
Cloudflare Tunnel (linebot.fumiya-bot.win)
  ↕
Express Server (Mac mini :3000)
  ├── index.js        … ルーティング・イベントハンドラ
  ├── claude.js        … Claude API呼び出し
  ├── line.js          … LINE API (返信・画像取得)
  ├── db.js            … SQLite (履歴・設定)
  ├── notion.js        … Notion API (メモ・家計簿・買物・タスク)
  ├── calendar.js      … Google Calendar API
  ├── characters.js    … 人格データ定義
  ├── url-summary.js   … URL要約
  ├── morning.js       … 朝の自動通知 (cron)
  └── config.js        … 環境変数
```

## 機能一覧

### 1. 人格切替（聖鳳学館キャラクター）
**トリガー**: `#花梨` `#華` `#慶三郎` `#純菜` `#ニーナ` `#真琴` `#ノーマル`

| キャラ | 呼び方 | 口調の特徴 |
|--------|--------|------------|
| 一条花梨 | フミヤくん | 穏やか・短文・「こらこら」「はい、終了～」 |
| 中院華 | フミヤくん | 含みのある間・小悪魔・「だから童貞なのよ」 |
| 土御門慶三郎 | フミ | 天然・優雅・「ご想像にお任せします」 |
| 広幡純菜 | フミヤ先輩 | 「〜っス！」犬系・元気 |
| ニーナ | おフミ先輩 | タメ口・ガラ強め・興奮するとロシア語 |
| 近衛真琴 | 橋本君/フミヤ君 | 丁寧語・いじられると赤面・「禁止です！」 |

**実装**: `characters.js`にキャラ別システムプロンプトを定義。DBの`user_settings`に`character`カラム追加。

### 2. Googleカレンダー連携
**トリガー**:
- 確認: `予定` `スケジュール` `明日の予定` → カレンダー取得して返答
- 登録: `予定追加 4/10 14時 歯医者` or Claude判断で登録

**実装**: `calendar.js` — Google Calendar API (OAuth2)。サービスアカウントまたはOAuth2トークンで認証。

### 3. URL要約
**トリガー**: メッセージ中にURLを検出

**実装**: `url-summary.js` — URLからHTMLを取得→テキスト抽出→Claudeで要約。

### 4. 音声メッセージ対応
**トリガー**: LINE音声メッセージ受信（`event.message.type === 'audio'`）

**実装**: LINE APIから音声データ取得→Claude API（audio対応）またはWhisper APIで文字起こし→通常のテキスト処理。

### 5. 位置情報対応
**トリガー**: LINE位置情報メッセージ（`event.message.type === 'location'`）

**実装**: 緯度経度・住所をClaudeに渡して応答（天気情報・周辺情報など）。

### 6. Notion家計簿
**トリガー**: `家計簿` `支出` `¥1000 ランチ` `今月いくら？`

**実装**: Notion DBに支出記録。カテゴリ自動分類。月次集計。

### 7. Notion買い物リスト
**トリガー**: `買い物` `買い物リスト` `牛乳買って`

**実装**: Notion DBに商品追加。リスト表示・完了チェック。

### 8. Notionタスク追加
**トリガー**: `タスク` `TODO` `やること`

**実装**: Notion DBにタスク追加。期限設定。リスト表示。

### 9. 朝の自動通知
**毎朝7:00に自動Push**:
- 今日のゴミ出し
- 天気予報
- 今日のGoogleカレンダー予定

**実装**: `morning.js` — node-cronでスケジュール実行。LINE Push Message API使用。

### 10. マルチユーザー対応
**現状**: userId単位で会話履歴・モデル設定は既に分離済み。
**追加**: キャラ設定もuserId単位で管理。グループチャット対応（メンション時のみ応答）。

### 11. 既存機能（維持）
- テキスト会話（Claude API）
- 画像認識
- モデル切替（#sonnet / #opus / #haiku）
- 会話リセット
- Notionメモ保存
- ゴミ出しスケジュール
- Quick Replyボタン

## DB スキーマ変更

```sql
-- user_settingsに人格カラム追加
ALTER TABLE user_settings ADD COLUMN character TEXT DEFAULT 'normal';
```

## 必要な追加パッケージ
- `node-cron` — 朝の自動通知用スケジューラ
- `googleapis` — Google Calendar API
- `cheerio` — URL要約時のHTML解析

## 環境変数追加（.env）
```
# Google Calendar
GOOGLE_CALENDAR_CREDENTIALS=./credentials.json
GOOGLE_CALENDAR_ID=primary

# Morning notification target
LINE_PUSH_USER_ID=（フミヤのLINE userId）

# Weather API (optional)
OPENWEATHER_API_KEY=
```

## 実装優先順位
1. **人格切替** — キャラデータ定義 + DB変更 + ルーティング
2. **Googleカレンダー** — 確認・登録
3. **URL要約** — URL検出 + fetch + Claude要約
4. **音声メッセージ** — 音声取得 + 文字起こし
5. **位置情報** — 位置情報取得 + Claude応答
6. **Notion拡張**（家計簿・買物・タスク）— Notion API修正後
7. **朝の自動通知** — cron + Push API
8. **マルチユーザー強化** — グループ対応
