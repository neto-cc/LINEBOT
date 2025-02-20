const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();

// LINE Messaging API 設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// Firebase 初期化
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

// LINE クライアント作成
const client = new Client(config);

// Content-Type ヘッダー設定
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use(middleware(config));

// Rasa にメッセージを送って intent を取得
async function getIntentFromRasa(message, userId) {
  try {
    const response = await axios.post("https://rasa-vt1z.onrender.com/webhook", {
      sender: userId,
      message: message,
    });
    return response.data[0]?.intent?.name || "unknown";
  } catch (error) {
    console.error("Error communicating with Rasa:", error);
    return "unknown";
  }
}

// Firestore から intent に対応するメッセージを取得
async function getResponseFromFirebase(intent) {
  try {
    const snapshot = await db.collection("responses").where("intent", "==", intent).get();
    if (snapshot.empty) {
      return "その質問にはまだ対応していません。";
    }
    return snapshot.docs[0].data().response;
  } catch (error) {
    console.error("Error fetching response from Firebase:", error);
    return "エラーが発生しました。";
  }
}

// イベント処理関数
async function handleEvent(event) {
  console.log("Received event:", event);
  
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    const userId = event.source.userId;
    
    console.log(`受信したメッセージ: ${receivedMessage}`);
    
    // Rasa から intent を取得
    const intent = await getIntentFromRasa(receivedMessage, userId);
    console.log(`Detected intent: ${intent}`);
    
    // Firestore から intent に対応するメッセージを取得
    const responseMessage = await getResponseFromFirebase(intent);
    console.log(`Firebase Response: ${responseMessage}`);
    
    // LINE に応答メッセージを送信
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: responseMessage,
    });
  }
}

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

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});