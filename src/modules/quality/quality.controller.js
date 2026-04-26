const qualityService = require('./quality.service');

const createTest = async (req, res, next) => {
  try {
    const test = await qualityService.createTest(req.body, req.user);
    res.status(201).json({ status: 'success', data: { test } });
  } catch (error) {
    next(error);
  }
};

const getTests = async (req, res, next) => {
  try {
    const result = await qualityService.listTests(req.query);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

const getTest = async (req, res, next) => {
  try {
    const test = await qualityService.getTestById(req.params.id);
    res.status(200).json({ status: 'success', data: { test } });
  } catch (error) {
    next(error);
  }
};

const updateTest = async (req, res, next) => {
  try {
    const test = await qualityService.updateTest(req.params.id, req.body, req.user);
    res.status(200).json({ status: 'success', data: { test } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTest,
  getTests,
  getTest,
  updateTest,
};
