const groupService = require('./group.service');

const createGroup = async (req, res, next) => {
  try {
    const group = await groupService.createGroup(req.body, req.user);
    res.status(201).json({ group });
  } catch (error) {
    next(error);
  }
};

const listGroups = async (req, res, next) => {
  try {
    const result = await groupService.listGroups();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const assignUsers = async (req, res, next) => {
  try {
    const group = await groupService.assignUsersToGroup(req.params.id, req.body, req.user);
    res.status(200).json({ group });
  } catch (error) {
    next(error);
  }
};

const listUsersInGroup = async (req, res, next) => {
  try {
    const result = await groupService.listUsersInGroup(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGroup,
  listGroups,
  assignUsers,
  listUsersInGroup,
};
