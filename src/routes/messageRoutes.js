const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  getConversations,
  getConversationMessages,
  sendMessage,
} = require('../controllers/messageController');

const router = express.Router();

router.get('/conversations', authMiddleware, getConversations);
router.get('/conversations/:userId', authMiddleware, getConversationMessages);
router.post('/', authMiddleware, sendMessage);

module.exports = router;
