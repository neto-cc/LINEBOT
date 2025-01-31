const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
const fs = require("fs");
require("dotenv").config();

const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// Firebaseキーの読み込み
const firebaseKeyJSON = process.env.FIREBASE_KEY_PATH;

let firebaseServiceAccount;
try {
  // 環境変数からJSONをパースしてFirebaseサービスアカウントを取得
  firebaseServiceAccount = JSON.parse(firebaseKeyJSON);
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

// イベント処理関数
async function handleEvent(event) {
  // テキストメッセージの処理
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信した メッセージ: ${receivedMessage}`);

    // 通常のメッセージ処理
    const docRef = db.collection("message").doc(receivedMessage);
    const doc = await docRef.get();

    if (doc.exists) {
      const responseMessage = doc.data().response;
      console.log(`Response found: ${responseMessage}`);

      // クイックリプライを含む応答メッセージ
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: responseMessage,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "postback", // postbackアクションに変更
                label: "役に立った",
                data: "feedback:役に立った", // フィードバックデータ
              },
            },
            {
              type: "action",
              action: {
                type: "postback", // postbackアクションに変更
                label: "役に立たなかった",
                data: "feedback:役に立たなかった", // フィードバックデータ
              },
            },
          ],
        },
      });
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

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});