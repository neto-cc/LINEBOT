const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
require("dotenv").config();

const app = express();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// Firebaseキーの読み込み
const firebaseKey = process.env.FIREBASE_KEY_PATH;
let firebaseServiceAccount;

try {
  firebaseServiceAccount = JSON.parse(firebaseKey);
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

// ? イベント処理関数（async を明示）
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信したメッセージ: ${receivedMessage}`);

    if (receivedMessage === "メニュー") {
      // クイックリプライの選択肢を送信
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "選択してください：",
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "message",
                label: "質問1",
                text: "質問1",
              },
            },
            {
              type: "action",
              action: {
                type: "message",
                label: "質問2",
                text: "質問2",
              },
            },
          ],
        },
      });
    }

    const docRef = db.collection("message").doc(receivedMessage);
    const doc = await docRef.get();

    if (doc.exists) {
      const responseMessage = doc.data().response;

      if (responseMessage.startsWith("http")) {
        return client.replyMessage(event.replyToken, {
          type: "image",
          originalContentUrl: responseMessage,
          previewImageUrl: responseMessage,
        });
      } else {
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

  // ? ポストバックイベントの処理（async 化）
  if (event.type === "postback") {
    return handlePostback(event);
  }
}

// ? ポストバック処理を async 関数として分離
async function handlePostback(event) {
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
        text: "エラーが発生しました。もう一度お試しください。",
      });
    }
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});