const { Client, middleware } = require("@line/bot-sdk");
const express = require("express");
const fs = require("fs");
require("dotenv").config();

const app = express();

// LINE Messaging API�̐ݒ�
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// Firebase�L�[�̓ǂݍ���
const firebaseKeyJSON = process.env.FIREBASE_KEY_PATH;

let firebaseServiceAccount;
try {
  // ���ϐ�����JSON���p�[�X����Firebase�T�[�r�X�A�J�E���g���擾
  firebaseServiceAccount = JSON.parse(firebaseKeyJSON);
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

// Content-Type�w�b�_�[��ݒ�
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// middleware�̓K�p
app.use(middleware(config));

// Webhook�G���h�|�C���g
app.post("/webhook", (req, res) => {
  console.log("Received webhook event:", JSON.stringify(req.body, null, 2));

  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error("Error processing event:", err);
      res.status(500).end();
    });
});

// �C�x���g�����֐�
async function handleEvent(event) {
  // �e�L�X�g���b�Z�[�W�̏���
  if (event.type === "message" && event.message.type === "text") {
    const receivedMessage = event.message.text;
    console.log(`��M���� ���b�Z�[�W: ${receivedMessage}`);

    // �ʏ�̃��b�Z�[�W����
    const docRef = db.collection("message").doc(receivedMessage);
    const doc = await docRef.get();

    if (doc.exists) {
      const responseMessage = doc.data().response;
      console.log(`Response found: ${responseMessage}`);

      // �N�C�b�N���v���C���܂މ������b�Z�[�W
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: responseMessage,
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "postback", // postback�A�N�V�����ɕύX
                label: "���ɗ�����",
                data: "feedback:���ɗ�����", // �t�B�[�h�o�b�N�f�[�^
              },
            },
            {
              type: "action",
              action: {
                type: "postback", // postback�A�N�V�����ɕύX
                label: "���ɗ����Ȃ�����",
                data: "feedback:���ɗ����Ȃ�����", // �t�B�[�h�o�b�N�f�[�^
              },
            },
          ],
        },
      });
    } else {
      console.log("No response found for the message.");
      return client.replyMessage(event.replyToken, {
        type: "text",
        text: "���݂܂���A���̃��b�Z�[�W�ɂ͑Ή��ł��܂���B",
      });
    }
  }

  // �|�X�g�o�b�N�C�x���g�̏���
  if (event.type === "postback") {
    const postbackData = event.postback.data;

    // �t�B�[�h�o�b�N�f�[�^�̏���
    if (postbackData.startsWith("feedback:")) {
      const feedback = postbackData.replace("feedback:", "");
      console.log(`Feedback received: ${feedback}`);

      // Firestore�ɕۑ�
      await db.collection("feedback").add({
        feedback,
        timestamp: new Date(),
      });

      // �t�B�[�h�o�b�N�̉���
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