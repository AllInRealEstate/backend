// backend/utils/regexUtils.js
/**
 * Escapes special characters for use in a Regular Expression
 */
exports.escapeRegExp = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};