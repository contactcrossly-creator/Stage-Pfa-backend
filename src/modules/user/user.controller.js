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

module.exports = {
  getProfile,
  getAdminDashboard,
};
