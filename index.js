const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
require("dotenv").config();

const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

if (!config.channelSecret || !config.channelAccessToken) {
  console.error("Missing LINE API credentials. Please check your environment variables.");
  process.exit(1);
}

// Firebaseキーの読み込み
const firebaseKey = process.env.FIREBASE_KEY;
let firebaseServiceAccount;

try {
  if (!firebaseKey) {
    throw new Error("FIREBASE_KEY is not defined in the environment variables.");
  }
  firebaseServiceAccount = JSON.parse(firebaseKey);
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to load Firebase key:", error.message);
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

// middlewareの適用（エラーハンドリング強化）
app.use((req, res, next) => {
  try {
    middleware(config)(req, res, next);
  } catch (err) {
    console.error("Middleware error:", err);
    res.status(403).send("Invalid signature");
  }
});

// Webhookエンドポイント
app.post("/webhook", (req, res) => {
  console.log("Received webhook event:", JSON.stringify(req.body, null, 2));

  if (!req.body.events || req.body.events.length === 0) {
    console.warn("No events received.");
    return res.status(200).send("No events.");
  }

  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Error processing event:", err);
      res.status(500).send("Error processing event");
    });
});

// イベント処理関数
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信したメッセージ: ${receivedMessage}`);

    try {
      const docRef = db.collection("message").doc(receivedMessage);
      const doc = await docRef.get();
      const responseMessage = doc.exists ? doc.data().response : "すみません、そのメッセージには対応できません。";

      return sendResponse(event.replyToken, responseMessage);
    } catch (error) {
      console.error("Error accessing Firestore:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "データ取得中にエラーが発生しました。",
      });
    }
  }

  // ポストバックイベントの処理
  if (event.type === "postback") {
    const postbackData = event.postback.data;

    if (postbackData.startsWith("feedback:")) {
      const feedback = postbackData.replace("feedback:", "");
      console.log(`Feedback received: ${feedback}`);

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
        console.error("Error saving feedback:", error);
        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "フィードバックの保存中にエラーが発生しました。",
        });
      }
    }
  }
}

// レスポンス送信関数（画像 or テキストを判定して送信）
function sendResponse(replyToken, responseMessage) {
  if (responseMessage.startsWith("http")) {
    return client.replyMessage(replyToken, {
      type: "template",
      altText: "画像を送信しました。フィードバックをお願いします。",
      template: {
        type: "buttons",
        text: "この画像は参考になりましたか？",
        thumbnailImageUrl: responseMessage,
        actions: [
          { type: "postback", label: "役に立った", data: "feedback:役に立った" },
          { type: "postback", label: "役に立たなかった", data: "feedback:役に立たなかった" },
        ],
      },
    });
  } else {
    return client.replyMessage(replyToken, {
      type: "template",
      altText: "フィードバックをお願いします。",
      template: {
        type: "buttons",
        text: responseMessage,
        actions: [
          { type: "postback", label: "役に立った", data: "feedback:役に立った" },
          { type: "postback", label: "役に立たなかった", data: "feedback:役に立たなかった" },
        ],
      },
    });
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
