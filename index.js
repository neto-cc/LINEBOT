const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();
const cors = require("cors");

const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// 環境変数の確認
if (!config.channelSecret || !config.channelAccessToken) {
  console.error("LINE API credentials are missing in environment variables.");
  process.exit(1);
}

// Firebaseキーの読み込み
const firebaseKeyPath = process.env.FIREBASE_KEY_PATH || "/etc/secrets/FIREBASE_KEY_PATH";
let firebaseServiceAccount;

try {
  firebaseServiceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, "utf-8"));
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

// CORS設定
app.use(cors());

// middlewareの適用
app.use(express.json());
app.use(middleware(config));

// Rasaのエンドポイント
const RASA_URL = "https://rasa-vt1z.onrender.com/webhook";  // RasaサーバーのURL

// Webhookエンドポイント
app.post("/webhook", async (req, res) => {
  console.log("Received webhook event:", JSON.stringify(req.body, null, 2));

  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    console.log("Webhook processed successfully:", results);
    res.json(results); // 正常に応答を返す
  } catch (err) {
    console.error("Error processing event:", err);
    res.status(500).send({ error: "Error processing event", details: err.message });
  }
});

// イベント処理関数
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`Received message: ${receivedMessage}`);

    try {
      // Rasaにメッセージを送信
      const rasaResponse = await axios.post(RASA_URL, {
        sender: event.source.userId,  // ユーザーのIDをRasaのsender_idとして送信
        message: receivedMessage,
      });

      console.log("Rasa response:", rasaResponse.data);

      // Rasaからの応答をLINEメッセージとして送信
      if (rasaResponse.data.length > 0) {
        const responseMessage = rasaResponse.data[0].text; // 最初のメッセージを取得
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: responseMessage,
        });
      } else {
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "すみません、理解できませんでした。",
        });
      }
    } catch (error) {
      console.error("Error sending message to Rasa:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "エラーが発生しました。",
      });
    }
  }

  // ポストバックイベントの処理（省略せずそのまま利用）
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