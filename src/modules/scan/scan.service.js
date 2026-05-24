const { db } = require('../../config/firebase.config');
const { AppError } = require('../../utils/app-error.util');

const PRODUCTS_COLLECTION = 'products';
const PRODUCTIONS_COLLECTION = 'production_batches';

const parseQrContent = (content) => {
  try {
    const parsed = JSON.parse(content);
    if (parsed.type && parsed.id) {
      return { type: parsed.type, id: parsed.id };
    }
  } catch {
    // Not JSON, try URL format: /{type}s/{id}
  }

  const match = content.match(/\/(products|productions)\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return {
      type: match[1] === 'products' ? 'product' : 'production',
      id: match[2],
    };
  }

  throw new AppError('Format de code QR invalide', 400);
};

const scan = async (qrContent, actor) => {
  const { type, id } = parseQrContent(qrContent);

  if (type === 'product') {
    const snapshot = await db.collection(PRODUCTS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      throw new AppError('Produit non trouvé', 404);
    }
    return {
      type: 'product',
      entity: { id: snapshot.id, ...snapshot.data() },
    };
  }

  if (type === 'production') {
    const snapshot = await db.collection(PRODUCTIONS_COLLECTION).doc(id).get();
    if (!snapshot.exists) {
      throw new AppError('Lot de production non trouvé', 404);
    }
    return {
      type: 'production',
      entity: { id: snapshot.id, ...snapshot.data() },
    };
  }

  throw new AppError('Type d\'entité inconnu', 400);
};

module.exports = { scan };
