const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    trim: true
  },
  phone: {
    type: String,
    default: '',
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Please add a message'],
    trim: true
  },
  source: {
    type: String,
    default: 'website'
  },
  page: {
    type: String,
    default: 'contact-section'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WebsiteContactSubmission', inquirySchema, 'contacts');
