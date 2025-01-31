const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const fs = require("fs");
require("dotenv").config();
const cors = require("cors");

const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// 環境変数のチェック
if (!config.channelSecret || !config.channelAccessToken) {
  console.error("? LINE APIの環境変数が不足しています。");
  process.exit(1);
}

// Firebaseキーの読み込み
const firebaseKeyPath = process.env.FIREBASE_KEY_PATH || "/etc/secrets/FIREBASE_KEY_PATH";
let firebaseServiceAccount;

if (fs.existsSync(firebaseKeyPath)) {
  try {
    firebaseServiceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, "utf-8"));
    console.log("? Firebaseキーの読み込みに成功しました。");
  } catch (error) {
    console.error("? Firebaseキーの読み込みに失敗しました:", error);
    process.exit(1);
  }
} else {
  console.error("? Firebaseキーのパスが正しくありません:", firebaseKeyPath);
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

// CORS設定
app.use(cors());

// middlewareの適用
app.use(express.json());
app.use(middleware(config));

// ルートエンドポイント
app.get("/", (req, res) => {
  res.send("? LINE Bot サーバーが正常に動作しています。");
});

// Webhookエンドポイント
app.post("/webhook", async (req, res) => {
  console.log("?? Webhookイベントを受信:", JSON.stringify(req.body, null, 2));

  if (!req.body.events || req.body.events.length === 0) {
    return res.status(400).send({ message: "? イベントがありません。" });
  }

  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    console.log("? Webhookイベント処理完了:", results);
    res.json(results);
  } catch (err) {
    console.error("? Webhookイベント処理中にエラー発生:", err);
    res.status(500).send({ error: "Webhookイベントの処理に失敗しました", details: err.message });
  }
});

// イベント処理関数
async function handleEvent(event) {
  try {
    console.log(`?? イベントタイプ: ${event.type}`);

    if (event.type === "message" && event.message.type === "text") {
      const receivedMessage = event.message.text;
      console.log(`?? 受信メッセージ: ${receivedMessage}`);

      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `あなたのメッセージ: ${receivedMessage}`,
      });
    }

    if (event.type === "postback") {
      const postbackData = event.postback.data;

      if (postbackData.startsWith("feedback:")) {
        const feedback = postbackData.replace("feedback:", "");
        console.log(`?? フィードバック受信: ${feedback}`);

        await db.collection("feedback").add({
          feedback,
          timestamp: new Date(),
        });

        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "?? フィードバックありがとうございます！",
        });
      }
    }

    return null;
  } catch (error) {
    console.error("? handleEventでエラー発生:", error);
    return Promise.reject(error);
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`?? サーバーがポート ${PORT} で起動しました。`);