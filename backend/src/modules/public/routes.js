const express = require('express');
const router = express.Router();
const {
  submitInquiry,
  getShipmentTracking
} = require('./controller');

router.post('/contact', submitInquiry);
router.get('/tracking/:vehicleNumber', getShipmentTracking);

module.exports = router;
