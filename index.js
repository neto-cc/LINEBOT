const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
const axios = require("axios");
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

// Rasaのエンドポイント設定
const RASA_URL = process.env.RASA_URL || "https://your-rasa-server.com/webhooks/rest/webhook";

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

// イベント処理関数
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信したメッセージ: ${receivedMessage}`);

    try {
      // Rasaへメッセージ送信
      const rasaResponse = await axios.post(RASA_URL, {
        sender: event.source.userId, // ユーザーのIDをRasaに送信
        message: receivedMessage,
      });

      // Rasaのレスポンスを処理
      if (rasaResponse.data.length > 0) {
        const messages = rasaResponse.data.map((msg) => ({
          type: "text",
          text: msg.text,
        }));

        return client.replyMessage(event.replyToken, messages);
      } else {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "すみません、適切な応答が見つかりませんでした。",
        });
      }
    } catch (error) {
      console.error("Error communicating with Rasa:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "エラーが発生しました。",
      });
    }
  }

  // ポストバックイベントの処理
  if (event.type === "postback") {
    const postbackData = event.postback.data;

    if (postbackData.startsWith("feedback:")) {
      const feedback = postbackData.replace("feedback:", "");
      console.log(`Feedback received: ${feedback}`);

      await db.collection("feedback").add({
        feedback,
        timestamp: new Date(),
      });

      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "ご協力ありがとうございます！",
      });
    }
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});