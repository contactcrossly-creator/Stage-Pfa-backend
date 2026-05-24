const QRCode = require('qrcode');

const QR_BASE_URL = process.env.QR_BASE_URL || '';

const buildQrContent = (type, id, label) => {
  if (QR_BASE_URL) {
    return `${QR_BASE_URL}/${type}s/${id}`;
  }
  return JSON.stringify({ type, id, label });
};

const generateQrDataUrl = async (type, id, label) => {
  const content = buildQrContent(type, id, label);
  return QRCode.toDataURL(content);
};

const generateQrBuffer = async (type, id, label) => {
  const content = buildQrContent(type, id, label);
  return QRCode.toBuffer(content);
};

module.exports = {
  generateQrDataUrl,
  generateQrBuffer,
};
