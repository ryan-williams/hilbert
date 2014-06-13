
var argv = require('minimist')(process.argv.slice(2));

var HilbertImageMap = require('./hilbert-image-map').HilbertImageMap;

new HilbertImageMap(argv).createImage();
