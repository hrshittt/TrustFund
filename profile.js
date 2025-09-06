const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Loan = require('../models/Loan');

// @route   GET api/profile
// @desc    Get current user's profile
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/profile/balance
// @desc    Add funds to user's balance
// @access  Private
router.put('/balance', auth, async (req, res) => {
  const { amount } = req.body;
  
  // Validate amount
  if (!amount || amount <= 0) {
    return res.status(400).json({ msg: 'Please provide a valid amount' });
  }
  
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Add funds to user's balance
    user.balance += Number(amount);
    
    await user.save();
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   PUT api/profile/location
// @desc    Update user's location
// @access  Private
router.put('/location', auth, async (req, res) => {
  const { city, country } = req.body;
  
  // Validate location data
  if (!city || !country) {
    return res.status(400).json({ msg: 'Please provide both city and country' });
  }
  
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Update location
    user.location.city = city;
    user.location.country = country;
    
    await user.save();
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   GET api/profile/filter-loans
// @desc    Get filtered loans
// @access  Private
router.get('/filter-loans', auth, async (req, res) => {
  const { interestRate, hasCollateral, paymentMode, location } = req.query;
  
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    // Build filter query
    const filterQuery = {};
    
    // Filter by role
    if (user.role === 'lender') {
      filterQuery.status = 'pending';
    } else {
      filterQuery.borrower = user.id;
    }
    
    // Filter by interest rate (less than or equal to)
    if (interestRate) {
      filterQuery.interestRate = { $lte: Number(interestRate) };
    }
    
    // Filter by collateral
    if (hasCollateral) {
      filterQuery.hasCollateral = hasCollateral === 'true';
    }
    
    // Filter by payment mode
    if (paymentMode) {
      filterQuery.paymentMode = paymentMode;
    }
    
    // Find loans based on filters
    let loans = await Loan.find(filterQuery).populate('borrower', 'name location');
    
    // Filter by location if specified
    if (location) {
      loans = loans.filter(loan => {
        return loan.borrower.location.city.toLowerCase().includes(location.toLowerCase()) || 
               loan.borrower.location.country.toLowerCase().includes(location.toLowerCase());
      });
    }
    
    res.json(loans);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;