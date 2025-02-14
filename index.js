const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
require("dotenv").config();
const fs = require("fs");
const admin = require("firebase-admin");

const app = express();

// === LINE Messaging APIの設定 ===
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// 環境変数のチェック
if (!config.channelSecret || !config.channelAccessToken) {
  console.error("Missing LINE API credentials. Please check your environment variables.");
  process.exit(1);
}

// 環境変数から Firebase キーファイルのパスを取得
const firebaseKeyPath = process.env.FIREBASE_KEY_PATH || "./config/service-account.json";
let firebaseServiceAccount;

// === Firebaseの設定 & 初期化 ===
try {
  // ファイルが存在するか確認
  if (!fs.existsSync(firebaseKeyPath)) {
    throw new Error(`Firebase key file not found: ${firebaseKeyPath}`);
  }

  // キーファイルを読み込んでパース
  const keyData = fs.readFileSync(firebaseKeyPath, "utf8");
  firebaseServiceAccount = JSON.parse(keyData);
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to load Firebase key:", error.message);
  process.exit(1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseServiceAccount),
  });
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error("Failed to initialize Firebase:", error.message);
  process.exit(1);
}

const db = admin.firestore();

// === middleware の適用（順番に注意！） ===
app.use(middleware(config)); // ?? これを最優先で適用

// Webhookエンドポイント
app.post("/webhook", async (req, res) => {
  console.log(" Received webhook event:", JSON.stringify(req.body, null, 2));

  if (!req.body.events || req.body.events.length === 0) {
    console.warn("No events received.");
    return res.status(200).send("No events.");
  }

  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).send("OK");
  } catch (err) {
    console.error("Error processing event:", err);
    res.status(500).send("Error processing event");
  }
});

// JSONリクエストを受け付けるためのミドルウェア（Webhook 以外のルートに適用）
app.use(express.json());

// === イベント処理関数 ===
async function handleEvent(event) {
  try {
    if (event.type === "message" && event.message.type === "text") {
      const receivedMessage = event.message.text;
      console.log(`?? 受信したメッセージ: ${receivedMessage}`);

      const docRef = db.collection("message").doc(receivedMessage);
      const doc = await docRef.get();
      const responseMessage = doc.exists ? doc.data().response : "すみません、そのメッセージには対応できません。";

      return sendResponse(event.replyToken, responseMessage);
    }

    if (event.type === "postback") {
      return await handlePostback(event);
    }
  } catch (error) {
    console.error("? Error handling event:", error);
    return client.replyMessage(event.replyToken, {
      type: "text",
      text: "システムエラーが発生しました。",
    });
  }
}

// === ポストバックイベントの処理 ===
async function handlePostback(event) {
  const postbackData = event.postback.data;

  if (postbackData.startsWith("feedback:")) {
    const feedback = postbackData.replace("feedback:", "");
    console.log(`?? Feedback received: ${feedback}`);

    try {
      await db.collection("feedback").add({
        feedback,
        timestamp: new Date(),
      });

      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "ご協力ありがとうございます！",
      });
    } catch (error) {
      console.error("? Error saving feedback:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "フィードバックの保存中にエラーが発生しました。",
      });
    }
  }
}

// === サーバー起動 ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`?? Server is running on port ${PORT}`);
});
