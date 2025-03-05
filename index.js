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

// Firebaseのセットアップ
const admin = require("firebase-admin");
let firebaseServiceAccount;
try {
  firebaseServiceAccount = JSON.parse(process.env.FIREBASE_KEY_PATH);
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to load Firebase key:", error);
  process.exit(1);
}
admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});
const db = admin.firestore();

// LINEクライアントの作成
const client = new Client(config);

// Rasaのエンドポイント設定
const RASA_URL = process.env.RASA_URL || "https://rasa-vt1z.onrender.com/webhooks/rest/webhook";

// middlewareの適用
app.use(middleware(config));

// Webhookエンドポイント
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (err) {
    console.error("Error processing event:", err);
    res.status(500).end();
  }
});

// イベント処理関数
async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;
  const userId = event.source.userId;
  console.log(`User (${userId}) sent: ${userMessage}`);

  try {
    // Rasaにメッセージを送信
    const rasaResponse = await axios.post(RASA_URL, {
      sender: userId,
      message: userMessage,
    });

    if (rasaResponse.data.length === 0) {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "すみません、理解できませんでした。",
      });
    }

    const intent = rasaResponse.data[0].text;
    console.log(`Detected intent: ${intent}`);

    // Firestoreから応答を取得
    const docRef = db.collection("responses").doc(intent);
    const doc = await docRef.get();

    let replyMessage;
    if (doc.exists) {
      replyMessage = doc.data().response;
    } else {
      replyMessage = "データが見つかりませんでした。";
    }

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: replyMessage,
    });

  } catch (error) {
    console.error("Error communicating with Rasa or Firestore:", error);
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "エラーが発生しました。",
    });
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
