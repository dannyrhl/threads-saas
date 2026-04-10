const { Prisma } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { BOT_DOMAIN } = require('../services/botEngine');

function parsePositiveInt(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseDreaddId(req, res) {
  const threadId = parsePositiveInt(req.params.id);

  if (!threadId) {
    res.status(400).json({ message: 'Invalid thread id' });
    return null;
  }

  return threadId;
}

function parseReplyId(req, res) {
  const replyId = parsePositiveInt(req.params.replyId);

  if (!replyId) {
    res.status(400).json({ message: 'Invalid reply id' });
    return null;
  }

  return replyId;
}

function getAuthenticatedUserIdFromHeader(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.userId;
  } catch {
    return null;
  }
}

function normalizeMediaInput(body) {
  const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
  const mediaType = typeof body.mediaType === 'string' ? body.mediaType.trim().toLowerCase() : '';

  if (!mediaUrl && !mediaType) {
    return { mediaUrl: null, mediaType: null, error: null };
  }

  if (!mediaUrl || !mediaType) {
    return { mediaUrl: null, mediaType: null, error: 'mediaUrl and mediaType must be provided together' };
  }

  if (!['photo', 'video'].includes(mediaType)) {
    return { mediaUrl: null, mediaType: null, error: 'mediaType must be photo or video' };
  }

  if (mediaUrl.length > 4_500_000) {
    return { mediaUrl: null, mediaType: null, error: 'mediaUrl is too large for mobile performance' };
  }

  return { mediaUrl, mediaType, error: null };
}

function buildReplyTree(replies) {
  const replyMap = new Map();

  replies.forEach((reply) => {
    replyMap.set(reply.id, {
      ...reply,
      childReplies: [],
    });
  });

  const roots = [];

  replies.forEach((reply) => {
    const currentReply = replyMap.get(reply.id);

    if (reply.parentReplyId) {
      const parentReply = replyMap.get(reply.parentReplyId);

      if (parentReply) {
        parentReply.childReplies.push(currentReply);
        return;
      }
    }

    roots.push(currentReply);
  });

  return roots;
}

async function mapDreaddsWithReplies(threads, authenticatedUserId) {
  if (threads.length === 0) {
    return [];
  }

  const threadIds = threads.map((thread) => thread.id);
  const replies = await prisma.reply.findMany({
    where: {
      threadId: {
        in: threadIds,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    include: authenticatedUserId
      ? {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
        likes: {
          where: { userId: authenticatedUserId },
          select: { id: true },
          take: 1,
        },
      }
      : {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
      },
  });

  const repliesByThreadId = new Map();

  threadIds.forEach((id) => {
    repliesByThreadId.set(id, []);
  });

  replies.forEach((reply) => {
    const { _count, likes, ...replyData } = reply;
    const bucket = repliesByThreadId.get(reply.threadId);
    if (bucket) {
      bucket.push({
        ...replyData,
        likeCount: _count.likes,
        likedByMe: Boolean(authenticatedUserId && likes && likes.length > 0),
      });
    }
  });

  return threads.map((thread) => {
    const { _count, likes, reposts, ...threadData } = thread;
    const threadReplies = repliesByThreadId.get(thread.id) || [];

    return {
      ...threadData,
      likeCount: _count.likes,
      replyCount: _count.replies,
      repostCount: _count.reposts || 0,
      replies: buildReplyTree(threadReplies),
      likedByMe: Boolean(authenticatedUserId && likes && likes.length > 0),
      repostedByMe: Boolean(authenticatedUserId && reposts && reposts.length > 0),
    };
  });
}

async function createDreadd(req, res, next) {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'content is required' });
    }

    if (content.length > 280) {
      return res.status(400).json({ message: 'content must be 280 characters or fewer' });
    }

    const mediaInput = normalizeMediaInput(req.body);
    if (mediaInput.error) {
      return res.status(400).json({ message: mediaInput.error });
    }

    const thread = await prisma.thread.create({
      data: {
        content: content.trim(),
        authorId: req.user.id,
        mediaUrl: mediaInput.mediaUrl,
        mediaType: mediaInput.mediaType,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            likes: true,
            replies: true,
            reposts: true,
          },
        },
      },
    });

    const { _count, ...threadData } = thread;

    return res.status(201).json({
      thread: {
        ...threadData,
        likeCount: _count.likes,
        replyCount: _count.replies,
        repostCount: _count.reposts || 0,
        replies: [],
        likedByMe: false,
        repostedByMe: false,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getAllDreadds(req, res, next) {
  try {
    const FEED_LIMIT = 35;
    const authenticatedUserId = getAuthenticatedUserIdFromHeader(req);
    const mode = req.query.mode === 'following' ? 'following' : 'forYou';

    const includeBase = {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          likes: true,
          replies: true,
          reposts: true,
        },
      },
    };

    const nonBotAuthorWhere = {
      author: {
        NOT: [
          { email: { endsWith: `@${BOT_DOMAIN}` } },
          { email: { endsWith: `.${BOT_DOMAIN}` } },
        ],
      },
    };

    let where = { ...nonBotAuthorWhere };

    if (mode === 'following') {
      if (!authenticatedUserId) {
        return res.status(200).json({ threads: [] });
      }

      const follows = await prisma.follow.findMany({
        where: {
          followerId: authenticatedUserId,
          status: 'accepted',
        },
        select: { followingId: true },
      });

      const followedIds = follows.map((follow) => follow.followingId);

      if (followedIds.length === 0) {
        return res.status(200).json({ threads: [] });
      }

      where = {
        ...nonBotAuthorWhere,
        authorId: {
          in: followedIds,
        },
      };
    }

    const threads = await prisma.thread.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: FEED_LIMIT,
      include: authenticatedUserId
        ? {
          ...includeBase,
          likes: {
            where: { userId: authenticatedUserId },
            select: { id: true },
            take: 1,
          },
          reposts: {
            where: { userId: authenticatedUserId },
            select: { id: true },
            take: 1,
          },
        }
        : includeBase,
    });

    return res.status(200).json({
      threads: await mapDreaddsWithReplies(threads, authenticatedUserId),
    });
  } catch (error) {
    return next(error);
  }
}

async function createReply(req, res, next) {
  try {
    const threadId = parseDreaddId(req, res);
    if (!threadId) {
      return;
    }

    const { content, parentReplyId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'content is required' });
    }

    if (content.length > 280) {
      return res.status(400).json({ message: 'content must be 280 characters or fewer' });
    }

    const parsedParentReplyId = parentReplyId == null ? null : parsePositiveInt(parentReplyId);

    if (parentReplyId != null && !parsedParentReplyId) {
      return res.status(400).json({ message: 'Invalid parent reply id' });
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (parsedParentReplyId) {
      const parentReply = await prisma.reply.findFirst({
        where: {
          id: parsedParentReplyId,
          threadId,
        },
        select: { id: true },
      });

      if (!parentReply) {
        return res.status(404).json({ message: 'Parent reply not found in this thread' });
      }
    }

    const reply = await prisma.reply.create({
      data: {
        content: content.trim(),
        threadId,
        authorId: req.user.id,
        parentReplyId: parsedParentReplyId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const replyCount = await prisma.reply.count({
      where: { threadId },
    });

    return res.status(201).json({
      reply: {
        ...reply,
        likeCount: 0,
        likedByMe: false,
        childReplies: [],
      },
      replyCount,
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteOwnDreadd(req, res, next) {
  try {
    const threadId = parseDreaddId(req, res);
    if (!threadId) {
      return;
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, authorId: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (thread.authorId !== req.user.id) {
      return res.status(403).json({ message: 'Thread does not belong to the authenticated user' });
    }

    await prisma.thread.delete({
      where: { id: threadId },
    });

    return res.status(204).send();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2025'
    ) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    return next(error);
  }
}

async function updateOwnDreadd(req, res, next) {
  try {
    const threadId = parseDreaddId(req, res);
    if (!threadId) {
      return;
    }

    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'content is required' });
    }

    if (content.length > 280) {
      return res.status(400).json({ message: 'content must be 280 characters or fewer' });
    }

    const mediaInput = normalizeMediaInput(req.body);
    if (mediaInput.error) {
      return res.status(400).json({ message: mediaInput.error });
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true, authorId: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    if (thread.authorId !== req.user.id) {
      return res.status(403).json({ message: 'Thread does not belong to the authenticated user' });
    }

    const updatedThread = await prisma.thread.update({
      where: { id: threadId },
      data: {
        content: content.trim(),
        mediaUrl: mediaInput.mediaUrl,
        mediaType: mediaInput.mediaType,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            likes: true,
            replies: true,
            reposts: true,
          },
        },
      },
    });

    const hasLike = await prisma.like.findUnique({
      where: {
        userId_threadId: {
          userId: req.user.id,
          threadId,
        },
      },
      select: { id: true },
    });
    const hasRepost = await prisma.repost.findUnique({
      where: {
        userId_threadId: {
          userId: req.user.id,
          threadId,
        },
      },
      select: { id: true },
    });

    const replies = await prisma.reply.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
        likes: {
          where: { userId: req.user.id },
          select: { id: true },
          take: 1,
        },
      },
    });

    const { _count, ...threadData } = updatedThread;

    return res.status(200).json({
      thread: {
        ...threadData,
        likeCount: _count.likes,
        replyCount: _count.replies,
        repostCount: _count.reposts || 0,
        replies: buildReplyTree(replies.map((reply) => {
          const { _count: replyCount, likes, ...replyData } = reply;
          return {
            ...replyData,
            likeCount: replyCount.likes,
            likedByMe: Boolean(likes && likes.length > 0),
          };
        })),
        likedByMe: Boolean(hasLike),
        repostedByMe: Boolean(hasRepost),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === 'P2025'
    ) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    return next(error);
  }
}

async function toggleLikeDreadd(req, res, next) {
  try {
    const threadId = parseDreaddId(req, res);
    if (!threadId) {
      return;
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const existingLike = await prisma.like.findUnique({
      where: {
        userId_threadId: {
          userId: req.user.id,
          threadId,
        },
      },
      select: { id: true },
    });

    let liked;

    if (existingLike) {
      await prisma.like.delete({
        where: {
          userId_threadId: {
            userId: req.user.id,
            threadId,
          },
        },
      });
      liked = false;
    } else {
      await prisma.like.create({
        data: {
          userId: req.user.id,
          threadId,
        },
      });
      liked = true;
    }

    const likeCount = await prisma.like.count({
      where: { threadId },
    });

    return res.status(200).json({ likeCount, liked });
  } catch (error) {
    return next(error);
  }
}

async function toggleRepostDreadd(req, res, next) {
  try {
    const threadId = parseDreaddId(req, res);
    if (!threadId) {
      return;
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const existingRepost = await prisma.repost.findUnique({
      where: {
        userId_threadId: {
          userId: req.user.id,
          threadId,
        },
      },
      select: { id: true },
    });

    let reposted;

    if (existingRepost) {
      await prisma.repost.delete({
        where: {
          userId_threadId: {
            userId: req.user.id,
            threadId,
          },
        },
      });
      reposted = false;
    } else {
      await prisma.repost.create({
        data: {
          userId: req.user.id,
          threadId,
        },
      });
      reposted = true;
    }

    const repostCount = await prisma.repost.count({
      where: { threadId },
    });

    return res.status(200).json({ repostCount, reposted });
  } catch (error) {
    return next(error);
  }
}

async function toggleLikeReply(req, res, next) {
  try {
    const replyId = parseReplyId(req, res);
    if (!replyId) {
      return;
    }

    const reply = await prisma.reply.findUnique({
      where: { id: replyId },
      select: { id: true },
    });

    if (!reply) {
      return res.status(404).json({ message: 'Reply not found' });
    }

    const existingLike = await prisma.replyLike.findUnique({
      where: {
        userId_replyId: {
          userId: req.user.id,
          replyId,
        },
      },
      select: { id: true },
    });

    let liked;

    if (existingLike) {
      await prisma.replyLike.delete({
        where: {
          userId_replyId: {
            userId: req.user.id,
            replyId,
          },
        },
      });
      liked = false;
    } else {
      await prisma.replyLike.create({
        data: {
          userId: req.user.id,
          replyId,
        },
      });
      liked = true;
    }

    const likeCount = await prisma.replyLike.count({
      where: { replyId },
    });

    return res.status(200).json({ likeCount, liked });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createDreadd,
  getAllDreadds,
  createReply,
  deleteOwnDreadd,
  updateOwnDreadd,
  toggleLikeDreadd,
  toggleRepostDreadd,
  toggleLikeReply,
};
