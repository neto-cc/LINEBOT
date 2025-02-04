require("dotenv").config();
const path = require("path");
const express = require("express");
const line = require("@line/bot-sdk");

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'base64').toString('utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Firebase の初期化
admin.initializeApp({
  credential: admin.credential.cert(path.resolve(keyPath)),
});
const db = admin.firestore();

// LINEの設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();
app.use(express.json());

// LINE Webhookエンドポイント
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events;
    console.log("Received events:", JSON.stringify(events, null, 2));

    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  console.log("Processing event:", JSON.stringify(event, null, 2));

  if (event.type === "message" && event.message.type === "text") {
    return handleMessageEvent(event);
  }
  if (event.type === "postback") {
    return handlePostbackEvent(event);
  }

  return Promise.resolve(null);
}

async function handleMessageEvent(event) {
  const receivedMessage = event.message.text;
  console.log(`受信したメッセージ: ${receivedMessage}`);

  const docRef = db.collection("message").doc(receivedMessage);
  const doc = await docRef.get();

  if (doc.exists) {
    const responseMessage = doc.data().response;

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
              data: `feedback:役に立った|${receivedMessage}`,
            },
          },
          {
            type: "action",
            action: {
              type: "postback",
              label: "役に立たなかった",
              data: `feedback:役に立たなかった|${receivedMessage}`,
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

async function handlePostbackEvent(event) {
  const postbackData = event.postback.data;
  console.log("Postback data received:", postbackData);

  if (postbackData.startsWith("feedback:")) {
    const [_, feedback, message] = postbackData.split("|");
    console.log(`Feedback received: ${feedback} for message: ${message}`);

    try {
      const feedbackDocRef = await db.collection("feedback").add({
        feedback,
        message,
        timestamp: new Date(),
      });
      console.log("Feedback successfully saved to Firestore:", feedbackDocRef.id);

      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "ご協力ありがとうございます！",
      });
    } catch (error) {
      console.error("Failed to save feedback:", error);
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "フィードバックの保存に失敗しました。",
      });
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});