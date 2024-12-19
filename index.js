const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const fs = require("fs");
require("dotenv").config();

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
  // シークレットファイルを読み込む
  firebaseServiceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, "utf-8"));
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to load Firebase key:", error);
  process.exit(1); // 起動失敗
}

// 必要に応じて Firebase Admin SDK を初期化（例: 追加機能を利用する場合）
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});

const db = admin.firestore();

// LINEクライアントの作成
const client = new Client(config);

// Content-Typeヘッダーを設定（文字化け対策）
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// middlewareの適用
app.use(middleware(config));

// Webhookエンドポイントの設定
app.post("/webhook", (req, res) => {
  console.log("Received webhook event:", JSON.stringify(req.body, null, 2));

  // 受信イベントの処理
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
    const receivedMessage = event.message.text; // 受け取ったメッセージ（「こんにちは」など）
    console.log(`Received message: ${receivedMessage}`);

    // Firestoreの`message`コレクションを検索（部分一致検索）
    const querySnapshot = await db.collection("message")
      .where("keywords", "array-contains", receivedMessage)  // "keywords"に部分一致する値を検索
      .get();

    if (!querySnapshot.empty) {
      // 部分一致するドキュメントがあれば、最初のマッチしたドキュメントのresponseを取得
      const doc = querySnapshot.docs[0]; // 最初の一致するドキュメント
      const responseMessage = doc.data().response;
      console.log(`Response found: ${responseMessage}`);

      // LINEで返答を送信
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: responseMessage,
      });
    } else {
      // 部分一致するドキュメントが見つからない場合
      console.log("No response found for the message.");
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "すみません、そのメッセージには対応できません。",
      });
    }
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});