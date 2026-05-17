const qualityService = require('./quality.service');
const qualityReportService = require('./quality-report.service');
const notificationService = require('../notification/notification.service');
const { sendEmail } = require('../../services/firebase-email.service');
const { db, admin } = require('../../config/firebase.config');

const SHARED_REPORTS_COLLECTION = 'shared_reports';

const saveShareRecord = async (data) => {
  const docRef = db.collection(SHARED_REPORTS_COLLECTION).doc();
  await docRef.set({
    id: docRef.id,
    ...data,
    sharedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
};

const createTest = async (req, res, next) => {
  try {
    const test = await qualityService.createTest(req.body, req.user);
    res.status(201).json({ status: 'success', data: { test } });
  } catch (error) {
    next(error);
  }
};

const getTests = async (req, res, next) => {
  try {
    const result = await qualityService.listTests(req.query);
    res.status(200).json({ status: 'success', ...result });
  } catch (error) {
    next(error);
  }
};

const getTest = async (req, res, next) => {
  try {
    const test = await qualityService.getTestById(req.params.id);
    res.status(200).json({ status: 'success', data: { test } });
  } catch (error) {
    next(error);
  }
};

const updateTest = async (req, res, next) => {
  try {
    const test = await qualityService.updateTest(req.params.id, req.body, req.user);
    res.status(200).json({ status: 'success', data: { test } });
  } catch (error) {
    next(error);
  }
};

const downloadTestReport = async (req, res, next) => {
  try {
    let test;
    try {
      test = await qualityService.getTestById(req.params.id);
    } catch (err) {
      if (err.statusCode === 404) {
        const pdfBuffer = await qualityReportService.generateNotFoundPdf(req.params.id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="not-found-${req.params.id}.pdf"`);
        return res.send(pdfBuffer);
      }
      throw err;
    }

    if (qualityReportService.reportExists(test.id)) {
      const stream = qualityReportService.getReportStream(test.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="quality-test-${test.id}.pdf"`);
      return stream.pipe(res);
    }

    const pdfBuffer = await qualityReportService.generateTestPdf(test);
    qualityReportService.saveReport(test.id, pdfBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="quality-test-${test.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

const downloadTestsReport = async (req, res, next) => {
  try {
    const result = await qualityService.listTests(req.query);
    const pdfBuffer = await qualityReportService.generateTestsPdf(result.items, result.pagination);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="quality-tests-report.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

const shareTestReport = async (req, res, next) => {
  try {
    let test;
    try {
      test = await qualityService.getTestById(req.params.id);
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({
          status: 'error',
          message: 'Test qualité introuvable',
          details: `Aucun test trouvé avec l'identifiant: ${req.params.id}`,
        });
      }
      throw err;
    }

    if (!qualityReportService.reportExists(test.id)) {
      const pdfBuffer = await qualityReportService.generateTestPdf(test);
      qualityReportService.saveReport(test.id, pdfBuffer);
    }

    const adminSnapshot = await db
      .collection('users')
      .where('role', '==', 'ADMIN')
      .where('isActive', '==', true)
      .get();

    const admins = adminSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    await notificationService.sendNotification({
      title: '📊 Rapport de Test Partagé',
      message: `${req.user.nom} a partagé un rapport de test qualité (#${test.id.substring(0, 8)}).`,
      type: 'INFO',
      targetType: 'ROLE',
      targetValue: 'ADMIN',
    });

    await Promise.all(
      admins.map((admin) =>
        sendEmail({
          to: admin.email,
          subject: `Rapport de Test Qualité - #${test.id.substring(0, 8)}`,
          text: [
            `Bonjour ${admin.nom},`,
            '',
            `${req.user.nom} a partagé un rapport de test qualité avec vous.`,
            '',
            `Test ID: ${test.id}`,
            `Statut: ${test.status}`,
            `Produit: ${test.batch?.productId?.name || 'N/A'}`,
            `Testé par: ${test.testedBy?.nom || 'N/A'}`,
            '',
            `Vous pouvez télécharger le rapport ici: ${req.protocol}://${req.get('host')}/api/quality/report/${test.id}`,
            '',
            'Cordialement,',
            "L'équipe de gestion de la qualité",
          ].join('\n'),
          html: [
            `<p>Bonjour <strong>${admin.nom}</strong>,</p>`,
            `<p>${req.user.nom} a partagé un rapport de test qualité avec vous.</p>`,
            '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0">',
            `<tr><td><strong>Test ID</strong></td><td>${test.id}</td></tr>`,
            `<tr><td><strong>Statut</strong></td><td>${test.status}</td></tr>`,
            `<tr><td><strong>Produit</strong></td><td>${test.batch?.productId?.name || 'N/A'}</td></tr>`,
            `<tr><td><strong>Testé par</strong></td><td>${test.testedBy?.nom || 'N/A'}</td></tr>`,
            '</table>',
            `<p><a href="${req.protocol}://${req.get('host')}/api/quality/report/${test.id}">Télécharger le rapport PDF</a></p>`,
            '<br>',
            '<p>Cordialement,<br>L\'équipe de gestion de la qualité</p>',
          ].join('\n'),
        })
      )
    );

    await saveShareRecord({
      testId: test.id,
      testStatus: test.status,
      productName: test.batch?.productId?.name || null,
      sharedBy: { id: req.user.userId, nom: req.user.nom },
      type: 'single',
      downloadUrl: `/api/quality/report/${test.id}`,
    });

    res.status(200).json({ status: 'success', message: 'Rapport partagé avec les administrateurs' });
  } catch (error) {
    next(error);
  }
};

const shareTestsReport = async (req, res, next) => {
  try {
    const result = await qualityService.listTests(req.query);
    const pdfBuffer = await qualityReportService.generateTestsPdf(result.items, result.pagination);

    const adminSnapshot = await db
      .collection('users')
      .where('role', '==', 'ADMIN')
      .where('isActive', '==', true)
      .get();

    const admins = adminSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    await notificationService.sendNotification({
      title: '📊 Rapport Global Partagé',
      message: `${req.user.nom} a partagé un rapport global de ${result.items.length} test(s) qualité.`,
      type: 'INFO',
      targetType: 'ROLE',
      targetValue: 'ADMIN',
    });

    const bodyText = [
      `Bonjour,`,
      '',
      `${req.user.nom} a partagé un rapport global de ${result.items.length} test(s) qualité.`,
      '',
      `Total des tests: ${result.pagination.total}`,
      '',
      `Vous pouvez télécharger le rapport ici: ${req.protocol}://${req.get('host')}/api/quality/report`,
      '',
      'Cordialement,',
      "L'équipe de gestion de la qualité",
    ].join('\n');

    await Promise.all(
      admins.map((admin) =>
        sendEmail({
          to: admin.email,
          subject: `Rapport Global des Tests Qualité — ${result.pagination.total} test(s)`,
          text: bodyText,
          html: bodyText.replace(/\n/g, '<br>'),
        })
      )
    );

    await saveShareRecord({
      testId: null,
      testStatus: null,
      productName: null,
      sharedBy: { id: req.user.userId, nom: req.user.nom },
      type: 'list',
      testCount: result.pagination.total,
      downloadUrl: '/api/quality/report',
    });

    res.status(200).json({ status: 'success', message: 'Rapport global partagé avec les administrateurs' });
  } catch (error) {
    next(error);
  }
};

const getSharedReports = async (req, res, next) => {
  try {
    const snapshot = await db
      .collection(SHARED_REPORTS_COLLECTION)
      .orderBy('sharedAt', 'desc')
      .limit(50)
      .get();

    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: data.id,
        testId: data.testId || null,
        testStatus: data.testStatus || null,
        productName: data.productName || null,
        sharedBy: data.sharedBy || null,
        sharedAt: data.sharedAt
          ? typeof data.sharedAt.toDate === 'function'
            ? data.sharedAt.toDate().toISOString()
            : data.sharedAt
          : null,
        type: data.type || 'single',
        testCount: data.testCount || null,
        downloadUrl: data.downloadUrl || null,
      };
    });

    res.status(200).json({ status: 'success', data: { items } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTest,
  getTests,
  getTest,
  updateTest,
  downloadTestReport,
  downloadTestsReport,
  shareTestReport,
  shareTestsReport,
  getSharedReports,
};
