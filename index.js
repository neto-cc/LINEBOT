const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
require("dotenv").config();

const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// Firebaseキーの読み込み
const firebaseKey = process.env.FIREBASE_KEY_PATH;
let firebaseServiceAccount;

try {
  firebaseServiceAccount = JSON.parse(firebaseKey);
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to load Firebase key:", error);
  process.exit(1);
}

// Firebase Admin SDKの初期化
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});

const db = admin.firestore();

// LINEクライアントの作成
const client = new Client(config);

// Content-Typeヘッダーを設定
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// middlewareの適用
app.use(middleware(config));

// Webhookエンドポイント
app.post("/webhook", (req, res) => {
  console.log("Received webhook event:", JSON.stringify(req.body, null, 2));

  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Error processing event:", err);
      res.status(500).end();
    });
});

// ? イベント処理関数
async function handleEvent(event) {
  if (event.type === "follow") {
    return sendMenu(event.replyToken);
  }

  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信したメッセージ: ${receivedMessage}`);

    if (receivedMessage === "メニュー") {
      return sendMenu(event.replyToken);
    }
  }

  if (event.type === "postback") {
    return handlePostback(event);
  }
}

// ? ポストバック処理（選択肢に応じた回答をして、再度ボタンを表示）
async function handlePostback(event) {
  const postbackData = event.postback.data;

  let responseText = "不明な選択肢です。";

  if (postbackData === "select:質問1") {
    responseText = "質問1の回答です。";
  } else if (postbackData === "select:質問2") {
    responseText = "質問2の回答です。";
  }

  return client.replyMessage(event.replyToken, [
    {
      type: "text",
      text: responseText,
    },
    sendMenuTemplate(),
  ]);
}

// ? ボタンメニューを送信
function sendMenu(replyToken) {
  return client.replyMessage(replyToken, sendMenuTemplate());
}

// ? ボタンメニューのテンプレート
function sendMenuTemplate() {
  return {
    type: "template",
    altText: "ボタンを選択してください",
    template: {
      type: "buttons",
      text: "どれを選びますか？",
      actions: [
        {
          type: "postback",
          label: "質問1",
          data: "select:質問1",
        },
        {
          type: "postback",
          label: "質問2",
          data: "select:質問2",
        },
      ],
    },
  };
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});