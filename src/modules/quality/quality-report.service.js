const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'reports');

const getReportPath = (testId) => path.join(REPORTS_DIR, `quality-test-${testId}.pdf`);

const generateTestPdf = (test) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const { batch } = test;
    const testerName = test.testedBy?.nom || 'N/A';
    const productName = batch?.productId?.name || 'N/A';
    const batchId = batch?.id || test.batchId;

    const formatDate = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR') : 'N/A');

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Rapport de Test Qualité', { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#666')
      .text(`Généré le ${new Date().toLocaleString('fr-FR')}`, { align: 'center' });
    doc.moveDown(1.5);

    // Horizontal line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(1);

    // Test Information Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Informations du Test');
    doc.moveDown(0.5);

    const testInfoRows = [
      ['ID du Test:', test.id],
      ['Statut:', test.status === 'PASSED' ? '✅ Réussi' : test.status === 'FAILED' ? '❌ Échoué' : test.status],
      ['Testé par:', testerName],
      ['Date du test:', formatDate(test.testedAt)],
      ['Notes:', test.notes || 'Aucune note'],
    ];

    testInfoRows.forEach(([label, value]) => {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555').text(label, { continued: true });
      doc.font('Helvetica').fillColor('#333').text(` ${value}`, { indent: 0 });
    });

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(1);

    // Batch / Product Section
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333').text('Informations du Lot / Produit');
    doc.moveDown(0.5);

    const batchInfoRows = [
      ['Produit:', productName],
      ['ID du Lot:', batchId],
      ['Quantité Planifiée:', batch?.quantityPlanned?.toString() || 'N/A'],
      ['Quantité Produite:', batch?.quantityProduced?.toString() || 'N/A'],
      ['Statut du Lot:', batch?.status || 'N/A'],
      ['Date de création:', formatDate(batch?.createdAt)],
      ['Date de début:', formatDate(batch?.startedAt)],
      ['Date de fin:', formatDate(batch?.endedAt)],
    ];

    batchInfoRows.forEach(([label, value]) => {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#555').text(label, { continued: true });
      doc.font('Helvetica').fillColor('#333').text(` ${value}`, { indent: 0 });
    });

    doc.moveDown(2);

    // Footer line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#999')
      .text('Document généré automatiquement par le système de gestion de la qualité.', { align: 'center' });

    doc.end();
  });

const generateTestsPdf = (tests, pagination) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
    });

    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const formatDate = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR') : 'N/A');

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Rapport des Tests Qualité', { align: 'center' });
    doc.fontSize(9).font('Helvetica').fillColor('#666')
      .text(`Généré le ${new Date().toLocaleString('fr-FR')} — ${tests.length} test(s)`, { align: 'center' });
    doc.moveDown(1.5);

    doc.moveTo(40, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const colWidths = [130, 65, 100, 130, 85];
    const headers = ['ID du Test', 'Statut', 'Testé par', 'Produit', 'Date'];

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    let x = 40;
    headers.forEach((header, i) => {
      doc.rect(x, tableTop, colWidths[i], 18).fill('#333');
      doc.fillColor('#fff').text(header, x + 5, tableTop + 4, {
        width: colWidths[i] - 10,
        align: 'left',
      });
      doc.fillColor('#333');
      x += colWidths[i];
    });

    let currentY = tableTop + 18;
    doc.fillColor('#333');

    // Table rows
    tests.forEach((test, rowIndex) => {
      if (currentY > 720) {
        doc.addPage();
        currentY = 50;
      }

      const testerName = test.testedBy?.nom || 'N/A';
      const productName = test.batch?.productId?.name || 'N/A';
      const rowData = [
        test.id.substring(0, 16) + '...',
        test.status === 'PASSED' ? '✅ Réussi' : test.status === 'FAILED' ? '❌ Échoué' : test.status,
        testerName,
        productName,
        formatDate(test.testedAt),
      ];

      const rowColor = rowIndex % 2 === 0 ? '#f9f9f9' : '#fff';

      x = 40;
      rowData.forEach((data, i) => {
        doc.rect(x, currentY, colWidths[i], 18).fill(rowColor);
        doc.fillColor('#333').fontSize(8).font('Helvetica').text(data, x + 3, currentY + 4, {
          width: colWidths[i] - 6,
          align: 'left',
        });
        x += colWidths[i];
      });

      currentY += 18;
    });

    // Footer
    doc.moveDown(1);
    doc.moveTo(40, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#999')
      .text('Document généré automatiquement par le système de gestion de la qualité.', { align: 'center' });

    doc.end();
  });

const reportExists = (testId) => fs.existsSync(getReportPath(testId));

const getReportStream = (testId) => {
  const filePath = getReportPath(testId);
  if (!fs.existsSync(filePath)) return null;
  return fs.createReadStream(filePath);
};

const saveReport = (testId, buffer) => {
  const filePath = getReportPath(testId);
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

const deleteReport = (testId) => {
  const filePath = getReportPath(testId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

const generateNotFoundPdf = (id) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#c0392b')
      .text('Rapport non trouvé', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica').fillColor('#555')
      .text(`Aucun test qualité trouvé avec l'identifiant :`, { align: 'center' });
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#333')
      .text(id, { align: 'center' });
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica').fillColor('#999')
      .text("Veuillez vérifier l'identifiant du test ou contacter votre administrateur.", { align: 'center' });

    doc.end();
  });

module.exports = {
  generateTestPdf,
  generateTestsPdf,
  generateNotFoundPdf,
  reportExists,
  getReportStream,
  saveReport,
  deleteReport,
};
