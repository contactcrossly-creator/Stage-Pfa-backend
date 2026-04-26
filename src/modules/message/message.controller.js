const messageService = require('./message.service');

const sendMessage = async (req, res, next) => {
  try {
    const message = await messageService.sendMessage(req.body, req.user);
    res.status(201).json({
      status: 'success',
      data: { message },
    });
  } catch (error) {
    next(error);
  }
};

const getMessages = async (req, res, next) => {
  try {
    const result = await messageService.listMessages(req.query, req.user);
    res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMessage,
  getMessages,
};
