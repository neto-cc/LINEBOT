const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const { Client, middleware } = require("@line/bot-sdk");
const fs = require("fs");
require("dotenv").config();

// アプリケーションのセットアップ
const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

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
  // テキストメッセージの処理
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`Received message: ${receivedMessage}`);

    // Rasaでインテントを解析
    const intent = await getRasaIntent(receivedMessage);
    if (!intent) {
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "申し訳ありません。理解できませんでした。",
      });
    }

    // Firestoreからインテントに対応するレスポンスを取得
    let responseMessage = await getFirestoreResponse(intent);
    if (!responseMessage) {
      responseMessage = "データが見つかりませんでした。";
    }

    // クイックリプライを含む応答メッセージ
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: responseMessage,
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "postback",
              label: "役に立った",
              data: "feedback:役に立った",
            },
          },
          {
            type: "action",
            action: {
              type: "postback",
              label: "役に立たなかった",
              data: "feedback:役に立たなかった",
            },
          },
        ],
      },
    });
  }

  // ポストバックイベントの処理
  if (event.type === "postback") {
    const postbackData = event.postback.data;

    // フィードバックデータの処理
    if (postbackData.startsWith("feedback:")) {
      const feedback = postbackData.replace("feedback:", "");
      console.log(`Feedback received: ${feedback}`);

      // Firestoreに保存
      await db.collection("feedback").add({
        feedback,
        timestamp: new Date(),
      });

      // フィードバックの応答
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "ご協力ありがとうございます！",
      });
    }
  }
}

// Rasaでメッセージを解析してインテントを取得
async function getRasaIntent(message) {
  try {
    const response = await axios.post(
      "http://localhost:5005/webhooks/rest/webhook",
      { sender: "user", message: message },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.status === 200 && response.data.length > 0 && response.data[0].intent) {
      return response.data[0].intent.name;
    }
    return null;
  } catch (error) {
    console.error("Rasaとの通信エラー:", error);
    return null;
  }
}

// Firestoreからインテントに対応するレスポンスを取得
async function getFirestoreResponse(intent) {
  try {
    const docRef = db.collection("message").doc(intent);
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data().response || null;
    }
    return null;
  } catch (error) {
    console.error("Firestoreエラー:", error);
    return null;
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});