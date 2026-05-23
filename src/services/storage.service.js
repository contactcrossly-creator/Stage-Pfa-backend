const { admin } = require('../config/firebase.config');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const getBucket = () => {
  const name = process.env.FIREBASE_STORAGE_BUCKET;
  return name ? admin.storage().bucket(name) : admin.storage().bucket();
};

const uploadFile = async (buffer, originalName, mimetype) => {
  const ext = path.extname(originalName);
  const filename = `${uuidv4()}${ext}`;
  const file = getBucket().file(filename);

  await file.save(buffer, {
    metadata: { contentType: mimetype },
  });

  await file.makePublic();

  return {
    filename,
    url: `https://storage.googleapis.com/${file.bucket.name}/${filename}`,
  };
};

const deleteFile = async (filename) => {
  await getBucket().file(filename).delete();
};

module.exports = { uploadFile, deleteFile };
