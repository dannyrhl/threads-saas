import React, { useEffect, useMemo, useRef, useState } from 'react';

const TOKEN_KEY = 'threads_token';
const HOME_FEED_POLL_INTERVAL_MS = 5_000;
const MAX_IMAGE_BYTES = 900 * 1024;
const MAX_VIDEO_BYTES = 3 * 1024 * 1024;
const MAX_MEDIA_DIMENSION = 1440;

function safeGetToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function safeSetToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage errors in embedded webviews.
  }
}

function safeRemoveToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors in embedded webviews.
  }
}

function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
    return '';
  }

  const isNativeCapacitor =
    typeof window !== 'undefined' && window.location.protocol === 'capacitor:';

  if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
    return 'http://10.0.2.2:4000';
  }

  if (isNativeCapacitor) {
    // Avoid crashing the entire app at startup if the env var is missing.
    // API requests will fail gracefully and surface a normal error message.
    return '';
  }

  return 'http://localhost:4000';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Could not read media file'));
    reader.readAsDataURL(file);
  });
}

function getApproxBytesFromDataUrl(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not process image'));
    image.src = dataUrl;
  });
}

async function compressImageDataUrl(dataUrl, maxBytes = MAX_IMAGE_BYTES) {
  const image = await loadImage(dataUrl);
  const longestSide = Math.max(image.width, image.height);
  const scale = longestSide > MAX_MEDIA_DIMENSION ? MAX_MEDIA_DIMENSION / longestSide : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not process image');
  context.drawImage(image, 0, 0, width, height);

  for (const quality of [0.8, 0.7, 0.6, 0.5]) {
    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (getApproxBytesFromDataUrl(compressed) <= maxBytes) {
      return compressed;
    }
  }

  return canvas.toDataURL('image/jpeg', 0.45);
}

async function apiRequest(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const requestUrl = `${baseUrl}${path}`;
  let response;

  try {
    response = await fetch(requestUrl, options);
  } catch (error) {
    const target = baseUrl || window.location.origin;
    throw new Error(`API server not reachable: ${target}`);
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString();
}

function formatRelativeTime(value) {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 60) return 'gerade eben';
  if (absSeconds < 3600) return `${Math.round(absSeconds / 60)} Min.`;
  if (absSeconds < 86400) return `${Math.round(absSeconds / 3600)} Std.`;
  return formatDate(value);
}

function formatHandle(user) {
  if (!user) return 'guest.user';
  if (user.email && user.email.includes('@')) {
    return user.email.split('@')[0].toLowerCase();
  }
  return user.name.toLowerCase().replace(/\s+/g, '.');
}

function getAvatarUrls(user, size = 96) {
  const seed = user?.email || user?.name || 'guest';
  const displayName = (user?.name || 'person').trim();
  const renderSize = Math.max(128, Number(size) || 96);
  const prompt = `photorealistic AI portrait headshot of ${displayName}, neutral background, natural lighting, detailed face`;
  return [
    `https://i.pravatar.cc/${renderSize}?u=${encodeURIComponent(seed)}`,
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${encodeURIComponent(seed)}&width=${renderSize}&height=${renderSize}&model=flux&nologo=true`,
    `https://api.dicebear.com/9.x/lorelei/png?seed=${encodeURIComponent(seed)}&size=${renderSize}`,
  ];
}

function Avatar({ user, className = 'avatar-dot', size = 96 }) {
  const fallback = (user?.name || '?').slice(0, 1).toUpperCase();
  const avatarUrls = useMemo(() => getAvatarUrls(user, size), [user, size]);
  const [avatarIndex, setAvatarIndex] = useState(0);

  useEffect(() => {
    setAvatarIndex(0);
  }, [user?.id, user?.email, user?.name]);

  const avatarUrl = avatarUrls[avatarIndex] || null;

  return (
    <div className={className}>
      {avatarUrl && (
        <img
          className="avatar-img"
          src={avatarUrl}
          alt={`${user?.name || 'User'} avatar`}
          onError={() => {
            setAvatarIndex((current) => {
              const next = current + 1;
              return next < avatarUrls.length ? next : current;
            });
          }}
        />
      )}
      <span className="avatar-fallback">{fallback}</span>
    </div>
  );
}

function renderThreadMedia(item) {
  if (item.mediaType === 'photo' && item.mediaUrl) {
    return <img className="post-media" src={item.mediaUrl} alt="Thread media" loading="lazy" decoding="async" />;
  }

  if (item.mediaType === 'video' && item.mediaUrl) {
    return <video className="post-media" src={item.mediaUrl} controls preload="metadata" />;
  }

  return null;
}

function updateReplyTreeById(replies, replyId, updater) {
  let hasChanges = false;

  const nextReplies = replies.map((reply) => {
    if (reply.id === replyId) {
      hasChanges = true;
      return updater(reply);
    }

    if (!reply.childReplies || reply.childReplies.length === 0) {
      return reply;
    }

    const nextChildReplies = updateReplyTreeById(reply.childReplies, replyId, updater);
    if (nextChildReplies !== reply.childReplies) {
      hasChanges = true;
      return { ...reply, childReplies: nextChildReplies };
    }

    return reply;
  });

  return hasChanges ? nextReplies : replies;
}

function ReplyTree({
  replies,
  depth,
  threadId,
  onOpenProfile,
  onReplyToReply,
  onToggleReplyLike,
  replyLikeIdInFlight,
}) {
  if (!replies || replies.length === 0) return null;

  return (
    <ul className="reply-tree">
      {replies.map((reply) => (
        <li key={reply.id} className="reply-node" style={{ marginLeft: `${depth * 12}px` }}>
          <div className="reply-head">
            <button
              type="button"
              className="author-link"
              onClick={() => onOpenProfile && onOpenProfile(reply.author)}
            >
              {reply.author?.name || 'Unknown'}
            </button>
            <span>{formatDate(reply.createdAt)}</span>
          </div>
          <p>{reply.content}</p>
          <div className="reply-actions">
            <button
              type="button"
              className={reply.likedByMe ? 'heart-btn liked' : 'heart-btn'}
              disabled={replyLikeIdInFlight === reply.id}
              onClick={() => onToggleReplyLike && onToggleReplyLike(reply.id)}
            >
              <span className="heart-icon">♥</span>
              <span className="heart-count">{reply.likeCount || 0}</span>
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onReplyToReply && onReplyToReply(threadId, reply)}
            >
              Reply
            </button>
          </div>
          <ReplyTree
            replies={reply.childReplies}
            depth={depth + 1}
            threadId={threadId}
            onOpenProfile={onOpenProfile}
            onReplyToReply={onReplyToReply}
            onToggleReplyLike={onToggleReplyLike}
            replyLikeIdInFlight={replyLikeIdInFlight}
          />
        </li>
      ))}
    </ul>
  );
}

function MessagesView({
  conversations,
  activeConversationUser,
  conversationMessages,
  messageDraft,
  messageError,
  onMessageDraftChange,
  onSendMessage,
  onSelectConversation,
  onStartWithProfile,
  discoverProfiles,
  isLoadingMessages,
  isSendingMessage,
}) {
  return (
    <section className="view">
      <header className="view-header">
        <h2>Nachrichten</h2>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            const firstProfile = discoverProfiles[0];
            if (firstProfile) {
              onStartWithProfile(firstProfile);
            }
          }}
        >
          ✎
        </button>
      </header>

      <div className="search-field">Chats</div>
      {messageError && <p className="error-text">{messageError}</p>}

      <div className="message-layout">
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.user.id}
              type="button"
              className={
                activeConversationUser?.id === conversation.user.id
                  ? 'conversation-item active'
                  : 'conversation-item'
              }
              onClick={() => onSelectConversation(conversation.user)}
            >
              <div className="conversation-item-row">
                <Avatar user={conversation.user} className="avatar-dot conversation-avatar" size={72} />
                <div>
                  <strong>{conversation.user.name}</strong>
                  <span>{conversation.lastMessage?.content || 'No message yet'}</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="conversation-panel">
          {!activeConversationUser ? (
            <div className="empty-state compact">
              <div className="bubble-row"><span /><span /><span /></div>
              <p>Select a conversation to send private messages.</p>
              {discoverProfiles.slice(0, 4).map((profile) => (
                <button
                  key={`start-chat-${profile.id}`}
                  type="button"
                  className="ghost-btn"
                  onClick={() => onStartWithProfile(profile)}
                >
                  Chat mit {profile.name} starten
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="conversation-header">
                <div className="conversation-item-row">
                  <Avatar user={activeConversationUser} className="avatar-dot conversation-avatar" size={72} />
                  <div>
                    <strong>{activeConversationUser.name}</strong>
                    <span>{activeConversationUser.email}</span>
                  </div>
                </div>
              </div>

              <div className="message-thread">
                {isLoadingMessages ? (
                  <p className="muted-inline">Loading messages...</p>
                ) : conversationMessages.length === 0 ? (
                  <p className="muted-inline">No messages yet.</p>
                ) : (
                  conversationMessages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.senderId === activeConversationUser.id
                          ? 'message-bubble incoming'
                          : 'message-bubble outgoing'
                      }
                    >
                      {message.content}
                    </div>
                  ))
                )}
              </div>

              <div className="message-composer">
                <textarea
                  value={messageDraft}
                  onChange={(event) => onMessageDraftChange(event.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Write a private message..."
                />
                <button
                  type="button"
                  className="primary-light-btn"
                  onClick={onSendMessage}
                  disabled={isSendingMessage}
                >
                  {isSendingMessage ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ActivityView({
  notice,
  activityItems,
  isLoadingActivity,
  followRequestActionInFlightId,
  onRespondToFollowRequest,
  onOpenConversationWithUser,
}) {
  const [activeFilter, setActiveFilter] = useState('Alle');
  const filters = ['Alle', 'Anfragen', 'Unterhaltungen', 'Reposts'];

  const visibleItems = activityItems.filter(
    (item) => activeFilter === 'Alle' || item.category === activeFilter,
  );

  return (
    <section className="view">
      <header className="view-header">
        <h2>Aktivitäten</h2>
      </header>

      <div className="pill-row">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            className={activeFilter === filter ? 'pill active' : 'pill'}
            onClick={() => {
              setActiveFilter(filter);
              notice(`Filter set to ${filter}`);
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {isLoadingActivity ? (
        <p className="muted-inline activity-loading">Aktivitäten werden geladen...</p>
      ) : visibleItems.length === 0 ? (
        <p className="muted-inline activity-loading">Keine Aktivitäten für diesen Filter.</p>
      ) : (
        <ul className="activity-list">
          {visibleItems.map((item) => (
            <li key={item.id} className="activity-item">
              <div className="activity-meta">
                <span className="activity-type">{item.category}</span>
                <span>{formatRelativeTime(item.createdAt)}</span>
              </div>
              <div className="activity-headline">
                {item.actor && <Avatar user={item.actor} className="avatar-dot activity-avatar" size={64} />}
                <h4>{item.title}</h4>
              </div>
              <p>{item.detail}</p>
              {item.followRequestId && (
                <div className="activity-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={followRequestActionInFlightId === item.followRequestId}
                    onClick={() => onRespondToFollowRequest(item.followRequestId, 'accept')}
                  >
                    {followRequestActionInFlightId === item.followRequestId ? '...' : 'Annehmen'}
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={followRequestActionInFlightId === item.followRequestId}
                    onClick={() => onRespondToFollowRequest(item.followRequestId, 'reject')}
                  >
                    Ablehnen
                  </button>
                </div>
              )}
              {!item.followRequestId && item.actor?.id && (
                <div className="activity-actions">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => onOpenConversationWithUser(item.actor)}
                  >
                    Nachricht öffnen
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileView({
  user,
  onOpenComposer,
  onOpenEditProfile,
  onShareProfile,
  onOpenDiscover,
  followersProfiles,
  followingProfiles,
  isLoadingFollowingProfiles,
  profileTab,
  onProfileTabChange,
  profileItems,
  isLoadingProfileContent,
}) {
  return (
    <section className="view">
      <header className="profile-head">
        <div>
          <h2>{user.name}</h2>
          <p>{formatHandle(user)}</p>
          <p className="muted-inline">{followersProfiles.length} followers</p>
          <p className="muted-inline">Profile active</p>
        </div>
        <Avatar user={user} className="profile-avatar" size={128} />
      </header>

      <div className="profile-actions">
        <button type="button" className="ghost-btn" onClick={onOpenEditProfile}>Profil bearbeiten</button>
        <button type="button" className="ghost-btn" onClick={onShareProfile}>Profil teilen</button>
      </div>

      <div className="profile-tabs">
        <button
          type="button"
          className={profileTab === 'threads' ? 'active' : ''}
          onClick={() => onProfileTabChange('threads')}
        >
          Threads
        </button>
        <button
          type="button"
          className={profileTab === 'answers' ? 'active' : ''}
          onClick={() => onProfileTabChange('answers')}
        >
          Antworten
        </button>
        <button
          type="button"
          className={profileTab === 'media' ? 'active' : ''}
          onClick={() => onProfileTabChange('media')}
        >
          Medien
        </button>
        <button
          type="button"
          className={profileTab === 'reposts' ? 'active' : ''}
          onClick={() => onProfileTabChange('reposts')}
        >
          Reposts
        </button>
      </div>

      <div className="profile-cards">
        <article className="mini-card">
          <h4>Erstelle einen Thread</h4>
          <p>Teile ein besonderes Ereignis oder was dich aktuell beschaftigt.</p>
          <button type="button" className="primary-light-btn" onClick={onOpenComposer}>Erstellen</button>
        </article>
        <article className="mini-card">
          <h4>Folge neuen Profilen</h4>
          <p>Entdecke neue Accounts und bring mehr Inhalte in deinen Feed.</p>
          <button type="button" className="primary-light-btn" onClick={onOpenDiscover}>Profile ansehen</button>
        </article>
      </div>

      <article className="mini-card">
        <h4>Wer dir folgt</h4>
        {isLoadingFollowingProfiles ? (
          <p>Lade Follower...</p>
        ) : followersProfiles.length === 0 ? (
          <p>Du hast noch keine Follower.</p>
        ) : (
          <div className="following-list">
            {followersProfiles.slice(0, 10).map((profile) => (
              <div key={`follower-${profile.id}`} className="following-chip">
                <Avatar user={profile} className="avatar-dot following-avatar" size={60} />
                <span>{profile.name}</span>
              </div>
            ))}
          </div>
        )}
      </article>

      <article className="mini-card">
        <h4>Wem du folgst</h4>
        {isLoadingFollowingProfiles ? (
          <p>Lade gefolgte Profile...</p>
        ) : followingProfiles.length === 0 ? (
          <p>Du folgst noch niemandem.</p>
        ) : (
          <div className="following-list">
            {followingProfiles.slice(0, 10).map((profile) => (
              <div key={`following-${profile.id}`} className="following-chip">
                <Avatar user={profile} className="avatar-dot following-avatar" size={60} />
                <span>{profile.name}</span>
              </div>
            ))}
          </div>
        )}
      </article>

      <div className="profile-results">
        {isLoadingProfileContent ? (
          <p className="muted-inline">Loading {profileTab}...</p>
        ) : profileItems.length === 0 ? (
          <p className="muted-inline">No items in {profileTab} yet.</p>
        ) : (
          <ul className="profile-item-list">
            {profileItems.map((item) => (
              <li key={`profile-item-${profileTab}-${item.id}`} className="mini-card">
                {profileTab === 'answers' ? (
                  <>
                    <strong>{item.content}</strong>
                    <p>Reply on: {item.thread?.content || 'Unknown thread'}</p>
                  </>
                ) : (
                  <>
                    <strong>{item.content}</strong>
                    {renderThreadMedia(item)}
                    <p>
                      {item.likeCount || 0} likes · {item.replyCount || 0} replies · {item.repostCount || 0} reposts
                    </p>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [token, setToken] = useState(() => safeGetToken());
  const [user, setUser] = useState(null);
  const [threads, setThreads] = useState([]);
  const [discoverProfiles, setDiscoverProfiles] = useState([]);
  const [activityItems, setActivityItems] = useState([]);
  const [followersProfiles, setFollowersProfiles] = useState([]);
  const [followingProfiles, setFollowingProfiles] = useState([]);

  const [isBooting, setIsBooting] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [likeThreadIdInFlight, setLikeThreadIdInFlight] = useState(null);
  const [repostThreadIdInFlight, setRepostThreadIdInFlight] = useState(null);
  const [replyThreadIdInFlight, setReplyThreadIdInFlight] = useState(null);
  const [replyLikeIdInFlight, setReplyLikeIdInFlight] = useState(null);
  const [followProfileIdInFlight, setFollowProfileIdInFlight] = useState(null);

  const [activeTab, setActiveTab] = useState('home');
  const [isFeedSheetOpen, setIsFeedSheetOpen] = useState(false);
  const [homeFeedMode, setHomeFeedMode] = useState('forYou');
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLoadingProfileContent, setIsLoadingProfileContent] = useState(false);
  const [isLoadingFollowingProfiles, setIsLoadingFollowingProfiles] = useState(false);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [followRequestActionInFlightId, setFollowRequestActionInFlightId] = useState(null);

  const [expandedThreadIds, setExpandedThreadIds] = useState({});
  const [replyDraftByThread, setReplyDraftByThread] = useState({});
  const [replyTargetByThread, setReplyTargetByThread] = useState({});
  const [profileTab, setProfileTab] = useState('threads');
  const [profileItems, setProfileItems] = useState([]);
  const [otherProfile, setOtherProfile] = useState(null);
  const [otherProfileTab, setOtherProfileTab] = useState('threads');
  const [otherProfileItems, setOtherProfileItems] = useState([]);
  const [isLoadingOtherProfile, setIsLoadingOtherProfile] = useState(false);
  const [isLoadingOtherProfileContent, setIsLoadingOtherProfileContent] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationUser, setActiveConversationUser] = useState(null);
  const [conversationMessages, setConversationMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState('');

  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [feedError, setFeedError] = useState('');
  const [composerError, setComposerError] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [threadContent, setThreadContent] = useState('');
  const [threadMediaType, setThreadMediaType] = useState('');
  const [threadMediaUrl, setThreadMediaUrl] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editProfileName, setEditProfileName] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const isHomeFeedRefreshInFlightRef = useRef(false);

  const isAuthenticated = Boolean(token && user);
  const remainingChars = useMemo(() => 280 - threadContent.length, [threadContent]);

  const visibleThreads = useMemo(() => {
    if (!searchTerm.trim()) return threads;
    const needle = searchTerm.trim().toLowerCase();
    return threads.filter((thread) => (
      thread.content.toLowerCase().includes(needle)
      || (thread.author?.name || '').toLowerCase().includes(needle)
    ));
  }, [threads, searchTerm]);

  function showNotice(message) {
    setNoticeMessage(message);
    window.clearTimeout(showNotice.timeoutId);
    showNotice.timeoutId = window.setTimeout(() => setNoticeMessage(''), 2200);
  }
  showNotice.timeoutId = showNotice.timeoutId || null;

  function getFollowLabel(profile) {
    if (profile?.followState === 'following') return 'Following';
    if (profile?.followState === 'requested') return 'Requested';
    return 'Follow';
  }

  async function loadThreads(mode = homeFeedMode) {
    setIsRefreshingFeed(true);
    setFeedError('');

    try {
      const query = mode === 'following' ? '?mode=following' : '?mode=forYou';
      const data = await apiRequest(`/api/threads${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setThreads(data.threads || []);
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setIsRefreshingFeed(false);
    }
  }

  async function loadDiscoverProfiles() {
    if (!token) return;

    try {
      const data = await apiRequest('/api/profiles/discover', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDiscoverProfiles(data.profiles || []);
    } catch {
      setDiscoverProfiles([]);
    }
  }

  async function loadFollowingProfiles() {
    if (!token) return;

    setIsLoadingFollowingProfiles(true);

    try {
      const data = await apiRequest('/api/profiles/following', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFollowingProfiles(data.profiles || []);
    } catch (error) {
      setFeedError(error.message);
      setFollowingProfiles([]);
    } finally {
      setIsLoadingFollowingProfiles(false);
    }
  }

  async function loadFollowersProfiles() {
    if (!token) return;

    setIsLoadingFollowingProfiles(true);

    try {
      const data = await apiRequest('/api/profiles/followers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFollowersProfiles(data.profiles || []);
    } catch (error) {
      setFeedError(error.message);
      setFollowersProfiles([]);
    } finally {
      setIsLoadingFollowingProfiles(false);
    }
  }

  async function loadActivity() {
    if (!token) return;

    setIsLoadingActivity(true);

    try {
      const data = await apiRequest('/api/profiles/activity', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActivityItems(data.items || []);
    } catch (error) {
      setFeedError(error.message);
      setActivityItems([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }

  async function loadProfileContent(tab = profileTab) {
    if (!token) return;
    setIsLoadingProfileContent(true);

    try {
      const data = await apiRequest(`/api/profiles/me/content?tab=${encodeURIComponent(tab)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfileItems(data.items || []);
    } catch (error) {
      setFeedError(error.message);
      setProfileItems([]);
    } finally {
      setIsLoadingProfileContent(false);
    }
  }

  async function handleProfileTabChange(nextTab) {
    if (!['threads', 'answers', 'media', 'reposts'].includes(nextTab)) return;
    setProfileTab(nextTab);

    if (token && activeTab === 'profile') {
      await loadProfileContent(nextTab);
    }
  }

  async function loadConversations() {
    if (!token) return;

    try {
      const data = await apiRequest('/api/messages/conversations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(data.conversations || []);
    } catch (error) {
      setFeedError(`Messages: ${error.message}`);
      setConversations([]);
    }
  }

  async function loadConversationMessages(userToOpen) {
    if (!token || !userToOpen) return;

    setIsLoadingMessages(true);

    try {
      const data = await apiRequest(`/api/messages/conversations/${userToOpen.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveConversationUser(data.user);
      setConversationMessages(data.messages || []);
    } catch (error) {
      setFeedError(`Messages: ${error.message}`);
      setConversationMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function sendMessageToActiveConversation() {
    if (!activeConversationUser) return;

    const draft = messageDraft.trim();

    if (!draft) {
      showNotice('Message cannot be empty');
      return;
    }

    setIsSendingMessage(true);

    try {
      const data = await apiRequest('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recipientId: activeConversationUser.id,
          content: draft,
        }),
      });

      setConversationMessages((prev) => [...prev, data.message]);
      setMessageDraft('');
      await loadConversations();
    } catch (error) {
      setFeedError(`Messages: ${error.message}`);
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function openOtherProfile(author) {
    if (!author || !author.id || !token) return;
    if (user && author.id === user.id) {
      setActiveTab('profile');
      return;
    }

    setIsLoadingOtherProfile(true);
    setOtherProfileTab('threads');

    try {
      const data = await apiRequest(`/api/profiles/${author.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOtherProfile(data.profile);
    } catch (error) {
      setFeedError(error.message);
      return;
    } finally {
      setIsLoadingOtherProfile(false);
    }

    setIsLoadingOtherProfileContent(true);

    try {
      const data = await apiRequest(`/api/profiles/${author.id}/content?tab=threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOtherProfileItems(data.items || []);
    } catch (error) {
      setFeedError(error.message);
      setOtherProfileItems([]);
    } finally {
      setIsLoadingOtherProfileContent(false);
    }
  }

  async function loadOtherProfileContent(tab) {
    if (!otherProfile || !token) return;

    setIsLoadingOtherProfileContent(true);

    try {
      const data = await apiRequest(`/api/profiles/${otherProfile.id}/content?tab=${encodeURIComponent(tab)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOtherProfileItems(data.items || []);
    } catch (error) {
      setFeedError(error.message);
      setOtherProfileItems([]);
    } finally {
      setIsLoadingOtherProfileContent(false);
    }
  }

  function resetComposer() {
    setThreadContent('');
    setThreadMediaType('');
    setThreadMediaUrl('');
  }

  function openComposer() {
    if (!isAuthenticated) {
      setAuthError('Please sign in first');
      return;
    }
    setIsComposerOpen(true);
    setComposerError('');
  }

  function closeComposer() {
    stopCameraCapture();
    setIsComposerOpen(false);
    setComposerError('');
  }

  function toggleReplies(threadId) {
    setExpandedThreadIds((prev) => ({ ...prev, [threadId]: !prev[threadId] }));
  }

  function setReplyDraft(threadId, value) {
    setReplyDraftByThread((prev) => ({ ...prev, [threadId]: value }));
  }

  function setReplyTarget(threadId, reply) {
    setExpandedThreadIds((prev) => ({ ...prev, [threadId]: true }));
    setReplyTargetByThread((prev) => ({
      ...prev,
      [threadId]: { id: reply.id, authorName: reply.author?.name || 'Unknown' },
    }));
  }

  function clearReplyTarget(threadId) {
    setReplyTargetByThread((prev) => ({ ...prev, [threadId]: null }));
  }

  async function handleMediaFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      setComposerError('Only image or video files are supported');
      return;
    }

    try {
      if (isImage) {
        const dataUrl = await readFileAsDataUrl(file);
        const compressedDataUrl = await compressImageDataUrl(dataUrl, MAX_IMAGE_BYTES);
        if (getApproxBytesFromDataUrl(compressedDataUrl) > MAX_IMAGE_BYTES) {
          setComposerError('Image is still too large after compression. Please choose a smaller image.');
          return;
        }

        setThreadMediaType('photo');
        setThreadMediaUrl(compressedDataUrl);
        setComposerError('');
        showNotice('Photo attached');
        return;
      }

      if (file.size > MAX_VIDEO_BYTES) {
        setComposerError('Video must be 3MB or less for fast posting.');
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      setThreadMediaType('video');
      setThreadMediaUrl(dataUrl);
      setComposerError('');
      showNotice('Video attached');
    } catch (error) {
      setComposerError(error.message || 'Could not attach media');
    } finally {
      event.target.value = '';
    }
  }

  function stopCameraCapture() {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setIsCameraActive(false);
  }

  async function startCameraCapture() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setComposerError('Camera is not supported on this device/browser');
      return;
    }

    setIsStartingCamera(true);
    setComposerError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setIsCameraActive(true);
    } catch {
      setComposerError('Unable to access camera');
    } finally {
      setIsStartingCamera(false);
    }
  }

  function capturePhotoFromCamera() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setComposerError('Camera is not ready yet');
      return;
    }

    const longestSide = Math.max(video.videoWidth, video.videoHeight);
    const scale = longestSide > MAX_MEDIA_DIMENSION ? MAX_MEDIA_DIMENSION / longestSide : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      setComposerError('Could not capture photo');
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);

    setThreadMediaType('photo');
    setThreadMediaUrl(dataUrl);
    setComposerError('');
    showNotice('Photo captured');
    stopCameraCapture();
  }

  async function handleCreateReply(threadId) {
    if (!isAuthenticated) {
      setFeedError('Please sign in to reply to threads');
      return;
    }

    const draft = (replyDraftByThread[threadId] || '').trim();
    if (!draft) {
      setFeedError('Reply content is required');
      return;
    }
    if (draft.length > 280) {
      setFeedError('Reply content must be 280 characters or fewer');
      return;
    }

    setFeedError('');
    setReplyThreadIdInFlight(threadId);

    try {
      const target = replyTargetByThread[threadId];
      await apiRequest(`/api/threads/${threadId}/replies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: draft, parentReplyId: target?.id || null }),
      });

      setReplyDraft(threadId, '');
      clearReplyTarget(threadId);
      await loadThreads();
      setExpandedThreadIds((prev) => ({ ...prev, [threadId]: true }));
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setReplyThreadIdInFlight(null);
    }
  }

  async function handleToggleLike(threadId) {
    if (!isAuthenticated) {
      setFeedError('Please sign in to like threads');
      return;
    }

    setLikeThreadIdInFlight(threadId);
    setFeedError('');

    try {
      const data = await apiRequest(`/api/threads/${threadId}/likes/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setThreads((prevThreads) => prevThreads.map((thread) => (
        thread.id === threadId
          ? { ...thread, likeCount: data.likeCount, likedByMe: data.liked }
          : thread
      )));
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setLikeThreadIdInFlight(null);
    }
  }

  async function handleToggleReplyLike(replyId) {
    if (!isAuthenticated) {
      setFeedError('Please sign in to like replies');
      return;
    }

    setReplyLikeIdInFlight(replyId);
    setFeedError('');

    try {
      const data = await apiRequest(`/api/threads/replies/${replyId}/likes/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setThreads((prevThreads) => prevThreads.map((thread) => ({
        ...thread,
        replies: updateReplyTreeById(thread.replies || [], replyId, (reply) => ({
          ...reply,
          likeCount: data.likeCount,
          likedByMe: data.liked,
        })),
      })));
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setReplyLikeIdInFlight(null);
    }
  }

  async function handleToggleRepost(threadId) {
    if (!isAuthenticated) {
      setFeedError('Please sign in to repost threads');
      return;
    }

    setRepostThreadIdInFlight(threadId);
    setFeedError('');

    try {
      const data = await apiRequest(`/api/threads/${threadId}/reposts/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setThreads((prevThreads) => prevThreads.map((thread) => (
        thread.id === threadId
          ? { ...thread, repostCount: data.repostCount, repostedByMe: data.reposted }
          : thread
      )));

      if (activeTab === 'profile' && profileTab === 'reposts') {
        await loadProfileContent('reposts');
      }
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setRepostThreadIdInFlight(null);
    }
  }

  async function handleShareThread(threadId) {
    const url = `${window.location.origin}/thread/${threadId}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showNotice('Thread link copied');
      } else {
        showNotice(url);
      }
    } catch {
      showNotice(url);
    }
  }

  async function handleToggleFollow(profileId) {
    setFollowProfileIdInFlight(profileId);

    try {
      const data = await apiRequest(`/api/profiles/${profileId}/follow-toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setDiscoverProfiles((prev) => prev.map((profile) => (
        profile.id === profileId
          ? {
            ...profile,
            isFollowing: data.isFollowing,
            followState: data.followState,
            followerCount: data.followerCount,
          }
          : profile
      )));
      setOtherProfile((prev) => (
        prev && prev.id === profileId
          ? {
            ...prev,
            isFollowing: data.isFollowing,
            followState: data.followState,
            followerCount: data.followerCount,
          }
          : prev
      ));

      showNotice(data.message || (data.isFollowing ? 'Now following profile' : 'Updated follow state'));
      await Promise.all([loadFollowingProfiles(), loadFollowersProfiles()]);

      if (homeFeedMode === 'following') {
        await loadThreads('following');
      }
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setFollowProfileIdInFlight(null);
    }
  }

  async function handleStartConversationWithProfile(profile) {
    if (!profile) return;
    setOtherProfile(null);
    setActiveTab('messages');
    await loadConversationMessages(profile);
  }

  async function handleRespondToFollowRequest(followRequestId, action) {
    if (!followRequestId || !['accept', 'reject'].includes(action)) return;

    setFollowRequestActionInFlightId(followRequestId);

    try {
      await apiRequest(`/api/profiles/follow-requests/${followRequestId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      showNotice(action === 'accept' ? 'Anfrage angenommen' : 'Anfrage abgelehnt');
      await Promise.all([
        loadActivity(),
        loadDiscoverProfiles(),
        loadFollowingProfiles(),
        loadFollowersProfiles(),
      ]);
      if (homeFeedMode === 'following') {
        await loadThreads('following');
      }
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setFollowRequestActionInFlightId(null);
    }
  }

  async function handleCreateThread(event) {
    event.preventDefault();

    const draft = threadContent.trim();

    if (!draft) {
      setComposerError('Thread content is required');
      return;
    }

    if (draft.length > 280) {
      setComposerError('Thread content must be 280 characters or fewer');
      return;
    }

    if ((threadMediaType && !threadMediaUrl) || (!threadMediaType && threadMediaUrl)) {
      setComposerError('Media type and media source must both be provided');
      return;
    }

    setIsPosting(true);
    setComposerError('');

    try {
      await apiRequest('/api/threads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: draft,
          mediaType: threadMediaType || null,
          mediaUrl: threadMediaUrl || null,
        }),
      });

      resetComposer();
      closeComposer();
      setHomeFeedMode('forYou');
      await loadThreads('forYou');
      setActiveTab('home');
      showNotice('Thread posted');
    } catch (error) {
      setComposerError(error.message);
    } finally {
      setIsPosting(false);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setIsSubmittingAuth(true);
    setAuthError('');

    const isRegister = authMode === 'register';
    const path = isRegister ? '/api/auth/register' : '/api/auth/login';
    const body = isRegister ? registerForm : loginForm;

    try {
      const data = await apiRequest(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      safeSetToken(data.token);
      setToken(data.token);
      setUser(data.user);
      setEditProfileName(data.user.name);
      setLoginForm({ email: '', password: '' });
      setRegisterForm({ name: '', email: '', password: '' });
      setActiveTab('home');
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleCreateDemoProfiles() {
    try {
      const data = await apiRequest('/api/auth/demo-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      showNotice(`${data.createdCount} demo profiles created`);
      await loadDiscoverProfiles();
      await loadThreads();
    } catch (error) {
      setFeedError(error.message);
    }
  }

  async function handleSaveProfile() {
    if (!editProfileName.trim()) {
      showNotice('Name cannot be empty');
      return;
    }

    try {
      const data = await apiRequest('/api/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editProfileName.trim() }),
      });
      setUser(data.user);
      setIsEditProfileOpen(false);
      showNotice('Profile updated');
    } catch (error) {
      setFeedError(error.message);
    }
  }

  async function handleShareProfile() {
    const profileUrl = `${window.location.origin}/profile/${formatHandle(user)}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileUrl);
        showNotice('Profile link copied');
      } else {
        showNotice(`Profile link: ${profileUrl}`);
      }
    } catch {
      showNotice(`Profile link: ${profileUrl}`);
    }
  }

  function handleLogout() {
    safeRemoveToken();
    setToken('');
    setUser(null);
    setThreads([]);
    setDiscoverProfiles([]);
    setFollowersProfiles([]);
    setFollowingProfiles([]);
    setActivityItems([]);
    setIsComposerOpen(false);
    setIsFeedSheetOpen(false);
    setExpandedThreadIds({});
    setReplyDraftByThread({});
    setReplyTargetByThread({});
    setOtherProfile(null);
    setConversations([]);
    setConversationMessages([]);
    setActiveConversationUser(null);
    setMessageDraft('');
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      setIsBooting(true);
      await loadThreads('forYou');

      if (!token) {
        if (isMounted) setIsBooting(false);
        return;
      }

      try {
        const data = await apiRequest('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (isMounted) {
          setUser(data.user);
          setEditProfileName(data.user.name);
          await loadDiscoverProfiles();
          await Promise.all([loadFollowingProfiles(), loadFollowersProfiles()]);
          await loadActivity();
        }
      } catch {
        safeRemoveToken();
        if (isMounted) {
          setToken('');
          setUser(null);
        }
      } finally {
        if (isMounted) setIsBooting(false);
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadThreads(homeFeedMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeFeedMode]);

  useEffect(() => {
    if (!token || activeTab !== 'profile') return;
    loadFollowingProfiles();
    loadFollowersProfiles();
    loadProfileContent(profileTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, profileTab, token]);

  useEffect(() => {
    if (!token || activeTab !== 'messages') return;
    loadConversations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token]);

  useEffect(() => {
    if (!token || activeTab !== 'messages') return undefined;
    const interval = window.setInterval(async () => {
      await loadConversations();
      if (activeConversationUser) {
        await loadConversationMessages(activeConversationUser);
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, activeConversationUser]);

  useEffect(() => {
    if (!token || activeTab !== 'messages' || conversations.length === 0) return;

    const stillExists = activeConversationUser
      ? conversations.some((conversation) => conversation.user.id === activeConversationUser.id)
      : false;

    if (!stillExists) {
      loadConversationMessages(conversations[0].user);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, conversations, activeConversationUser]);

  useEffect(() => {
    if (!token || activeTab !== 'activity') return;
    loadActivity();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token]);

  useEffect(() => {
    if (!token || activeTab !== 'activity') return undefined;
    const interval = window.setInterval(() => {
      loadActivity();
    }, 20_000);
    return () => window.clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token]);

  useEffect(() => {
    if (activeTab !== 'home') return undefined;

    async function refreshHomeFeed() {
      if (isHomeFeedRefreshInFlightRef.current) return;

      isHomeFeedRefreshInFlightRef.current = true;
      try {
        await loadThreads(homeFeedMode);
      } finally {
        isHomeFeedRefreshInFlightRef.current = false;
      }
    }

    const interval = window.setInterval(() => {
      refreshHomeFeed();
    }, HOME_FEED_POLL_INTERVAL_MS);

    function refreshOnVisible() {
      if (document.visibilityState !== 'visible') return;
      refreshHomeFeed();
    }

    window.addEventListener('focus', refreshOnVisible);
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnVisible);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, token, homeFeedMode]);

  useEffect(() => {
    if (!otherProfile || !token) return;
    loadOtherProfileContent(otherProfileTab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherProfileTab, otherProfile, token]);

  useEffect(() => {
    async function bindCameraStream() {
      if (!isCameraActive || !cameraVideoRef.current || !cameraStreamRef.current) return;

      try {
        cameraVideoRef.current.srcObject = cameraStreamRef.current;
        await cameraVideoRef.current.play();
      } catch {
        setComposerError('Unable to start camera preview');
      }
    }

    bindCameraStream();
  }, [isCameraActive]);

  useEffect(() => () => {
    stopCameraCapture();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isBooting) {
    return (
      <div className="app-shell">
        <div className="phone-shell loading-shell">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="app-shell">
        <div className="phone-shell auth-shell">
          <header className="auth-hero">
            <div className="threads-logo"><span className="threads-logo-mark">@</span></div>
            <h1>Dredds</h1>
            <p>Sign in to post text, photos, videos, and discover profiles.</p>
          </header>

          <div className="auth-toggle">
            <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
            <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'register' && (
              <label>
                Name
                <input
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
              </label>
            )}

            <label>
              Email
              <input
                type="email"
                value={authMode === 'register' ? registerForm.email : loginForm.email}
                onChange={(event) => {
                  const value = event.target.value;
                  if (authMode === 'register') {
                    setRegisterForm((prev) => ({ ...prev, email: value }));
                  } else {
                    setLoginForm((prev) => ({ ...prev, email: value }));
                  }
                }}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={authMode === 'register' ? registerForm.password : loginForm.password}
                onChange={(event) => {
                  const value = event.target.value;
                  if (authMode === 'register') {
                    setRegisterForm((prev) => ({ ...prev, password: value }));
                  } else {
                    setLoginForm((prev) => ({ ...prev, password: value }));
                  }
                }}
                required
              />
            </label>

            {authError && <p className="error-text">{authError}</p>}

            <button type="submit" className="auth-submit" disabled={isSubmittingAuth}>
              {isSubmittingAuth ? 'Submitting...' : authMode === 'register' ? 'Create Account' : 'Sign In'}
            </button>

            <button type="button" className="ghost-btn" onClick={handleCreateDemoProfiles}>
              Create demo profiles
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="phone-shell">
        {activeTab === 'home' && (
          <section className="view">
            <header className="topbar">
              <button type="button" className="icon-btn" onClick={() => setIsFeedSheetOpen((prev) => !prev)}>☰</button>
              <div className="threads-logo compact"><span className="threads-logo-mark">@</span></div>
              <button
                type="button"
                className="icon-btn"
              onClick={() => {
                setIsSearchOpen((prev) => !prev);
                if (isSearchOpen) setSearchTerm('');
                }}
              >
                ⌕
              </button>
            </header>

            {isSearchOpen && (
              <input
                className="search-input"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search threads or names"
              />
            )}

            <div className="compose-prompt">
              <Avatar user={user} className="avatar-dot" size={72} />
              <button type="button" className="compose-trigger" onClick={openComposer}>Was gibt&apos;s Neues?</button>
            </div>

            {homeFeedMode === 'forYou' && discoverProfiles.length > 0 && (
              <section className="discover-strip">
                {discoverProfiles.slice(0, 4).map((profile) => (
                  <article key={profile.id} className="discover-card">
                    <button type="button" className="author-link" onClick={() => openOtherProfile(profile)}>{profile.name}</button>
                    <span>{profile.threadCount} posts</span>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={followProfileIdInFlight === profile.id}
                      onClick={() => handleToggleFollow(profile.id)}
                    >
                      {getFollowLabel(profile)}
                    </button>
                  </article>
                ))}
              </section>
            )}

            {feedError && <p className="error-text">{feedError}</p>}

            <ul className="post-list">
              {visibleThreads.map((thread) => {
                const expanded = Boolean(expandedThreadIds[thread.id]);
                const replyDraft = replyDraftByThread[thread.id] || '';
                const replyTarget = replyTargetByThread[thread.id] || null;
                const isReplySubmitting = replyThreadIdInFlight === thread.id;

                return (
                  <li key={thread.id} className="post-card">
                    <div className="post-head">
                      <Avatar user={thread.author} className="avatar-dot" size={72} />
                      <div>
                        <button
                          type="button"
                          className="author-link"
                          onClick={() => openOtherProfile(thread.author)}
                        >
                          {thread.author?.name || 'Unknown'}
                        </button>
                        <p>{formatDate(thread.createdAt)}</p>
                      </div>
                    </div>

                    <p className="post-content">{thread.content}</p>

                    {thread.mediaType === 'photo' && thread.mediaUrl && (
                      <img className="post-media" src={thread.mediaUrl} alt="Thread media" loading="lazy" decoding="async" />
                    )}

                    {thread.mediaType === 'video' && thread.mediaUrl && (
                      <video className="post-media" src={thread.mediaUrl} controls preload="metadata" />
                    )}

                    <div className="post-actions">
                      <button
                        type="button"
                        className={thread.likedByMe ? 'heart-btn liked' : 'heart-btn'}
                        onClick={() => handleToggleLike(thread.id)}
                        disabled={likeThreadIdInFlight === thread.id}
                      >
                        <span className="heart-icon">♥</span>
                        <span className="heart-count">{thread.likeCount || 0}</span>
                      </button>

                      <button type="button" className="ghost-btn" onClick={() => toggleReplies(thread.id)}>
                        ↩ {thread.replyCount || 0}
                      </button>

                      <button
                        type="button"
                        className={thread.repostedByMe ? 'ghost-btn active-repost' : 'ghost-btn'}
                        onClick={() => handleToggleRepost(thread.id)}
                        disabled={repostThreadIdInFlight === thread.id}
                      >
                        ⟳ {thread.repostCount || 0}
                      </button>
                      <button type="button" className="ghost-btn" onClick={() => handleShareThread(thread.id)}>✈</button>
                    </div>

                    {expanded && (
                      <div className="reply-zone">
                        <ReplyTree
                          replies={thread.replies || []}
                          depth={0}
                          threadId={thread.id}
                          onOpenProfile={openOtherProfile}
                          onReplyToReply={setReplyTarget}
                          onToggleReplyLike={handleToggleReplyLike}
                          replyLikeIdInFlight={replyLikeIdInFlight}
                        />

                        {replyTarget && (
                          <div className="reply-target">
                            Replying to {replyTarget.authorName}
                            <button type="button" className="ghost-btn" onClick={() => clearReplyTarget(thread.id)}>Clear</button>
                          </div>
                        )}

                        {(thread.replies || []).length > 0 && (
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => {
                              const firstReply = thread.replies[0];
                              if (firstReply) setReplyTarget(thread.id, firstReply);
                            }}
                          >
                            Quick reply to top reply
                          </button>
                        )}

                        <textarea
                          value={replyDraft}
                          onChange={(event) => setReplyDraft(thread.id, event.target.value)}
                          placeholder="Write a reply..."
                          rows={2}
                          maxLength={280}
                        />

                        <div className="reply-bar">
                          <span className="muted-inline">{280 - replyDraft.length} left</span>
                          <button
                            type="button"
                            className="ghost-btn"
                            disabled={isReplySubmitting}
                            onClick={() => handleCreateReply(thread.id)}
                          >
                            {isReplySubmitting ? 'Posting...' : 'Reply'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {visibleThreads.length === 0 && <p className="center-muted">No threads found for this view.</p>}
          </section>
        )}

        {activeTab === 'messages' && (
          <MessagesView
            conversations={conversations}
            activeConversationUser={activeConversationUser}
            conversationMessages={conversationMessages}
            messageDraft={messageDraft}
            messageError={feedError}
            onMessageDraftChange={setMessageDraft}
            onSendMessage={sendMessageToActiveConversation}
            onSelectConversation={loadConversationMessages}
            onStartWithProfile={handleStartConversationWithProfile}
            discoverProfiles={discoverProfiles}
            isLoadingMessages={isLoadingMessages}
            isSendingMessage={isSendingMessage}
          />
        )}
        {activeTab === 'activity' && (
          <ActivityView
            notice={showNotice}
            activityItems={activityItems}
            isLoadingActivity={isLoadingActivity}
            followRequestActionInFlightId={followRequestActionInFlightId}
            onRespondToFollowRequest={handleRespondToFollowRequest}
            onOpenConversationWithUser={handleStartConversationWithProfile}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileView
            user={user}
            onOpenComposer={openComposer}
            onOpenEditProfile={() => setIsEditProfileOpen(true)}
            onShareProfile={handleShareProfile}
            onOpenDiscover={() => {
              setActiveTab('home');
              setIsFeedSheetOpen(true);
            }}
            followersProfiles={followersProfiles}
            profileTab={profileTab}
            onProfileTabChange={handleProfileTabChange}
            followingProfiles={followingProfiles}
            isLoadingFollowingProfiles={isLoadingFollowingProfiles}
            profileItems={profileItems}
            isLoadingProfileContent={isLoadingProfileContent}
          />
        )}

        {isFeedSheetOpen && activeTab === 'home' && (
          <aside className="feed-sheet" onClick={() => setIsFeedSheetOpen(false)}>
            <div className="feed-sheet-inner" onClick={(event) => event.stopPropagation()}>
              <div className="sheet-header">
                <h3>Feeds</h3>
                <button type="button" className="icon-btn" onClick={() => setIsFeedSheetOpen(false)}>×</button>
              </div>

              <div className="feed-mode-options">
                <button type="button" className={homeFeedMode === 'forYou' ? 'feed-mode active' : 'feed-mode'} onClick={() => setHomeFeedMode('forYou')}>Fur dich</button>
                <button type="button" className={homeFeedMode === 'following' ? 'feed-mode active' : 'feed-mode'} onClick={() => setHomeFeedMode('following')}>Gefolgt</button>
              </div>

              <button type="button" className="ghost-btn wide-btn" onClick={handleCreateDemoProfiles}>Create demo profiles</button>

              <div className="discover-list">
                {discoverProfiles.map((profile) => (
                  <article key={profile.id} className="discover-row">
                    <div>
                      <button type="button" className="author-link" onClick={() => openOtherProfile(profile)}>{profile.name}</button>
                      <span>{profile.followerCount} followers</span>
                    </div>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={followProfileIdInFlight === profile.id}
                      onClick={() => handleToggleFollow(profile.id)}
                    >
                      {getFollowLabel(profile)}
                    </button>
                  </article>
                ))}

                {discoverProfiles.length === 0 && <p className="muted-inline">No discover profiles yet. Create demos.</p>}
              </div>
            </div>
          </aside>
        )}

        {isComposerOpen && (
          <div className="modal-backdrop" onClick={closeComposer}>
            <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Create Thread</h3>
              <form onSubmit={handleCreateThread}>
                <textarea
                  value={threadContent}
                  onChange={(event) => setThreadContent(event.target.value)}
                  maxLength={280}
                  rows={4}
                  placeholder="Share something..."
                />

                <div className="media-row">
                  <select
                    value={threadMediaType}
                    onChange={(event) => {
                      setThreadMediaType(event.target.value);
                      if (!event.target.value) setThreadMediaUrl('');
                    }}
                  >
                    <option value="">No media</option>
                    <option value="photo">Photo</option>
                    <option value="video">Video</option>
                  </select>

                  <input
                    value={threadMediaUrl}
                    onChange={(event) => setThreadMediaUrl(event.target.value)}
                    placeholder="Media URL or upload file below"
                  />
                </div>

                <input type="file" accept="image/*,video/*" onChange={handleMediaFileChange} />

                <div className="camera-actions">
                  {!isCameraActive ? (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={startCameraCapture}
                      disabled={isStartingCamera}
                    >
                      {isStartingCamera ? 'Opening camera...' : 'Open camera'}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="ghost-btn" onClick={capturePhotoFromCamera}>
                        Take photo
                      </button>
                      <button type="button" className="ghost-btn" onClick={stopCameraCapture}>
                        Close camera
                      </button>
                    </>
                  )}
                </div>

                {isCameraActive && (
                  <video
                    ref={cameraVideoRef}
                    className="camera-preview"
                    autoPlay
                    playsInline
                    muted
                  />
                )}

                {threadMediaType && threadMediaUrl && (
                  <div className="media-preview">
                    {threadMediaType === 'photo'
                      ? <img src={threadMediaUrl} alt="Preview" className="post-media" />
                      : <video src={threadMediaUrl} controls className="post-media" />}
                  </div>
                )}

                <div className="reply-bar">
                  <span className="muted-inline">{remainingChars} left</span>
                  <button type="submit" className="auth-submit" disabled={isPosting}>{isPosting ? 'Posting...' : 'Post'}</button>
                </div>

                {composerError && <p className="error-text">{composerError}</p>}
              </form>
            </div>
          </div>
        )}

        {isEditProfileOpen && (
          <div className="modal-backdrop" onClick={() => setIsEditProfileOpen(false)}>
            <div className="composer-modal" onClick={(event) => event.stopPropagation()}>
              <h3>Edit Profile</h3>
              <label>
                Display name
                <input value={editProfileName} onChange={(event) => setEditProfileName(event.target.value)} />
              </label>
              <div className="reply-bar">
                <button type="button" className="ghost-btn" onClick={() => setIsEditProfileOpen(false)}>Cancel</button>
                <button type="button" className="auth-submit" onClick={handleSaveProfile}>Save</button>
              </div>
            </div>
          </div>
        )}

        {otherProfile && (
          <div className="modal-backdrop" onClick={() => setOtherProfile(null)}>
            <div className="composer-modal profile-modal" onClick={(event) => event.stopPropagation()}>
              <div className="profile-head">
                <div>
                  <h2>{isLoadingOtherProfile ? 'Loading...' : otherProfile.name}</h2>
                  {!isLoadingOtherProfile && <p>{formatHandle(otherProfile)}</p>}
                  {!isLoadingOtherProfile && (
                    <p className="muted-inline">
                      {otherProfile.followerCount || 0} followers · {otherProfile.threadCount || 0} posts
                    </p>
                  )}
                </div>
                <Avatar user={otherProfile} className="profile-avatar" size={128} />
              </div>

              <div className="profile-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => handleToggleFollow(otherProfile.id)}
                >
                  {getFollowLabel(otherProfile)}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => handleStartConversationWithProfile(otherProfile)}
                >
                  Message
                </button>
              </div>

              <div className="profile-tabs">
                <button type="button" className={otherProfileTab === 'threads' ? 'active' : ''} onClick={() => setOtherProfileTab('threads')}>Threads</button>
                <button type="button" className={otherProfileTab === 'answers' ? 'active' : ''} onClick={() => setOtherProfileTab('answers')}>Antworten</button>
                <button type="button" className={otherProfileTab === 'media' ? 'active' : ''} onClick={() => setOtherProfileTab('media')}>Medien</button>
                <button type="button" className={otherProfileTab === 'reposts' ? 'active' : ''} onClick={() => setOtherProfileTab('reposts')}>Reposts</button>
              </div>

              {isLoadingOtherProfileContent ? (
                <p className="muted-inline">Loading {otherProfileTab}...</p>
              ) : otherProfileItems.length === 0 ? (
                <p className="muted-inline">No items in {otherProfileTab} yet.</p>
              ) : (
                <ul className="profile-item-list">
                  {otherProfileItems.map((item) => (
                    <li key={`other-profile-item-${otherProfileTab}-${item.id}`} className="mini-card">
                      {otherProfileTab === 'answers' ? (
                        <>
                          <strong>{item.content}</strong>
                          <p>Reply on: {item.thread?.content || 'Unknown thread'}</p>
                        </>
                      ) : (
                        <>
                          <strong>{item.content}</strong>
                          {renderThreadMedia(item)}
                          <p>{item.likeCount || 0} likes · {item.replyCount || 0} replies · {item.repostCount || 0} reposts</p>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <nav className="bottom-nav">
          <button type="button" className={activeTab === 'home' ? 'nav-btn active' : 'nav-btn'} onClick={() => { setActiveTab('home'); setIsFeedSheetOpen(false); }}>⌂</button>
          <button type="button" className={activeTab === 'messages' ? 'nav-btn active' : 'nav-btn'} onClick={() => { setActiveTab('messages'); setIsFeedSheetOpen(false); }}>✉</button>
          <button type="button" className="nav-btn compose" onClick={openComposer}>+</button>
          <button type="button" className={activeTab === 'activity' ? 'nav-btn active' : 'nav-btn'} onClick={() => { setActiveTab('activity'); setIsFeedSheetOpen(false); }}>♥</button>
          <button type="button" className={activeTab === 'profile' ? 'nav-btn active' : 'nav-btn'} onClick={() => { setActiveTab('profile'); setIsFeedSheetOpen(false); }}>◉</button>
        </nav>

        <button type="button" className="logout-fab" onClick={handleLogout}>Logout</button>

        {noticeMessage && <div className="notice-toast">{noticeMessage}</div>}
      </div>
    </div>
  );
}
