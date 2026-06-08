const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');

const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const { verifyFirebaseToken } = require('./middleware/auth.middleware');
const chatbotRouter = require('./routes/chatbot');

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api', routes);
app.use('/api/chatbot', verifyFirebaseToken, chatbotRouter);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
