const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
require("dotenv").config();

const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// Firebase Admin SDKの初期化
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

// イベント処理関数
async function handleEvent(event) {
  console.log("Received event:", event);

  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信したメッセージ: ${receivedMessage}`);

    // Firebaseからデータを取得
    const docRef = db.collection("message").doc(receivedMessage);
    const doc = await docRef.get();

    if (doc.exists) {
      const responseMessage = doc.data().response;
      console.log("Found response:", responseMessage);

      if (responseMessage.startsWith("http")) {
        // 画像URLの場合、画像メッセージを送信
        return client.replyMessage(event.replyToken, {
          type: "image",
          originalContentUrl: responseMessage,
          previewImageUrl: responseMessage,
        });
      } else {
        // 通常のテキストメッセージ
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: responseMessage,
        });
      }
    } else {
      console.log("No response found for the message.");
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "すみません、そのメッセージには対応できません。",
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
