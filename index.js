const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
require('dotenv').config();

const app = express();

// LINE Messaging API�̐ݒ�
const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

// LINE�N���C�A���g�̍쐬
const client = new Client(config);

// Content-Type�w�b�_�[��ݒ�i���������΍�j
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// middleware�̓K�p
app.use(middleware(config));

// Webhook�G���h�|�C���g�̐ݒ�
app.post('/webhook', (req, res) => {
  console.log("Received webhook event:", JSON.stringify(req.body, null, 2));

  // ��M�C�x���g�̏���
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Error processing event:', err);
      res.status(500).end();
    });
});

// �C�x���g�����֐�
async function handleEvent(event) {
  // postback�C�x���g�̏���
  if (event.type === 'postback') {
    const postbackData = event.postback.data;

    if (postbackData === 'feedback=useful') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '���ӌ����肪�Ƃ��������܂��I���ꂩ����撣��܂��B',
      });
    }

    if (postbackData === 'feedback=not_useful') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '���ӌ����肪�Ƃ��������܂��I���P�ɓw�߂܂��B',
      });
    }

    // �s����postback�f�[�^�ւ̑Ή�
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '�s���ȑI���ł��B������x���������������B',
    });
  }

  // ���b�Z�[�W�C�x���g�̏���
  if (event.type === 'message' && event.message.type === 'text') {
    const userMessage = event.message.text;

    // �N�ԍs���ɊY�����邩�`�F�b�N
    if (userMessage.includes('�N�ԍs��')) {
      const replyMessage = '�����炪�N�ԍs���̗\��ł�:\nhttps://www.iwaki-cc.ac.jp/app/wp-content/uploads/2024/04/2024%E5%B9%B4%E9%96%93%E8%A1%8C%E4%BA%8B%E4%BA%88%E5%AE%9A-_%E5%AD%A6%E7%94%9F%E7%94%A8.pdf';

      const feedbackTemplate = {
        type: 'template',
        altText: '�t�B�[�h�o�b�N�̂��肢',
        template: {
          type: 'buttons',
          text: '���̏��͖��ɗ����܂������H',
          actions: [
            {
              type: 'postback',
              label: '���ɗ�����',
              data: 'feedback=useful',
            },
            {
              type: 'postback',
              label: '���ɗ����Ȃ�����',
              data: 'feedback=not_useful',
            },
          ],
        },
      };

      return client.replyMessage(event.replyToken, [
        { type: 'text', text: replyMessage },
        feedbackTemplate,
      ]);
    }

    // �I�[�v���L�����p�X�ɊY�����邩�`�F�b�N
    if (userMessage.includes('�I�[�v���L�����p�X')) {
      const replyMessage = '�����炪�I�[�v���L�����p�X�̗\��ł�:\nhttps://www.iwaki-cc.ac.jp/app/wp-content/uploads/2024/04/%E3%83%9D%E3%82%B9%E3%82%BF%E3%83%BC%E6%9C%80%E7%B5%82PNG%E5%8C%96.png';

      const feedbackTemplate = {
        type: 'template',
        altText: '�t�B�[�h�o�b�N�̂��肢',
        template: {
          type: 'buttons',
          text: '���̏��͖��ɗ����܂������H',
          actions: [
            {
              type: 'postback',
              label: '���ɗ�����',
              data: 'feedback=useful',
            },
            {
              type: 'postback',
              label: '���ɗ����Ȃ�����',
              data: 'feedback=not_useful',
            },
          ],
        },
      };

      return client.replyMessage(event.replyToken, [
        { type: 'text', text: replyMessage },
        feedbackTemplate,
      ]);
    }

    // ����ȊO�̃��b�Z�[�W�ւ̉���
    const defaultReply = userMessage === '����ɂ���' ? '����˂�' : '���J���b�W';
    return client.replyMessage(event.replyToken, { type: 'text', text: defaultReply });
  }

  // ���̃C�x���g�͖���
  return Promise.resolve(null);
}

// �T�[�o�[�N��
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`�T�[�o�[�̓|�[�g${PORT}�Ŏ��s����Ă��܂�`);
});