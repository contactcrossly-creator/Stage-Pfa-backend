const express = require('express');
const rateLimit = require('express-rate-limit');
const { db, admin } = require('../config/firebase.config');
const openaiService = require('../services/openai.service');
const contextService = require('../services/context.service');

const router = express.Router();

const { defaultKeyGenerator } = rateLimit;

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => {
    if (req.user?.uid) return req.user.uid;
    return defaultKeyGenerator(req);
  },
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/chatbot/message
 * Send a message to the AI chatbot
 * Body: { message: string, sessionId: string }
 */
router.post('/message', chatRateLimiter, async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    const uid = req.user.uid;
    const role = req.user.role;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required and must be a non-empty string' });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'SessionId is required' });
    }

    const messagesRef = db.collection('chat_sessions').doc(sessionId).collection('messages');
    const historySnapshot = await messagesRef.orderBy('timestamp', 'asc').limit(20).get();

    const conversationHistory = historySnapshot.docs.map((doc) => doc.data());

    const dbContext = await contextService.getSmartContext(role, message, uid);

    const aiResponse = await openaiService.chat(role, message, conversationHistory, dbContext);

    const batch = db.batch();
    const timestamp = admin.firestore.Timestamp.now();

    const sessionRef = db.collection('chat_sessions').doc(sessionId);
    batch.set(
      sessionRef,
      {
        userId: uid,
        role: role,
        updatedAt: timestamp,
      },
      { merge: true }
    );

    const userMessageRef = messagesRef.doc();
    batch.set(userMessageRef, {
      role: 'user',
      content: message,
      timestamp: timestamp,
    });

    const modelMessageRef = messagesRef.doc();
    batch.set(modelMessageRef, {
      role: 'model',
      content: aiResponse,
      timestamp: timestamp,
    });

    await batch.commit();

    res.status(200).json({
      response: aiResponse,
      sessionId: sessionId,
      timestamp: timestamp.toDate().toISOString(),
    });
  } catch (error) {
    console.error('Chatbot message error:', error);
    next(error);
  }
});

/**
 * GET /api/chatbot/sessions
 * Get all chat sessions for the current user
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const uid = req.user.uid;

    const sessionsSnapshot = await db
      .collection('chat_sessions')
      .where('userId', '==', uid)
      .get();

    const sessions = sessionsSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || 0;
        return bTime - aTime;
      })
      .slice(0, 10);

    res.status(200).json({ sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    next(error);
  }
});

/**
 * POST /api/chatbot/message/stream
 * Send a message and receive a streaming SSE response
 * Body: { message: string, sessionId: string }
 */
router.post('/message/stream', chatRateLimiter, async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;
    const uid = req.user.uid;
    const role = req.user.role;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required and must be a non-empty string' });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'SessionId is required' });
    }

    const messagesRef = db.collection('chat_sessions').doc(sessionId).collection('messages');
    const historySnapshot = await messagesRef.orderBy('timestamp', 'asc').limit(20).get();

    const conversationHistory = historySnapshot.docs.map((doc) => doc.data());

    const dbContext = await contextService.getSmartContext(role, message, uid);

    const stream = await openaiService.chatStream(role, message, conversationHistory, dbContext);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    const timestamp = admin.firestore.Timestamp.now();

    const batch = db.batch();
    const sessionRef = db.collection('chat_sessions').doc(sessionId);
    batch.set(
      sessionRef,
      { userId: uid, role: role, updatedAt: timestamp },
      { merge: true }
    );

    const userMessageRef = messagesRef.doc();
    batch.set(userMessageRef, {
      role: 'user',
      content: message,
      timestamp: timestamp,
    });

    const modelMessageRef = messagesRef.doc();
    batch.set(modelMessageRef, {
      role: 'model',
      content: fullResponse,
      timestamp: timestamp,
    });

    await batch.commit();

    res.write(`data: ${JSON.stringify({ done: true, sessionId, timestamp: timestamp.toDate().toISOString() })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Chatbot stream error:', error);
    if (!res.headersSent) {
      return next(error);
    }
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * DELETE /api/chatbot/session/:id
 * Delete a chat session and its messages
 */
router.delete('/session/:id', async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const uid = req.user.uid;

    const sessionRef = db.collection('chat_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    if (sessionData.userId !== uid) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messagesRef = sessionRef.collection('messages');
    const messagesSnapshot = await messagesRef.get();

    const batch = db.batch();

    messagesSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    batch.delete(sessionRef);

    await batch.commit();

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    next(error);
  }
});

module.exports = router;