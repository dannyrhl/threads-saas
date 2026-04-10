const express = require('express');
const {
  register,
  createDemoProfiles,
  login,
  me,
  updateMe,
} = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/demo-profiles', createDemoProfiles);
router.post('/login', login);
router.get('/me', authMiddleware, me);
router.patch('/me', authMiddleware, updateMe);

module.exports = router;
