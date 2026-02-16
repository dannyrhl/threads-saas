const express = require('express');
const {
  createThread,
  getAllThreads,
  deleteOwnThread,
  likeThread,
  unlikeThread,
} = require('../controllers/threadController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', getAllThreads);
router.post('/', authMiddleware, createThread);
router.delete('/:id', authMiddleware, deleteOwnThread);
router.post('/:id/likes', authMiddleware, likeThread);
router.delete('/:id/likes', authMiddleware, unlikeThread);

module.exports = router;
