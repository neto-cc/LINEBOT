const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();

// LINE Messaging API の設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// Firebase Admin SDK の初期化
const admin = require("firebase-admin");

let firebaseServiceAccount;
try {
  firebaseServiceAccount = JSON.parse(process.env.FIREBASE_KEY_PATH);
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to parse Firebase key from environment variable:", error);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});

const db = admin.firestore();

// LINE クライアントの作成
const client = new Client(config);

// middleware の適用
app.use(middleware(config));

// Webhook エンドポイント
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
  console.log("Received event:", event);

  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信したメッセージ: ${receivedMessage}`);

    try {
      // ?? Rasa にメッセージを送ってインテントを取得
      const rasaResponse = await axios.post("https://rasa-vt1z.onrender.com", {
        text: receivedMessage,
      });

      console.log("Rasa Response:", JSON.stringify(rasaResponse.data, null, 2));

      if (!rasaResponse.data.intent) {
        throw new Error("Intent not found");
      }

      const intent = rasaResponse.data.intent.name;
      console.log(`Detected intent: ${intent}`);

      // ?? Firebase でインテント名を使ってデータを検索
      const messageSnapshot = await db.collection("intents").where("intent", "==", intent).get();

      if (!messageSnapshot.empty) {
        const firestoreResponse = messageSnapshot.docs[0].data().response;
        console.log(`Firestoreからのresponse: ${firestoreResponse}`);

        return client.replyMessage(event.replyToken, {
          type: "text",
          text: firestoreResponse,
        });
      }

      // ?? Firestore に該当データがない場合のデフォルトメッセージ
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "すみません、その内容にはまだ対応していません。",
      });
    } catch (error) {
      console.error("Error processing message:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "システムエラーが発生しました。",
      });
    }
  }

  return Promise.resolve(null);
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});