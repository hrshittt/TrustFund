const mongoose = require('mongoose');

const LoanSchema = new mongoose.Schema({
  borrower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  purpose: {
    type: String,
    required: true
  },
  interestRate: {
    type: Number,
    required: true
  },
  term: {
    type: Number, // in months
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'funded', 'rejected', 'completed'],
    default: 'pending'
  },
  lender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  hasCollateral: {
    type: Boolean,
    default: false
  },
  paymentMode: {
    type: String,
    enum: ['online', 'cash', 'cheque'],
    default: 'online'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  fundedAt: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('Loan', LoanSchema);