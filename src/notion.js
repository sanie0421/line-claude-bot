const { Client } = require('@notionhq/client');
const config = require('./config');

let notion = null;

function isEnabled() {
  return !!(config.notion.apiKey && config.notion.databaseId);
}

function getClient() {
  if (!notion && isEnabled()) {
    notion = new Client({ auth: config.notion.apiKey });
  }
  return notion;
}

// --- メモ保存（既存） ---
async function saveMemo(text) {
  const client = getClient();
  if (!client) return false;

  await client.pages.create({
    parent: { database_id: config.notion.databaseId },
    properties: {
      title: {
        title: [{ text: { content: text.slice(0, 100) } }],
      },
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ text: { content: text } }],
        },
      },
    ],
  });

  return true;
}

// --- 家計簿 ---
async function addExpense(amount, description, category) {
  const client = getClient();
  if (!client) return false;

  const dbId = process.env.NOTION_EXPENSE_DB_ID;
  if (!dbId) return false;

  await client.pages.create({
    parent: { database_id: dbId },
    properties: {
      名前: { title: [{ text: { content: description } }] },
      金額: { number: amount },
      カテゴリ: { select: { name: category || '未分類' } },
      日付: { date: { start: new Date().toISOString().split('T')[0] } },
    },
  });

  return true;
}

async function getMonthlyExpenses() {
  const client = getClient();
  if (!client) return null;

  const dbId = process.env.NOTION_EXPENSE_DB_ID;
  if (!dbId) return null;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const res = await client.databases.query({
    database_id: dbId,
    filter: {
      property: '日付',
      date: { on_or_after: startOfMonth },
    },
  });

  let total = 0;
  const byCategory = {};

  for (const page of res.results) {
    const amount = page.properties['金額']?.number || 0;
    const cat = page.properties['カテゴリ']?.select?.name || '未分類';
    total += amount;
    byCategory[cat] = (byCategory[cat] || 0) + amount;
  }

  return { total, byCategory, count: res.results.length };
}

// --- 買い物リスト ---
async function addShoppingItem(item) {
  const client = getClient();
  if (!client) return false;

  const dbId = process.env.NOTION_SHOPPING_DB_ID;
  if (!dbId) return false;

  await client.pages.create({
    parent: { database_id: dbId },
    properties: {
      名前: { title: [{ text: { content: item } }] },
      完了: { checkbox: false },
    },
  });

  return true;
}

async function getShoppingList() {
  const client = getClient();
  if (!client) return null;

  const dbId = process.env.NOTION_SHOPPING_DB_ID;
  if (!dbId) return null;

  const res = await client.databases.query({
    database_id: dbId,
    filter: {
      property: '完了',
      checkbox: { equals: false },
    },
  });

  return res.results.map((page) => {
    const name = page.properties['名前']?.title?.[0]?.text?.content || '不明';
    return name;
  });
}

// --- タスク ---
async function addTask(title, dueDate) {
  const client = getClient();
  if (!client) return false;

  const dbId = process.env.NOTION_TASK_DB_ID;
  if (!dbId) return false;

  const properties = {
    名前: { title: [{ text: { content: title } }] },
    ステータス: { select: { name: '未着手' } },
  };

  if (dueDate) {
    properties['期限'] = { date: { start: dueDate } };
  }

  await client.pages.create({
    parent: { database_id: dbId },
    properties,
  });

  return true;
}

async function getOpenTasks() {
  const client = getClient();
  if (!client) return null;

  const dbId = process.env.NOTION_TASK_DB_ID;
  if (!dbId) return null;

  const res = await client.databases.query({
    database_id: dbId,
    filter: {
      property: 'ステータス',
      select: { does_not_equal: '完了' },
    },
  });

  return res.results.map((page) => {
    const name = page.properties['名前']?.title?.[0]?.text?.content || '不明';
    const due = page.properties['期限']?.date?.start || '';
    return due ? `${name}（${due}）` : name;
  });
}

function isExpenseEnabled() {
  return isEnabled() && !!process.env.NOTION_EXPENSE_DB_ID;
}

function isShoppingEnabled() {
  return isEnabled() && !!process.env.NOTION_SHOPPING_DB_ID;
}

function isTaskEnabled() {
  return isEnabled() && !!process.env.NOTION_TASK_DB_ID;
}

module.exports = {
  isEnabled, saveMemo,
  isExpenseEnabled, addExpense, getMonthlyExpenses,
  isShoppingEnabled, addShoppingItem, getShoppingList,
  isTaskEnabled, addTask, getOpenTasks,
};
