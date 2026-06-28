const Shipment = require('../shipments/model');
const Tracking = require('../tracking/model');
const Driver = require('../drivers/driverModel');
const Vehicle = require('../vehicles/model');
const Inquiry = require('./model');
const sendResponse = require('../../utils/response');

const statusSteps = [
  { id: 'pending', title: 'Pending', location: 'Warehouse' },
  { id: 'loaded', title: 'Loaded', location: 'Loading Bay' },
  { id: 'dispatched', title: 'Dispatched', location: 'Dispatch Terminal' },
  { id: 'in-transit', title: 'In Transit', location: 'Highway' },
  { id: 'arrived', title: 'Arrived at Branch', location: 'Branch Office' },
  { id: 'out-for-delivery', title: 'Out for Delivery', location: 'Branch Office' },
  { id: 'delivered', title: 'Delivered', location: 'Delivery Address' }
];

const normalizeConsignmentNumber = (value) => String(value || '').trim().toUpperCase();

const buildTimeline = (currentStatus, statusHistory = []) => {
  const historyMap = {};

  for (const entry of statusHistory) {
    historyMap[entry.status] = new Date(entry.timestamp);
  }

  const currentIndex = Math.max(statusSteps.findIndex((step) => step.title === currentStatus), 0);

  return statusSteps
    .map((step, index) => {
      const recordedTime = historyMap[step.title];

      if (index < currentIndex && recordedTime) {
        return { ...step, status: 'completed', time: recordedTime.toISOString() };
      }

      if (index === currentIndex) {
        return { ...step, status: 'active', time: (recordedTime || new Date()).toISOString() };
      }

      return null;
    })
    .filter(Boolean);
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeVehicleNumber = (value) => String(value || '').trim().toUpperCase();

const isValidCoordinatePair = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
};

const resolveVehicleLocation = async (vehicleNumber, fallbackAddress = '') => {
  const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);

  if (!normalizedVehicleNumber) {
    return null;
  }

  const vehicle = await Vehicle.findOne({ vehicleNo: normalizedVehicleNumber }).lean();
  let location = null;
  let source = null;

  if (vehicle) {
    const tracking = await Tracking.findOne({ vehicle: vehicle._id }).lean();

    if (isValidCoordinatePair(tracking?.currentLocation?.lat, tracking?.currentLocation?.lng)) {
      location = {
        lat: Number(tracking.currentLocation.lat),
        lng: Number(tracking.currentLocation.lng),
        address: tracking.currentLocation.address || fallbackAddress || vehicle.currentLocation?.address || '',
        lastUpdate: tracking.lastUpdate || null
      };
      source = 'tracking';
    } else {
      const [lng, lat] = Array.isArray(vehicle.currentLocation?.coordinates)
        ? vehicle.currentLocation.coordinates
        : [];

      if (isValidCoordinatePair(lat, lng)) {
        location = {
          lat: Number(lat),
          lng: Number(lng),
          address: vehicle.currentLocation?.address || fallbackAddress || '',
          lastUpdate: vehicle.createdAt || null
        };
        source = 'vehicle';
      }
    }
  }

  return location ? { ...location, source } : null;
};

const findShipmentByVehicleNumber = async (vehicleNumber) => {
  const normalizedVehicleNumber = normalizeVehicleNumber(vehicleNumber);

  if (!normalizedVehicleNumber) {
    return null;
  }

  const exactMatch = new RegExp(`^${escapeRegex(normalizedVehicleNumber)}$`, 'i');

  return Shipment.findOne({
    $or: [
      { vehicleNumber: exactMatch },
      { consignmentNumber: exactMatch }
    ]
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
};

exports.submitInquiry = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const phone = String(req.body.phone || '').trim();
    const message = String(req.body.message || '').trim();
    const source = String(req.body.source || 'website').trim() || 'website';
    const page = String(req.body.page || 'contact-section').trim();

    if (!name || !email || !message) {
      return sendResponse(res, 400, false, 'Please provide name, email, and message.');
    }

    const inquiry = await Inquiry.create({
      name,
      email,
      phone,
      message,
      source,
      page
    });

    return sendResponse(res, 201, true, 'Inquiry submitted successfully', {
      id: inquiry._id,
      name: inquiry.name,
      email: inquiry.email,
      createdAt: inquiry.createdAt
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

exports.getShipmentTracking = async (req, res) => {
  try {
    const vehicleNumber = normalizeVehicleNumber(req.params.vehicleNumber);

    if (!vehicleNumber) {
      return sendResponse(res, 400, false, 'Please provide a vehicle number.');
    }

    const shipment = await findShipmentByVehicleNumber(vehicleNumber);

    if (!shipment) {
      return sendResponse(res, 404, false, `No shipment found for vehicle number "${vehicleNumber}" in the connected database.`);
    }

    const currentStatus = shipment.outgoingStatus || 'Pending';
    const origin = shipment.consignor?.city || shipment.consignor?.place || shipment.consignor?.name || 'Origin';
    const destination = shipment.consignee?.city || shipment.toBranch || shipment.consignee?.name || 'Destination';
    const normalizedShipmentVehicleNumber = normalizeVehicleNumber(shipment.vehicleNumber || vehicleNumber);
    const [vehicle, driver, vehicleLocation] = await Promise.all([
      Vehicle.findOne({ vehicleNo: normalizedShipmentVehicleNumber }).select('vehicleNo type owner').lean(),
      Driver.findOne({ vehicleNumber: normalizedShipmentVehicleNumber }).lean(),
      resolveVehicleLocation(normalizedShipmentVehicleNumber, destination)
    ]);

    const ownerInfo = vehicle?.owner || {};
    const driverName = driver?.name || ownerInfo.name || 'Not Assigned';
    const driverPhone = driver?.phone || ownerInfo.phone || '-';
    const vehicleType = vehicle?.type || 'Transport Vehicle';
    const locationDetails = vehicleLocation || {
      lat: null,
      lng: null,
      address: destination,
      source: 'shipment'
    };
    const shipmentSummary = {
      lrNo: shipment.consignmentNumber,
      origin,
      destination,
      sender: shipment.consignor?.name || '',
      receiver: shipment.consignee?.name || '',
      cargoType: shipment.packageType || 'Goods',
      packages: shipment.quantity ?? 0,
      weight: `${shipment.chargedWeight ?? shipment.actualWeight ?? 0} kg`,
      value: `₹${Number(shipment.totalFreight || shipment.totalPayable || 0).toLocaleString()}`,
      challanNo: `CHL-${String(shipment.consignmentNumber || '').slice(-6)}`
    };
    const timeline = buildTimeline(currentStatus, shipment.statusHistory || []);

    return sendResponse(res, 200, true, 'Tracking details fetched successfully', {
      consignmentNumber: shipment.consignmentNumber,
      vehicleNumber: normalizedShipmentVehicleNumber,
      bookingStatus: shipment.status,
      currentStatus,
      vehicleType,
      driverName,
      driverPhone,
      vehicleLocation: locationDetails,
      currentLocation: locationDetails,
      route: {
        origin,
        destination
      },
      sender: {
        name: shipment.consignor?.name || '',
        city: shipment.consignor?.city || '',
        phoneNumber: shipment.consignor?.phoneNumber || ''
      },
      receiver: {
        name: shipment.consignee?.name || '',
        city: shipment.consignee?.city || '',
        phoneNumber: shipment.consignee?.phoneNumber || ''
      },
      packageType: shipment.packageType,
      quantity: shipment.quantity,
      chargedWeight: shipment.chargedWeight,
      totalFreight: shipment.totalFreight,
      lastUpdate: shipment.updatedAt || shipment.createdAt,
      description: shipment.description,
      totalPayable: shipment.totalPayable,
      timeline,
      trackingHistory: timeline,
      shipment: shipmentSummary
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};
