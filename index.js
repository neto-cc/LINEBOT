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

// イベント処理関数
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`受信したメッセージ: ${receivedMessage}`);

    const docRef = db.collection("message").doc(receivedMessage);
    const doc = await docRef.get();

    let responseMessage;
    if (doc.exists) {
      responseMessage = doc.data().response;
    } else {
      console.log("No response found for the message.");
      responseMessage = "すみません、そのメッセージには対応できません。";
    }

    // 画像メッセージかテキストメッセージを判別
    if (responseMessage.startsWith("http")) {
      // 画像URLの場合
      return client.replyMessage(event.replyToken, {
        type: "template",
        altText: "画像を送信しました。フィードバックをお願いします。",
        template: {
          type: "buttons",
          text: "この画像は参考になりましたか？",
          thumbnailImageUrl: responseMessage,
          actions: [
            {
              type: "postback",
              label: "役に立った",
              data: "feedback:役に立った"
            },
            {
              type: "postback",
              label: "役に立たなかった",
              data: "feedback:役に立たなかった"
            }
          ]
        }
      });
    } else {
      // テキストメッセージの場合
      return client.replyMessage(event.replyToken, {
        type: "template",
        altText: "フィードバックをお願いします。",
        template: {
          type: "buttons",
          text: responseMessage,
          actions: [
            {
              type: "postback",
              label: "役に立った",
              data: "feedback:役に立った"
            },
            {
              type: "postback",
              label: "役に立たなかった",
              data: "feedback:役に立たなかった"
            }
          ]
        }
      });
    }
  }

  // ポストバックイベントの処理
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
        text: "ご協力ありがとうございます！"
      });
    }
  }
}
// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});