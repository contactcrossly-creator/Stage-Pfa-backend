const hseService = require('./hse.service');

const createIncident = async (req, res, next) => {
  try {
    const incident = await hseService.createIncident(req.body, req.user);
    res.status(201).json({ status: 'success', data: { incident } });
  } catch (error) {
    next(error);
  }
};

const getIncidents = async (req, res, next) => {
  try {
    const result = await hseService.listIncidents(req.query, req.user);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

const getMyIncidents = async (req, res, next) => {
  try {
    const result = await hseService.listIncidents(req.query, req.user, true);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

const getIncident = async (req, res, next) => {
  try {
    const incident = await hseService.getIncidentById(req.params.id);
    res.status(200).json({ status: 'success', data: { incident } });
  } catch (error) {
    next(error);
  }
};

const updateIncident = async (req, res, next) => {
  try {
    const incident = await hseService.updateIncident(req.params.id, req.body, req.user);
    res.status(200).json({ status: 'success', data: { incident } });
  } catch (error) {
    next(error);
  }
};

const triggerAlert = async (req, res, next) => {
  try {
    const result = await hseService.triggerManualAlert(req.params.id, req.user);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

const deleteIncident = async (req, res, next) => {
  try {
    const result = await hseService.deleteIncident(req.params.id, req.user);
    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createIncident,
  getIncidents,
  getMyIncidents,
  getIncident,
  updateIncident,
  triggerAlert,
  deleteIncident,
};
