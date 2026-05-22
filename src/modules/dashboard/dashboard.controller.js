const dashboardService = require('./dashboard.service');

const roleHandlerMap = {
  ADMIN: dashboardService.getDashboardStats,
  EMPLOYEE: (_, userId) => dashboardService.getEmployeeDashboard(userId),
  QUALITY: () => dashboardService.getQualityDashboard(),
  HSE: () => dashboardService.getHseDashboard(),
  STOCK: () => dashboardService.getStockDashboard(),
};

const getDashboardStats = async (req, res, next) => {
  try {
    const handler = roleHandlerMap[req.user.role];
    if (!handler) {
      return res.status(403).json({ status: 'fail', message: 'Forbidden' });
    }
    const stats = await handler(req, req.user.userId);
    res.status(200).json({ status: 'success', data: stats });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardStats };
