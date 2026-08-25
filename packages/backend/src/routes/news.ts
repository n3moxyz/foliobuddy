import { Router } from 'express';
import { z } from 'zod';
import { newsService } from '../services/newsService.js';
import { newsEnrichmentService } from '../services/news/enrichmentService.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Story metadata only — never portfolio values. The log stream is the
// collection mechanism; classifier tuning reads it offline.
const feedbackSchema = z.object({
  storyId: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  publisher: z.string().max(120).optional(),
  eventType: z.string().max(40).optional(),
  importance: z.enum(['high', 'medium', 'low']).optional(),
  symbol: z.string().max(20).optional(),
  reason: z.enum(['not_relevant', 'poor_source']),
});

// GET /api/news - Headlines for the user's holdings + open trades, plus macro
router.get('/', async (req, res, next) => {
  try {
    const news = await newsService.getPortfolioNews(req.userId!);
    res.json(news);
  } catch (error) {
    next(error);
  }
});

// GET /api/news/enrichment - AI summaries for this user's current Top stories.
// Read-only view of the background enrichment cache; returns whatever is ready.
router.get('/enrichment', (req, res, next) => {
  try {
    res.json(newsEnrichmentService.getResponseFor(req.userId!));
  } catch (error) {
    next(error);
  }
});

// POST /api/news/feedback - "Not relevant" / "Poor source" flags for ranking
// tuning. Logged, not stored: real feed feedback beats intuition-driven regexes.
router.post('/feedback', (req, res, next) => {
  try {
    const feedback = feedbackSchema.parse(req.body);
    logger.info(`[NewsFeedback] ${JSON.stringify({ userId: req.userId, ...feedback })}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
