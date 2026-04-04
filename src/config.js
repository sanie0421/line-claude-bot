const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

module.exports = {
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    pushUserId: process.env.LINE_PUSH_USER_ID || '',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  notion: {
    apiKey: process.env.NOTION_API_KEY || '',
    databaseId: process.env.NOTION_DATABASE_ID || '',
  },
  google: {
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || '',
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
  },
  chat: {
    historyLimit: parseInt(process.env.HISTORY_LIMIT, 10) || 20,
  },
};
