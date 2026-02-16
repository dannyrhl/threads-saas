import React, { useEffect, useMemo, useState } from 'react';

const TOKEN_KEY = 'threads_token';

async function apiRequest(path, options = {}) {
  const response = await fetch(path, options);
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
  return new Date(value).toLocaleString();
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(null);
  const [threads, setThreads] = useState([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isRefreshingFeed, setIsRefreshingFeed] = useState(false);
  const [likeThreadIdInFlight, setLikeThreadIdInFlight] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [feedError, setFeedError] = useState('');
  const [composerError, setComposerError] = useState('');

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [threadContent, setThreadContent] = useState('');

  const isAuthenticated = Boolean(user && token);
  const remainingChars = useMemo(() => 280 - threadContent.length, [threadContent]);

  async function loadThreads() {
    setIsRefreshingFeed(true);
    setFeedError('');

    try {
      const data = await apiRequest('/api/threads');
      setThreads(data.threads || []);
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setIsRefreshingFeed(false);
    }
  }

  function updateThreadLikeCount(threadId, likeCount) {
    setThreads((prevThreads) => prevThreads.map((thread) => (
      thread.id === threadId
        ? { ...thread, likeCount }
        : thread
    )));
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      setIsBooting(true);
      await loadThreads();

      if (!token) {
        if (isMounted) {
          setIsBooting(false);
        }
        return;
      }

      try {
        const data = await apiRequest('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (isMounted) {
          setUser(data.user);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        if (isMounted) {
          setToken('');
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsBooting(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError('');
    setIsSubmittingAuth(true);

    const isRegister = authMode === 'register';
    const path = isRegister ? '/api/auth/register' : '/api/auth/login';
    const body = isRegister ? registerForm : loginForm;

    try {
      const data = await apiRequest(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);

      setLoginForm({ email: '', password: '' });
      setRegisterForm({ name: '', email: '', password: '' });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function handleCreateThread(event) {
    event.preventDefault();
    setComposerError('');

    if (!threadContent.trim()) {
      setComposerError('Thread content is required');
      return;
    }

    if (threadContent.length > 280) {
      setComposerError('Thread content must be 280 characters or fewer');
      return;
    }

    setIsPosting(true);

    try {
      await apiRequest('/api/threads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: threadContent }),
      });

      setThreadContent('');
      await loadThreads();
    } catch (error) {
      setComposerError(error.message);
    } finally {
      setIsPosting(false);
    }
  }

  async function handleLike(threadId) {
    if (!isAuthenticated) {
      setFeedError('Please sign in to like threads');
      return;
    }

    setFeedError('');
    setLikeThreadIdInFlight(threadId);

    try {
      const data = await apiRequest(`/api/threads/${threadId}/likes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      updateThreadLikeCount(threadId, data.likeCount);
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setLikeThreadIdInFlight(null);
    }
  }

  async function handleUnlike(threadId) {
    if (!isAuthenticated) {
      setFeedError('Please sign in to unlike threads');
      return;
    }

    setFeedError('');
    setLikeThreadIdInFlight(threadId);

    try {
      const data = await apiRequest(`/api/threads/${threadId}/likes`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      updateThreadLikeCount(threadId, data.likeCount);
    } catch (error) {
      setFeedError(error.message);
    } finally {
      setLikeThreadIdInFlight(null);
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(null);
    setThreadContent('');
    setComposerError('');
  }

  if (isBooting) {
    return (
      <div className="app-shell">
        <div className="card status-card">Loading Threads frontend...</div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="ambient-glow" aria-hidden="true" />

      <main className="layout">
        <section className="card hero-card">
          <p className="eyebrow">Threads SaaS</p>
          <h1>Ship ideas as threads.</h1>
          <p className="hero-subtext">
            Login, post new threads, and view the latest feed from your backend.
          </p>
        </section>

        {!isAuthenticated && (
          <section className="card auth-card">
            <div className="auth-mode-toggle">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                }}
                className={authMode === 'login' ? 'active' : ''}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                }}
                className={authMode === 'register' ? 'active' : ''}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="stack-form">
              {authMode === 'register' && (
                <label>
                  Name
                  <input
                    value={registerForm.name}
                    onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Alice"
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
                  placeholder="you@example.com"
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
                  placeholder="••••••••"
                  required
                />
              </label>

              {authError && <p className="error-text">{authError}</p>}

              <button type="submit" disabled={isSubmittingAuth}>
                {isSubmittingAuth ? 'Submitting...' : authMode === 'register' ? 'Create account' : 'Sign in'}
              </button>
            </form>
          </section>
        )}

        {isAuthenticated && (
          <section className="card composer-card">
            <div className="composer-header">
              <div>
                <p className="eyebrow">Signed in</p>
                <h2>{user.name}</h2>
              </div>
              <button type="button" className="ghost-btn" onClick={handleLogout}>Logout</button>
            </div>

            <form onSubmit={handleCreateThread} className="stack-form">
              <label>
                New thread
                <textarea
                  value={threadContent}
                  onChange={(event) => setThreadContent(event.target.value)}
                  placeholder="Share something..."
                  rows={4}
                  maxLength={280}
                />
              </label>

              <div className="composer-footer">
                <span className={remainingChars < 20 ? 'counter low' : 'counter'}>{remainingChars} chars left</span>
                <button type="submit" disabled={isPosting}>{isPosting ? 'Posting...' : 'Post thread'}</button>
              </div>

              {composerError && <p className="error-text">{composerError}</p>}
            </form>
          </section>
        )}

        <section className="card feed-card">
          <div className="feed-header">
            <h2>Feed</h2>
            <button type="button" className="ghost-btn" onClick={loadThreads} disabled={isRefreshingFeed}>
              {isRefreshingFeed ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {feedError && <p className="error-text">{feedError}</p>}

          {threads.length === 0 ? (
            <p className="muted-text">No threads yet.</p>
          ) : (
            <ul className="thread-list">
              {threads.map((thread) => (
                <li key={thread.id} className="thread-item">
                  <div className="thread-topline">
                    <strong>{thread.author?.name || 'Unknown'}</strong>
                    <span>{formatDate(thread.createdAt)}</span>
                  </div>
                  <p>{thread.content}</p>
                  <div className="thread-actions">
                    <span className="like-count">{thread.likeCount || 0} likes</span>
                    {isAuthenticated && (
                      <div className="like-buttons">
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => handleLike(thread.id)}
                          disabled={likeThreadIdInFlight === thread.id}
                        >
                          Like
                        </button>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => handleUnlike(thread.id)}
                          disabled={likeThreadIdInFlight === thread.id}
                        >
                          Unlike
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
