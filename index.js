const { Client, middleware } = require('@line/bot-sdk');
const express = require('express');
const axios = require('axios');
require('dotenv').config();
const admin = require('firebase-admin');

const app = express();

// Firebaseの設定
let firebaseServiceAccount;
try {
  firebaseServiceAccount = JSON.parse(process.env.FIREBASE_KEY_PATH);
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to parse Firebase key from environment variable:", error);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});

const db = admin.firestore();

// LINE Messaging APIの設定
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// LINEクライアントの作成
const client = new Client(config);

// Webhookエンドポイントの処理
app.use(middleware(config));
app.use(express.json());

// Webhookエンドポイント
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook event:', JSON.stringify(req.body, null, 2));

    const events = req.body.events;
    const results = await Promise.all(events.map(handleEvent));
    res.json(results);
  } catch (error) {
    console.error('Error processing event:', error);
    res.status(500).send('Internal Server Error');
  }
});

// イベント処理関数
async function handleEvent(event) {
  try {
    console.log("Received event:", event);

    if (event.type === 'message' && event.message.type === 'text') {
      const receivedMessage = event.message.text;
      console.log(`Received message: ${receivedMessage}`);

      const docRef = db.collection('message').doc(receivedMessage);
      const doc = await docRef.get();

      if (doc.exists) {
        const responseMessage = doc.data().response;
        console.log('Found response:', responseMessage);

        if (responseMessage.startsWith('http')) {
          // 画像URLの場合
          return client.replyMessage(event.replyToken, {
            type: 'image',
            originalContentUrl: responseMessage,
            previewImageUrl: responseMessage,
          });
        } else {
          // 通常のテキストメッセージ
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: responseMessage,
          });
        }
      } else {
        console.log('No response found for the message.');
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: "I'm sorry, I don't have a response for that.",
        });
      }
    }

    if (event.type === 'postback') {
      const postbackData = event.postback.data;
      if (postbackData.startsWith('feedback:')) {
        const feedback = postbackData.replace('feedback:', '');
        console.log(`Feedback received: ${feedback}`);

        await db.collection('feedback').add({
          feedback,
          timestamp: new Date(),
        });

        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'Thank you for your feedback!',
        });
      }
    }
  } catch (error) {
    console.error('Error handling event:', error);
    throw error;
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
