const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
require("dotenv").config();

const app = express();

// === LINE Messaging APIの設定 ===
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// 環境変数のチェック
if (!config.channelSecret || !config.channelAccessToken) {
  console.error("? Missing LINE API credentials. Please check your environment variables.");
  process.exit(1);
}

// === Firebaseの設定 & 初期化 ===
const firebaseKey = process.env.FIREBASE_KEY;
let firebaseServiceAccount;

try {
  if (!firebaseKey) {
    throw new Error("FIREBASE_KEY is not defined in the environment variables.");
  }
  firebaseServiceAccount = JSON.parse(firebaseKey);
  console.log("? Firebase key loaded successfully.");
} catch (error) {
  console.error("? Failed to load Firebase key:", error.message);
  process.exit(1);
}

const admin = require("firebase-admin");
try {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseServiceAccount),
  });
  console.log("? Firebase initialized successfully.");
} catch (error) {
  console.error("? Failed to initialize Firebase:", error.message);
  process.exit(1);
}

const db = admin.firestore();

// === LINEクライアントの作成 ===
const client = new Client(config);

// === middleware の適用（順番に注意！） ===
app.use(middleware(config)); // ?? これを最優先で適用

// Webhookエンドポイント専用のルート（署名検証を通すために `express.json()` を適用しない）
app.post("/webhook", async (req, res) => {
  console.log("?? Received webhook event:", JSON.stringify(req.body, null, 2));

  if (!req.body.events || req.body.events.length === 0) {
    console.warn("? No events received.");
    return res.status(200).send("No events.");
  }

  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).send("OK");
  } catch (err) {
    console.error("? Error processing event:", err);
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

// === レスポンス送信関数（画像 or テキストを判定して送信） ===
function sendResponse(replyToken, responseMessage) {
  const message =
    responseMessage.startsWith("http")
      ? {
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
        }
      : {
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
        };

  return client.replyMessage(replyToken, message);
}

// === サーバー起動 ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`?? Server is running on port ${PORT}`);
});
