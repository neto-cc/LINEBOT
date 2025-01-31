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

// ���ϐ��̃`�F�b�N
if (!config.channelSecret || !config.channelAccessToken) {
  console.error("? LINE API�̊��ϐ����s�����Ă��܂��B");
  process.exit(1);
}

// Firebase�L�[�̓ǂݍ���
const firebaseKeyPath = process.env.FIREBASE_KEY_PATH || "/etc/secrets/FIREBASE_KEY_PATH";
let firebaseServiceAccount;

if (fs.existsSync(firebaseKeyPath)) {
  try {
    firebaseServiceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, "utf-8"));
    console.log("? Firebase�L�[�̓ǂݍ��݂ɐ������܂����B");
  } catch (error) {
    console.error("? Firebase�L�[�̓ǂݍ��݂Ɏ��s���܂���:", error);
    process.exit(1);
  }
} else {
  console.error("? Firebase�L�[�̃p�X������������܂���:", firebaseKeyPath);
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

// ���[�g�G���h�|�C���g
app.get("/", (req, res) => {
  res.send("? LINE Bot �T�[�o�[������ɓ��삵�Ă��܂��B");
});

// Webhook�G���h�|�C���g
app.post("/webhook", async (req, res) => {
  console.log("?? Webhook�C�x���g����M:", JSON.stringify(req.body, null, 2));

  if (!req.body.events || req.body.events.length === 0) {
    return res.status(400).send({ message: "? �C�x���g������܂���B" });
  }

  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    console.log("? Webhook�C�x���g��������:", results);
    res.json(results);
  } catch (err) {
    console.error("? Webhook�C�x���g�������ɃG���[����:", err);
    res.status(500).send({ error: "Webhook�C�x���g�̏����Ɏ��s���܂���", details: err.message });
  }
});

// �C�x���g�����֐�
async function handleEvent(event) {
  try {
    console.log(`?? �C�x���g�^�C�v: ${event.type}`);

    if (event.type === "message" && event.message.type === "text") {
      const receivedMessage = event.message.text;
      console.log(`?? ��M���b�Z�[�W: ${receivedMessage}`);

      return client.replyMessage(event.replyToken, {
        type: "text",
        text: `���Ȃ��̃��b�Z�[�W: ${receivedMessage}`,
      });
    }

    if (event.type === "postback") {
      const postbackData = event.postback.data;

      if (postbackData.startsWith("feedback:")) {
        const feedback = postbackData.replace("feedback:", "");
        console.log(`?? �t�B�[�h�o�b�N��M: ${feedback}`);

        await db.collection("feedback").add({
          feedback,
          timestamp: new Date(),
        });

        return client.replyMessage(event.replyToken, {
          type: "text",
          text: "?? �t�B�[�h�o�b�N���肪�Ƃ��������܂��I",
        });
      }
    }

    return null;
  } catch (error) {
    console.error("? handleEvent�ŃG���[����:", error);
    return Promise.reject(error);
  }
}

// �T�[�o�[�N��
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`?? �T�[�o�[���|�[�g ${PORT} �ŋN�����܂����B`);