const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const admin = require('firebase-admin');

// 環境変数から Firebase の認証情報を取得
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const app = express();

app.use(middleware(config));
app.use(express.json());

// LINEクライアント
const client = new Client(config);

// Webhookエンドポイント
app.post('/webhook', async (req, res) => {
  try {
    const events = req.body.events;
    if (!events || events.length === 0) {
      return res.status(200).send('No events');
    }
    
    await Promise.all(events.map(handleEvent));

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing event:', error);
    res.status(500).send('Internal Server Error');
  }
});

async function handleEvent(event) {
  console.log('受信メッセージ:', event.message.text);

  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  try {
    const snapshot = await db.collection('messages').doc(event.message.text).get();
    if (!snapshot.exists) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'データが見つかりません。'
      });
    }

    const replyText = snapshot.data().response;
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText
    });

  } catch (error) {
    console.error('Error handling event:', error);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'エラーが発生しました。'
    });
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});