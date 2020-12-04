const validator = require('validator');

const amountValidator = max => ({
  isValidDecimal(amount) {
    if (validator.isDecimal(amount, { decimal_digits: '0,2' })) {
      return;
    }

    throw new Error('Amount cannot have more than 2 decimal digits');
  },
  max: {
    args: max,
    msg: `Recorded amount cannot be greater ${max}`,
  },
});

module.exports = { amountValidator };
