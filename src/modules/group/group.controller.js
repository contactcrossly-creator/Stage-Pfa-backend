const groupService = require('./group.service');

const createGroup = async (req, res, next) => {
  try {
    const group = await groupService.createGroup(req.body, req.user);
    res.status(201).json({
      status: 'success',
      data: { group },
    });
  } catch (error) {
    next(error);
  }
};

const getGroups = async (req, res, next) => {
  try {
    const result = await groupService.listGroups(req.query, req.user);
    res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getGroup = async (req, res, next) => {
  try {
    const group = await groupService.getGroupById(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { group },
    });
  } catch (error) {
    next(error);
  }
};

const updateGroup = async (req, res, next) => {
  try {
    const group = await groupService.updateGroup(req.params.id, req.body, req.user);
    res.status(200).json({
      status: 'success',
      data: { group },
    });
  } catch (error) {
    next(error);
  }
};

const deleteGroup = async (req, res, next) => {
  try {
    await groupService.deleteGroup(req.params.id, req.user);
    res.status(200).json({
      status: 'success',
      message: 'Group deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

const addMembers = async (req, res, next) => {
  try {
    const group = await groupService.addMembers(req.params.id, req.body, req.user);
    res.status(200).json({
      status: 'success',
      data: { group },
    });
  } catch (error) {
    next(error);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const group = await groupService.removeMember(req.params.id, req.params.userId, req.user);
    res.status(200).json({
      status: 'success',
      data: { group },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGroup,
  getGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  addMembers,
  removeMember,
};
