const express = require('express');

const stockController = require('./stock.controller');
const {
  authenticate,
  requirePasswordChangeCompleted,
} = require('../../middlewares/auth.middleware');
const { authorize } = require('../../middlewares/role.middleware');

const productRouter = express.Router();
const stockRouter = express.Router();

// Middleware for all routes
const commonMiddleware = [authenticate, requirePasswordChangeCompleted];

/**
 * Product Routes (Registered under /api/products)
 */
productRouter.use(...commonMiddleware);

productRouter.get('/', stockController.getProducts);
productRouter.get('/:id', stockController.getProduct);
productRouter.get('/:id/qrcode', stockController.getProductQrCode);
productRouter.post('/', authorize('ADMIN', 'STOCK'), stockController.createProduct);
productRouter.put('/:id', authorize('ADMIN', 'STOCK'), stockController.updateProduct);
productRouter.delete('/:id', authorize('ADMIN', 'STOCK'), stockController.deleteProduct);

/**
 * Stock Routes (Registered under /api/stock)
 */
stockRouter.use(...commonMiddleware);

stockRouter.post('/movement', authorize('ADMIN', 'STOCK'), stockController.recordMovement);
stockRouter.get('/movements', stockController.getMovements);
stockRouter.get('/alerts', stockController.getAlerts);

module.exports = {
  productRouter,
  stockRouter,
};
