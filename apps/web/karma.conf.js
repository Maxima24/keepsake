// Karma config: run headless against Edge (the only Chromium browser installed).
// karma-chrome-launcher's ChromeHeadless base uses process.env.CHROME_BIN.
process.env.CHROME_BIN =
  process.env.CHROME_BIN ||
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: { jasmine: {}, clearContext: false },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadlessNoSandbox'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu'],
      },
    },
    restartOnFileChange: false,
  });
};
