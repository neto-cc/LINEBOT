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

// Content-Type ヘッダーを設定
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

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

    // Rasaへ送信
    try {
      const rasaResponse = await axios.post("https://rasa-vt1z.onrender.com/webhooks/rest/webhook", {
        sender: event.source.userId,
        message: receivedMessage,
      });

      console.log("Rasa Response:", JSON.stringify(rasaResponse.data, null, 2));

      if (!rasaResponse.data || rasaResponse.data.length === 0) {
        throw new Error("Rasaからの適切な応答が得られませんでした");
      }

      const rasaMessage = rasaResponse.data[0]?.text || "すみません、そのメッセージには対応できません。";
      const intent = rasaResponse.data[0]?.intent?.name; // Rasaのintent名

      if (intent) {
        console.log(`Rasaからのintent: ${intent}`);

        // Firestoreからintentに対応するresponseを取得
        const docRef = db.collection("message").doc(intent);
        const doc = await docRef.get();

        if (doc.exists) {
          const firestoreResponse = doc.data().response;
          console.log(`Firestoreからのresponse: ${firestoreResponse}`);

          return client.replyMessage(event.replyToken, {
            type: "text",
            text: firestoreResponse,
          });
        } else {
          console.log("Firestoreに該当のintentデータが見つかりませんでした。");
        }
      }

      // Firestoreにデータがなかった場合、Rasaのメッセージを返す
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: rasaMessage,
      });

    } catch (error) {
      console.error("Error communicating with Rasa or Firestore:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "システムエラーが発生しました。",
      });
    }
  }

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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});