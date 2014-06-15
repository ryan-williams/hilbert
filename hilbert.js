
var argv = require('minimist')(process.argv.slice(2));

var HilbertImageMaps = require('./hilbert-image-map').HilbertImageMaps;

new HilbertImageMaps(argv).createImages();
