const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const { checkRole } = require('../middleware/role');
const Loan = require('../models/Loan');
const User = require('../models/User');

/**
 * Middleware: Check if user can access a specific loan
 */

async function canAccessLoan(req, res, next) {
  try {
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ msg: 'Loan not found' });
    }

    // Check borrower or lender permissions
    if (
      (req.user.role === 'borrower' && loan.borrower.toString() !== req.user.id) &&
      (req.user.role === 'lender' &&
        (loan.status !== 'pending' &&
          (!loan.lender || loan.lender.toString() !== req.user.id)))
    ) {
      return res.status(401).json({ msg: 'Not authorized to access this loan' });
    }

    req.loan = loan; // Attach loan to request
    next();
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Loan not found' });
    }
    res.status(500).send('Server error');
  }
}

/**
 * @route   POST api/loans
 * @desc    Create a loan request
 * @access  Private (Borrowers only)
 */
router.post('/', [auth, checkRole('borrower')], async (req, res) => {
  const { amount, purpose, interestRate, term } = req.body;

  try {
    const newLoan = new Loan({
      borrower: req.user.id,
      amount,
      purpose,
      interestRate,
      term
    });

    const loan = await newLoan.save();
    res.json(loan);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET api/loans
 * @desc    Get all loan requests
 * @access  Private (Lenders only)
 */
router.get('/', [auth, checkRole('lender')], async (req, res) => {
  try {
    const loans = await Loan.find({ status: 'pending' })
      .populate('borrower', ['name', 'email'])
      .sort({ createdAt: -1 });
    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET api/loans/borrower
 * @desc    Get all loans for current borrower
 * @access  Private (Borrowers only)
 */
router.get('/borrower', [auth, checkRole('borrower')], async (req, res) => {
  try {
    const loans = await Loan.find({ borrower: req.user.id })
      .populate('lender', ['name', 'email'])
      .sort({ createdAt: -1 });
    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET api/loans/lender
 * @desc    Get all loans funded by current lender
 * @access  Private (Lenders only)
 */
router.get('/lender', [auth, checkRole('lender')], async (req, res) => {
  try {
    const loans = await Loan.find({ lender: req.user.id })
      .populate('borrower', ['name', 'email'])
      .sort({ createdAt: -1 });
    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

/**
 * @route   GET api/loans/:id
 * @desc    Get loan by ID
 * @access  Private
 */
router.get('/:id', [auth, canAccessLoan], async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id)
      .populate('borrower', ['name', 'email'])
      .populate('lender', ['name', 'email']);
    res.json(loan);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Loan not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   PUT api/loans/:id/fund
 * @desc    Fund a loan
 * @access  Private (Lenders only)
 */
router.put('/:id/fund', [auth, checkRole('lender')], async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ msg: 'Loan not found' });
    if (loan.status !== 'pending') {
      return res.status(400).json({ msg: 'Loan is not available for funding' });
    }

    const lender = await User.findById(req.user.id);
    if (lender.balance < loan.amount) {
      return res.status(400).json({ msg: 'Insufficient balance to fund this loan' });
    }

    const borrower = await User.findById(loan.borrower);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      lender.balance -= loan.amount;
      await lender.save({ session });

      borrower.balance += loan.amount;
      await borrower.save({ session });

      loan.lender = req.user.id;
      loan.status = 'funded';
      loan.fundedAt = Date.now();
      await loan.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json(loan);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Loan not found' });
    }
    res.status(500).send('Server error');
  }
});

/**
 * @route   PUT api/loans/:id/repay
 * @desc    Repay a loan
 * @access  Private (Borrowers only)
 */
router.put('/:id/repay', [auth, checkRole('borrower'), canAccessLoan], async (req, res) => {
  try {
    const loan = req.loan;
    if (loan.status !== 'funded') {
      return res.status(400).json({ msg: 'Only funded loans can be repaid' });
    }

    const monthlyInterestRate = loan.interestRate / 100 / 12;
    const totalRepayment = loan.amount * (1 + (monthlyInterestRate * loan.term));

    const borrower = await User.findById(req.user.id);
    if (borrower.balance < totalRepayment) {
      return res.status(400).json({
        msg: 'Insufficient balance to repay this loan',
        required: totalRepayment,
        available: borrower.balance
      });
    }

    const lender = await User.findById(loan.lender);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      borrower.balance -= totalRepayment;
      await borrower.save({ session });

      lender.balance += totalRepayment;
      await lender.save({ session });

      loan.status = 'completed';
      await loan.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({
        loan,
        repaymentAmount: totalRepayment,
        message: 'Loan repaid successfully'
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
