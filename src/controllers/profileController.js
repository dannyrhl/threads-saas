const prisma = require('../config/prisma');
const { isBotEmail } = require('../services/botEngine');

function parseProfileId(req, res) {
  const profileId = Number(req.params.id);

  if (!Number.isInteger(profileId) || profileId <= 0) {
    res.status(400).json({ message: 'Invalid profile id' });
    return null;
  }

  return profileId;
}

function parseFollowRequestId(req, res) {
  const requestId = Number(req.params.requestId);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    res.status(400).json({ message: 'Invalid follow request id' });
    return null;
  }

  return requestId;
}

function toFollowState(follow) {
  if (!follow) return 'none';
  if (follow.status === 'accepted') return 'following';
  if (follow.status === 'pending') return 'requested';
  return 'none';
}

async function getAcceptedFollowerCountMap(profileIds) {
  if (!profileIds || profileIds.length === 0) return new Map();

  const grouped = await prisma.follow.groupBy({
    by: ['followingId'],
    where: {
      followingId: { in: profileIds },
      status: 'accepted',
    },
    _count: {
      _all: true,
    },
  });

  return new Map(grouped.map((entry) => [entry.followingId, entry._count._all]));
}

function formatActivityItem(item) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
  };
}

async function getDiscoverProfiles(req, res, next) {
  try {
    const profiles = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 12,
      include: {
        _count: {
          select: {
            threads: true,
          },
        },
        followers: {
          where: {
            followerId: req.user.id,
          },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });

    const profileIds = profiles.map((profile) => profile.id);
    const followerCountMap = await getAcceptedFollowerCountMap(profileIds);

    return res.status(200).json({
      profiles: profiles.map((profile) => {
        const follow = profile.followers[0] || null;
        const followState = toFollowState(follow);

        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          followerCount: followerCountMap.get(profile.id) || 0,
          threadCount: profile._count.threads,
          followState,
          isFollowing: followState === 'following',
          isBot: isBotEmail(profile.email),
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
}

async function getFollowingProfiles(req, res, next) {
  try {
    const following = await prisma.follow.findMany({
      where: {
        followerId: req.user.id,
        status: 'accepted',
      },
      orderBy: {
        respondedAt: 'desc',
      },
      take: 40,
      include: {
        following: {
          select: {
            id: true,
            name: true,
            email: true,
            _count: {
              select: {
                followers: {
                  where: {
                    status: 'accepted',
                  },
                },
                threads: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({
      profiles: following.map((item) => ({
        id: item.following.id,
        name: item.following.name,
        email: item.following.email,
        followerCount: item.following._count.followers,
        threadCount: item.following._count.threads,
        isBot: isBotEmail(item.following.email),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function getFollowersProfiles(req, res, next) {
  try {
    const followers = await prisma.follow.findMany({
      where: {
        followingId: req.user.id,
        status: 'accepted',
      },
      orderBy: {
        respondedAt: 'desc',
      },
      take: 40,
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            email: true,
            _count: {
              select: {
                followers: {
                  where: {
                    status: 'accepted',
                  },
                },
                threads: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({
      profiles: followers.map((item) => ({
        id: item.follower.id,
        name: item.follower.name,
        email: item.follower.email,
        followerCount: item.follower._count.followers,
        threadCount: item.follower._count.threads,
        isBot: isBotEmail(item.follower.email),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function toggleFollowProfile(req, res, next) {
  try {
    const profileId = parseProfileId(req, res);
    if (!profileId) {
      return;
    }

    if (profileId === req.user.id) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const profile = await prisma.user.findUnique({
      where: { id: profileId },
      select: { id: true, email: true },
    });

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    const isAiProfile = isBotEmail(profile.email);

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user.id,
          followingId: profileId,
        },
      },
      select: { id: true, status: true },
    });

    let followState = 'none';
    let message = 'Follow request canceled';

    if (!existing) {
      await prisma.follow.create({
        data: {
          followerId: req.user.id,
          followingId: profileId,
          status: isAiProfile ? 'accepted' : 'pending',
          respondedAt: isAiProfile ? new Date() : null,
        },
      });
      followState = isAiProfile ? 'following' : 'requested';
      message = isAiProfile ? 'You now follow this AI profile' : 'Follow request sent';
    } else if (existing.status === 'accepted') {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: req.user.id,
            followingId: profileId,
          },
        },
      });
      followState = 'none';
      message = 'Unfollowed profile';
    } else if (existing.status === 'pending') {
      if (isAiProfile) {
        await prisma.follow.update({
          where: {
            followerId_followingId: {
              followerId: req.user.id,
              followingId: profileId,
            },
          },
          data: {
            status: 'accepted',
            respondedAt: new Date(),
          },
        });
        followState = 'following';
        message = 'You now follow this AI profile';
      } else {
        await prisma.follow.delete({
          where: {
            followerId_followingId: {
              followerId: req.user.id,
              followingId: profileId,
            },
          },
        });
        followState = 'none';
        message = 'Follow request canceled';
      }
    } else {
      await prisma.follow.update({
        where: {
          followerId_followingId: {
            followerId: req.user.id,
            followingId: profileId,
          },
        },
        data: {
          status: isAiProfile ? 'accepted' : 'pending',
          respondedAt: isAiProfile ? new Date() : null,
        },
      });
      followState = isAiProfile ? 'following' : 'requested';
      message = isAiProfile ? 'You now follow this AI profile' : 'Follow request sent';
    }

    const followerCount = await prisma.follow.count({
      where: {
        followingId: profileId,
        status: 'accepted',
      },
    });

    return res.status(200).json({
      followState,
      isFollowing: followState === 'following',
      followerCount,
      message,
    });
  } catch (error) {
    return next(error);
  }
}

async function getIncomingFollowRequests(req, res, next) {
  try {
    const requests = await prisma.follow.findMany({
      where: {
        followingId: req.user.id,
        status: 'pending',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            email: true,
            _count: {
              select: {
                threads: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({
      requests: requests.map((request) => ({
        id: request.id,
        createdAt: request.createdAt,
        follower: {
          id: request.follower.id,
          name: request.follower.name,
          email: request.follower.email,
          threadCount: request.follower._count.threads,
          isBot: isBotEmail(request.follower.email),
        },
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function respondToFollowRequest(req, res, next) {
  try {
    const requestId = parseFollowRequestId(req, res);
    if (!requestId) {
      return;
    }

    const action = req.params.action === 'accept' ? 'accept' : req.params.action === 'reject' ? 'reject' : null;

    if (!action) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const request = await prisma.follow.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        followingId: true,
        followerId: true,
      },
    });

    if (!request || request.followingId !== req.user.id) {
      return res.status(404).json({ message: 'Follow request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(409).json({ message: 'Follow request already handled' });
    }

    const status = action === 'accept' ? 'accepted' : 'rejected';

    await prisma.follow.update({
      where: { id: requestId },
      data: {
        status,
        respondedAt: new Date(),
      },
    });

    const followerCount = await prisma.follow.count({
      where: {
        followingId: req.user.id,
        status: 'accepted',
      },
    });

    return res.status(200).json({
      success: true,
      status,
      followerCount,
      followRequestId: requestId,
      followerId: request.followerId,
    });
  } catch (error) {
    return next(error);
  }
}

async function getActivity(req, res, next) {
  try {
    const [pendingRequests, replies, reposts, likes, messages] = await Promise.all([
      prisma.follow.findMany({
        where: {
          followingId: req.user.id,
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          follower: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.reply.findMany({
        where: {
          thread: {
            authorId: req.user.id,
          },
          authorId: {
            not: req.user.id,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          thread: {
            select: {
              id: true,
              content: true,
            },
          },
        },
      }),
      prisma.repost.findMany({
        where: {
          thread: {
            authorId: req.user.id,
          },
          userId: {
            not: req.user.id,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          thread: {
            select: {
              id: true,
              content: true,
            },
          },
        },
      }),
      prisma.like.findMany({
        where: {
          thread: {
            authorId: req.user.id,
          },
          userId: {
            not: req.user.id,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          thread: {
            select: {
              id: true,
              content: true,
            },
          },
        },
      }),
      prisma.directMessage.findMany({
        where: {
          recipientId: req.user.id,
          senderId: {
            not: req.user.id,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const requestItems = pendingRequests.map((entry) => formatActivityItem({
      id: `follow-request-${entry.id}`,
      category: 'Anfragen',
      title: `${isBotEmail(entry.follower.email) ? 'AI ' : ''}${entry.follower.name} möchte dir folgen`,
      detail: isBotEmail(entry.follower.email)
        ? 'KI-Profil möchte deinen Content sehen.'
        : `@${entry.follower.email.split('@')[0]} hat dir eine Anfrage geschickt.`,
      createdAt: entry.createdAt,
      followRequestId: entry.id,
      actor: entry.follower,
    }));

    const replyItems = replies.map((entry) => formatActivityItem({
      id: `reply-${entry.id}`,
      category: 'Unterhaltungen',
      title: `${isBotEmail(entry.author.email) ? 'AI ' : ''}${entry.author.name} hat auf deinen Thread geantwortet`,
      detail: `"${entry.content.slice(0, 90)}${entry.content.length > 90 ? '...' : ''}"`,
      createdAt: entry.createdAt,
      actor: entry.author,
      threadId: entry.thread.id,
    }));

    const likeItems = likes.map((entry) => formatActivityItem({
      id: `like-${entry.id}`,
      category: 'Unterhaltungen',
      title: `${isBotEmail(entry.user.email) ? 'AI ' : ''}${entry.user.name} hat deinen Thread geliked`,
      detail: `Thread: "${entry.thread.content.slice(0, 80)}${entry.thread.content.length > 80 ? '...' : ''}"`,
      createdAt: entry.createdAt,
      actor: entry.user,
      threadId: entry.thread.id,
    }));

    const repostItems = reposts.map((entry) => formatActivityItem({
      id: `repost-${entry.id}`,
      category: 'Reposts',
      title: `${isBotEmail(entry.user.email) ? 'AI ' : ''}${entry.user.name} hat deinen Beitrag repostet`,
      detail: `Thread: "${entry.thread.content.slice(0, 80)}${entry.thread.content.length > 80 ? '...' : ''}"`,
      createdAt: entry.createdAt,
      actor: entry.user,
      threadId: entry.thread.id,
    }));

    const messageItems = messages.map((entry) => formatActivityItem({
      id: `dm-${entry.id}`,
      category: 'Unterhaltungen',
      title: `${isBotEmail(entry.sender.email) ? 'AI ' : ''}${entry.sender.name} hat dir geschrieben`,
      detail: `"${entry.content.slice(0, 90)}${entry.content.length > 90 ? '...' : ''}"`,
      createdAt: entry.createdAt,
      actor: entry.sender,
    }));

    const items = [...requestItems, ...replyItems, ...likeItems, ...repostItems, ...messageItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 60);

    return res.status(200).json({ items });
  } catch (error) {
    return next(error);
  }
}

async function getMyProfileContent(req, res, next) {
  try {
    const tab = ['threads', 'answers', 'media', 'reposts'].includes(req.query.tab)
      ? req.query.tab
      : 'threads';

    if (tab === 'answers') {
      const answers = await prisma.reply.findMany({
        where: { authorId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          thread: {
            select: {
              id: true,
              content: true,
            },
          },
        },
      });

      return res.status(200).json({ tab, items: answers });
    }

    if (tab === 'reposts') {
      const reposts = await prisma.repost.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          thread: {
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
          },
        },
      });

      return res.status(200).json({
        tab,
        items: reposts.map((entry) => ({
          ...entry.thread,
          likeCount: entry.thread._count.likes,
          replyCount: entry.thread._count.replies,
          repostCount: entry.thread._count.reposts,
        })),
      });
    }

    const where = {
      authorId: req.user.id,
      ...(tab === 'media'
        ? {
          mediaUrl: {
            not: null,
          },
        }
        : {}),
    };

    const threads = await prisma.thread.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 40,
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

    return res.status(200).json({
      tab,
      items: threads.map((thread) => ({
        ...thread,
        likeCount: thread._count.likes,
        replyCount: thread._count.replies,
        repostCount: thread._count.reposts,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function getProfileById(req, res, next) {
  try {
    const profileId = parseProfileId(req, res);
    if (!profileId) {
      return;
    }

    const profile = await prisma.user.findUnique({
      where: { id: profileId },
      include: {
        _count: {
          select: {
            threads: true,
            reposts: true,
          },
        },
        followers: {
          where: {
            followerId: req.user.id,
          },
          take: 1,
          select: { id: true, status: true },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const followerCount = await prisma.follow.count({
      where: {
        followingId: profileId,
        status: 'accepted',
      },
    });

    const followState = toFollowState(profile.followers[0] || null);

    return res.status(200).json({
      profile: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        followerCount,
        threadCount: profile._count.threads,
        repostCount: profile._count.reposts,
        followState,
        isFollowing: followState === 'following',
        isBot: isBotEmail(profile.email),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getProfileContentById(req, res, next) {
  try {
    const profileId = parseProfileId(req, res);
    if (!profileId) {
      return;
    }

    const tab = ['threads', 'answers', 'media', 'reposts'].includes(req.query.tab)
      ? req.query.tab
      : 'threads';

    if (tab === 'answers') {
      const answers = await prisma.reply.findMany({
        where: { authorId: profileId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          thread: {
            select: {
              id: true,
              content: true,
            },
          },
        },
      });

      return res.status(200).json({ tab, items: answers });
    }

    if (tab === 'reposts') {
      const reposts = await prisma.repost.findMany({
        where: { userId: profileId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: {
          thread: {
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
          },
        },
      });

      return res.status(200).json({
        tab,
        items: reposts.map((entry) => ({
          ...entry.thread,
          likeCount: entry.thread._count.likes,
          replyCount: entry.thread._count.replies,
          repostCount: entry.thread._count.reposts,
        })),
      });
    }

    const where = {
      authorId: profileId,
      ...(tab === 'media'
        ? {
          mediaUrl: {
            not: null,
          },
        }
        : {}),
    };

    const threads = await prisma.thread.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 40,
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

    return res.status(200).json({
      tab,
      items: threads.map((thread) => ({
        ...thread,
        likeCount: thread._count.likes,
        replyCount: thread._count.replies,
        repostCount: thread._count.reposts,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
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
};
