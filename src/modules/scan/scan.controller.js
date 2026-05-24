const scanService = require('./scan.service');

const scan = async (req, res, next) => {
  try {
    const { qrContent } = req.body;
    if (!qrContent || typeof qrContent !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Le champ qrContent est requis',
      });
    }
    const result = await scanService.scan(qrContent, req.user);
    res.json({ status: 'success', data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { scan };
