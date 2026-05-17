const userService = require('./user.service');

const getProfile = async (req, res, next) => {
  try {
    res.status(200).json({
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

const getAdminDashboard = async (req, res, next) => {
  try {
    res.status(200).json({
      message: 'Admin-only resource granted',
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const result = await userService.createUser(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const result = await userService.listUsers(req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserDetails(req.params.id);
    res.status(200).json({ user });
  } catch (error) {
    if (error.statusCode === 404) {
      return res.status(200).json({
        user: { id: req.params.id, nom: 'Utilisateur supprimé' },
      });
    }
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const result = await userService.deleteUser(req.params.id, req.user);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const getUserByFirebaseUid = async (req, res, next) => {
  try {
    const user = await userService.getUserByFirebaseUid(req.params.firebaseUid);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const result = await userService.updateOwnPassword(req.user.userId, req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  getAdminDashboard,
  createUser,
  listUsers,
  getUserById,
  getUserByFirebaseUid,
  updateUser,
  deleteUser,
  changePassword,
};
