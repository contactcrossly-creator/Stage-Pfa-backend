const productionService = require('./production.service');

const createProduction = async (req, res, next) => {
  try {
    const batch = await productionService.createProduction(req.body, req.user);
    res.status(201).json({ status: 'success', data: { batch } });
  } catch (error) {
    next(error);
  }
};

const getProductions = async (req, res, next) => {
  try {
    const batches = await productionService.listProductions();
    res.status(200).json({ status: 'success', data: { batches } });
  } catch (error) {
    next(error);
  }
};

const getProduction = async (req, res, next) => {
  try {
    const batch = await productionService.getBatchById(req.params.id);
    res.status(200).json({ status: 'success', data: { batch } });
  } catch (error) {
    next(error);
  }
};

const startProduction = async (req, res, next) => {
  try {
    const batch = await productionService.startProduction(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: { batch } });
  } catch (error) {
    next(error);
  }
};

const completeProduction = async (req, res, next) => {
  try {
    const batch = await productionService.completeProduction(req.params.id, req.body, req.user);
    res.status(200).json({ status: 'success', data: { batch } });
  } catch (error) {
    next(error);
  }
};

const cancelProduction = async (req, res, next) => {
  try {
    const batch = await productionService.cancelProduction(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: { batch } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProduction,
  getProductions,
  getProduction,
  startProduction,
  completeProduction,
  cancelProduction,
};
