const express = require('express');
const {
  createDreadd,
  getAllDreadds,
  createReply,
  deleteOwnDreadd,
  updateOwnDreadd,
  toggleLikeDreadd,
  toggleRepostDreadd,
  toggleLikeReply,
} = require('../controllers/threadController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', getAllDreadds);
router.post('/', authMiddleware, createDreadd);
router.post('/:id/replies', authMiddleware, createReply);
router.patch('/:id', authMiddleware, updateOwnDreadd);
router.delete('/:id', authMiddleware, deleteOwnDreadd);
router.post('/:id/likes/toggle', authMiddleware, toggleLikeDreadd);
router.post('/:id/reposts/toggle', authMiddleware, toggleRepostDreadd);
router.post('/replies/:replyId/likes/toggle', authMiddleware, toggleLikeReply);

module.exports = router;
