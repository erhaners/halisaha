const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Render sunucusunda tarayıcının silinmemesi için proje klasörünün içine sabitliyoruz:
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
