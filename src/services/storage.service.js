const fs = require('fs');
const path = require('path');

const INCIDENTS_DIR = path.join(__dirname, '../../uploads/incidents');

const uploadFile = async (file) => {
  const filename = file.filename;

  return {
    filename,
    url: `/uploads/incidents/${filename}`,
  };
};

const deleteFile = async (filename) => {
  const filePath = path.join(INCIDENTS_DIR, filename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

module.exports = { uploadFile, deleteFile };
