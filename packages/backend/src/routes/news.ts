import { Router } from 'express';
import { newsService } from '../services/newsService.js';

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

export default router;
