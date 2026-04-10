const express = require('express');
const {
  getDiscoverProfiles,
  getFollowingProfiles,
  getFollowersProfiles,
  toggleFollowProfile,
  getIncomingFollowRequests,
  respondToFollowRequest,
  getActivity,
  getMyProfileContent,
  getProfileById,
  getProfileContentById,
} = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/discover', authMiddleware, getDiscoverProfiles);
router.get('/following', authMiddleware, getFollowingProfiles);
router.get('/followers', authMiddleware, getFollowersProfiles);
router.get('/activity', authMiddleware, getActivity);
router.get('/follow-requests', authMiddleware, getIncomingFollowRequests);
router.post('/follow-requests/:requestId/:action', authMiddleware, respondToFollowRequest);
router.get('/me/content', authMiddleware, getMyProfileContent);
router.get('/:id', authMiddleware, getProfileById);
router.get('/:id/content', authMiddleware, getProfileContentById);
router.post('/:id/follow-toggle', authMiddleware, toggleFollowProfile);

module.exports = router;
