const stockService = require('./stock.service');

// --- Product Controllers ---

const createProduct = async (req, res, next) => {
  try {
    const product = await stockService.createProduct(req.body, req.user);
    res.status(201).json({ status: 'success', data: { product } });
  } catch (error) {
    next(error);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const products = await stockService.listProducts();
    res.status(200).json({ status: 'success', data: { products } });
  } catch (error) {
    next(error);
  }
};

const getProduct = async (req, res, next) => {
  try {
    const product = await stockService.getProductById(req.params.id);
    res.status(200).json({ status: 'success', data: { product } });
  } catch (error) {
    next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const product = await stockService.updateProduct(req.params.id, req.body, req.user);
    res.status(200).json({ status: 'success', data: { product } });
  } catch (error) {
    next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    await stockService.deleteProduct(req.params.id, req.user);
    res.status(200).json({ status: 'success', message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// --- Stock Movement Controllers ---

const recordMovement = async (req, res, next) => {
  try {
    const movement = await stockService.recordMovement(req.body, req.user);
    res.status(201).json({ status: 'success', data: { movement } });
  } catch (error) {
    next(error);
  }
};

const getMovements = async (req, res, next) => {
  try {
    const result = await stockService.listMovements(req.query);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

const getAlerts = async (req, res, next) => {
  try {
    const result = await stockService.listAlerts();
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  recordMovement,
  getMovements,
  getAlerts,
};
