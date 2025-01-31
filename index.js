const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const fs = require("fs");
require("dotenv").config();
const cors = require("cors");

const app = express();

// LINE Messaging API�̐ݒ�
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// ���ϐ��̊m�F
if (!config.channelSecret || !config.channelAccessToken) {
  console.error("LINE API credentials are missing in environment variables.");
  process.exit(1);
}

// Firebase�L�[�̓ǂݍ���
const firebaseKeyPath = process.env.FIREBASE_KEY_PATH || "/etc/secrets/FIREBASE_KEY_PATH";
let firebaseServiceAccount;

try {
  firebaseServiceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, "utf-8"));
  console.log("Firebase key loaded successfully.");
} catch (error) {
  console.error("Failed to load Firebase key:", error);
  process.exit(1);
}

// Firebase Admin SDK�̏�����
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(firebaseServiceAccount),
});

const db = admin.firestore();

// LINE�N���C�A���g�̍쐬
const client = new Client(config);

// CORS�ݒ�
app.use(cors());

// middleware�̓K�p
app.use(express.json());
app.use(middleware(config));

// Webhook�G���h�|�C���g
app.post("/webhook", async (req, res) => {
  console.log("Received webhook event:", JSON.stringify(req.body, null, 2));

  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    console.log("Webhook processed successfully:", results);
    res.json(results); // ����ɉ�����Ԃ�
  } catch (err) {
    console.error("Error processing event:", err);
    res.status(500).send({ error: "Error processing event", details: err.message });
  }
});

// �C�x���g�����֐�
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`Received message: ${receivedMessage}`);

    return client.replyMessage(event.replyToken, {
      type: "text",
      text: `���Ȃ��̃��b�Z�[�W: ${receivedMessage}`,
    });
  }

  // �|�X�g�o�b�N�C�x���g�̏���
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
        text: "�����͂��肪�Ƃ��������܂��I",
      });
    }
  }
}

// �T�[�o�[�N��
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});