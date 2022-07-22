// Determine whether it is a two-color icon
module.exports.isDuotone = function isDuotone(name) {
    return /[Dd]{1}uotone$/.test(name);
};

// Determine whether it is a brand trademark
module.exports.isBrands = function isBrands(name) {
    return ['figma', 'youtube'].includes(name.toLowerCase());
};
