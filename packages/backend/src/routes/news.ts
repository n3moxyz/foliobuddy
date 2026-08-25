import { Router } from 'express';
import { newsService } from '../services/newsService.js';
import { newsEnrichmentService } from '../services/news/enrichmentService.js';

const router = Router();

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

export default router;
