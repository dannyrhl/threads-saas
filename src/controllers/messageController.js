const prisma = require('../config/prisma');

function parseUserIdParam(req, res) {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ message: 'Invalid user id' });
    return null;
  }

  return userId;
}

async function getConversations(req, res, next) {
  try {
    const myUserId = req.user.id;

    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: myUserId },
          { recipientId: myUserId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
      },
      take: 250,
    });

    const conversationMap = new Map();

    messages.forEach((message) => {
      const otherUser = message.senderId === myUserId ? message.recipient : message.sender;
      if (!otherUser) {
        return;
      }

      if (!conversationMap.has(otherUser.id)) {
        conversationMap.set(otherUser.id, {
          user: otherUser,
          lastMessage: message,
        });
      }
    });

    return res.status(200).json({
      conversations: Array.from(conversationMap.values()),
    });
  } catch (error) {
    return next(error);
  }
}

async function getConversationMessages(req, res, next) {
  try {
    const myUserId = req.user.id;
    const otherUserId = parseUserIdParam(req, res);

    if (!otherUserId) {
      return;
    }

    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, name: true, email: true },
    });

    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          {
            senderId: myUserId,
            recipientId: otherUserId,
          },
          {
            senderId: otherUserId,
            recipientId: myUserId,
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
      },
      take: 200,
    });

    return res.status(200).json({
      user: otherUser,
      messages,
    });
  } catch (error) {
    return next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    const myUserId = req.user.id;
    const { recipientId, content } = req.body;

    const parsedRecipientId = Number(recipientId);

    if (!Number.isInteger(parsedRecipientId) || parsedRecipientId <= 0) {
      return res.status(400).json({ message: 'Valid recipientId is required' });
    }

    if (parsedRecipientId === myUserId) {
      return res.status(400).json({ message: 'Cannot send message to yourself' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'content is required' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ message: 'content must be 1000 characters or fewer' });
    }

    const recipient = await prisma.user.findUnique({
      where: { id: parsedRecipientId },
      select: { id: true },
    });

    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    const message = await prisma.directMessage.create({
      data: {
        senderId: myUserId,
        recipientId: parsedRecipientId,
        content: content.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        recipient: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({ message });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getConversations,
  getConversationMessages,
  sendMessage,
};
