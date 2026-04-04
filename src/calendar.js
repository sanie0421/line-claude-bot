const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const config = require('./config');

let calendar = null;

function isEnabled() {
  return !!(config.google && config.google.credentialsPath);
}

function getClient() {
  if (calendar) return calendar;
  if (!isEnabled()) return null;

  try {
    const credPath = path.resolve(config.google.credentialsPath);
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));

    // サービスアカウント認証
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    calendar = google.calendar({ version: 'v3', auth });
    return calendar;
  } catch (err) {
    console.error('Google Calendar init error:', err.message);
    return null;
  }
}

// 今日の予定を取得
async function getTodayEvents() {
  const cal = getClient();
  if (!cal) return null;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const res = await cal.events.list({
    calendarId: config.google.calendarId || 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Tokyo',
  });

  return formatEvents(res.data.items || []);
}

// 指定日の予定を取得
async function getEventsForDate(date) {
  const cal = getClient();
  if (!cal) return null;

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const res = await cal.events.list({
    calendarId: config.google.calendarId || 'primary',
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    timeZone: 'Asia/Tokyo',
  });

  return formatEvents(res.data.items || []);
}

// 予定を追加
async function addEvent(summary, startTime, endTime) {
  const cal = getClient();
  if (!cal) return null;

  // endTimeがなければ1時間後
  if (!endTime) {
    endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
  }

  const res = await cal.events.insert({
    calendarId: config.google.calendarId || 'primary',
    requestBody: {
      summary,
      start: { dateTime: startTime.toISOString(), timeZone: 'Asia/Tokyo' },
      end: { dateTime: endTime.toISOString(), timeZone: 'Asia/Tokyo' },
    },
  });

  return res.data;
}

function formatEvents(events) {
  if (events.length === 0) return '予定はないよ！';

  return events.map((e) => {
    const start = e.start.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString('ja-JP', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
        })
      : '終日';
    return `${start} ${e.summary}`;
  }).join('\n');
}

module.exports = { isEnabled, getTodayEvents, getEventsForDate, addEvent };
