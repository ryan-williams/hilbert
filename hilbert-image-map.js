
var fs = require('fs');
var Png = require('../node-png/build/Release/png').Png;
var FixedPngStack = require('../node-png/build/Release/png').FixedPngStack;
var Buffer = require('buffer').Buffer;
var moment = require('moment');

var Hilbert2d = require('hilbert').Hilbert2d;
var Hilbert3d = require('hilbert').Hilbert3d;

var HilbertImageMaps = exports.HilbertImageMaps = function(argv) {
  function checkWhitelist(arr, whitelist) {
    if (whitelist) {
      return arr.map(function (i) {
        if (!(i in whitelist)) {
          throw new Error("Invalid " + key + ": " + i);
        }
        if (whitelist[i] == 1) return i;
        return whitelist[i];
      });
    }
    return arr;
  }

  function parseInts(key, def, whitelist) {
    return checkWhitelist((argv[key] || def).toString().split(',').map(function(i) { return parseInt(i); }), whitelist);
  }

  function parseStrings(key, def, whitelist) {
    return checkWhitelist((argv[key] || def).split(','), whitelist);
  }

  var canvasSizes = parseInts('size', 512);
  var dryRun = !!argv['dry-run'];
  var pngConstructionMethods = parseStrings("method", "pixels", { "blocks": 1, "pixels": 1 });
  var blocksNums = parseInts('blocks', 8, { 1: 1, 8: 1, 64: 1, 512: 1, 4096: 1 });

  var order2s = parseStrings('order2', 'xy');
  var order3s = parseStrings('order3', 'xyz');

  var projectionTypes = parseStrings('projection', 'scaleXYZ', {
    xyz: 'scaleXYZ',
    scaleXYZ: 'scaleXYZ',
    d: 'scaleD',
    scaleD: 'scaleD'
  });

  var maps = [];
  canvasSizes.forEach(function (canvasSize) {
    pngConstructionMethods.forEach(function (pngConstructionMethod) {
      blocksNums.forEach(function (blocks) {
        projectionTypes.forEach(function(projectionType) {
          order2s.forEach(function (order2) {
            order3s.forEach(function (order3) {
              maps.push(
                    new HilbertImageMap({
                      canvasSize: canvasSize,
                      pngConstructionMethod: pngConstructionMethod,
                      blocks: blocks,
                      projectionType: projectionType,
                      dryRun: dryRun,
                      order2: order2,
                      order3: order3,
                      outbase: argv.outbase,
                      outdir: argv.outdir,
                      printEvery: argv.printEvery
                    })
              );
            });
          });
        });
      });
    });
  });

  this.createImages = function() {
    maps.forEach(function(map, idx) {
      map.createImage(idx, maps.length);
    });
  };
};

var HilbertImageMap = exports.HilbertImageMap = function(opts) {

  var canvasSize = opts.canvasSize;
  var blocks = opts.blocks;
  var projectionType = opts.projectionType;

  var printProgressIncrement = opts.printEvery || 10000;

  var h2 = new Hilbert2d(opts.order2);
  var h3 = new Hilbert3d(opts.order3);

  var outfileRoot = opts.outbase || "hilbert";
  var outfileDir = opts.outdir || "./img";
  if (outfileDir[outfileDir.length - 1] != '/') {
    outfileDir += '/';
  }

  var filename = [
    outfileDir + outfileRoot,
    blocks,
    canvasSize + 'x' + canvasSize,
    projectionType,
    opts.order2,
    opts.order3
  ].join('-') + '.png';

  var blockSize = canvasSize / blocks;

  var scalingFactor = 256*256*256/blocks/blocks;
  var scalingFactor3d = 255 / (Math.round(Math.pow(blocks, 2/3)) - 1);

  var memoizePositions = /*('memoize' in argv) ? !!argv.memoize : */(canvasSize > blocks);

  function computeColorForBlock(x, y) {
    var d = h2.xy2d(x, y);

    var color = null;
    if (projectionType == 'scaleD') {
      var scaleD = d * scalingFactor;
      color = h3.d2xyz(scaleD);
    } else if (projectionType == 'scaleXYZ') {
      var xyz = h3.d2xyz(d);
      color = xyz.mult(scalingFactor3d);
    } else {
      throw new Error('Unrecognized projection type: ' + projectionType);
    }

    return color.arr;
  }

  var blockColorCache = [];
  this.getColorForBlock = function(x, y) {
    if (memoizePositions) {
      if (!(x in blockColorCache)) {
        blockColorCache[x] = [];
      }
      if (!(y in blockColorCache[x])) {
        blockColorCache[x][y] = computeColorForBlock(x, y);
      }

      return blockColorCache[x][y];
    }
    return computeColorForBlock(x, y);
  };

  var previousNum = 0;
  var previousTime = moment();
  function printStatus(num, total) {
    if (num % printProgressIncrement == 0) {
      var now = moment();
      console.log(
            "%s:\t%d/%d (%d). rate: %dk/s",
            now.format('HH:mm:ss'),
            num, total,
            (100*(num/total)).toFixed(2),
            Math.round((num - previousNum) / (now - previousTime))
      );
      previousNum = num;
      previousTime = now;
    }
  }

  this.getPngByBlocks = function() {
    var png = new FixedPngStack(canvasSize, canvasSize, 'rgb');
    var num = 0;
    var totalBlocks = blocks*blocks;
    for (var blockX = 0; blockX < blocks; blockX++) {
      for (var blockY = 0; blockY < blocks; blockY++) {
        printStatus(num, totalBlocks);

        var color = this.getColorForBlock(blockX, blockY);

        var data = '';
        for (var i = 0; i < blockSize * blockSize; i++) {
          data += String.fromCharCode.apply(String, color);
        }
        if (!opts.dryRun) {
          var buffer = new Buffer(blockSize * blockSize * 3);
          buffer.write(data, 'binary');
          png.push(buffer, blockX * blockSize, blockY * blockSize, blockSize, blockSize);
        }
        num++;
      }
    }
    return png.encodeSync();
  };

  this.getPngByPixels = function() {
    var buffer = new Buffer(canvasSize*canvasSize*3);
    var num = 0;
    var totalPixels = canvasSize*canvasSize;
    for (var y = 0; y < canvasSize; ++y) {
      for (var x = 0; x < canvasSize; ++x) {
        printStatus(num, totalPixels);

        var blockX = Math.floor(x / blockSize);
        var blockY = Math.floor(y / blockSize);

        var color = this.getColorForBlock(blockX, blockY);

        if (!opts.dryRun) {
          buffer.write(String.fromCharCode.apply(String, color), 3 * (y * canvasSize + x), 3, 'binary');
        }
        num++;
      }
    }

    var png = new Png(buffer, canvasSize, canvasSize, 'rgb');
    return png.encodeSync();
  };

  this.createImage = function(idx, total) {
    if (total) {
      console.log("Generating %d/%d: %s", idx, total, filename);
    } else {
      console.log("Generating %s", filename);
    }
    if (fs.existsSync(filename)) {
      console.log("\tAlready exists!");
      return;
    }
    var png = null;
    if (opts.pngConstructionMethod == "blocks") {
      png = this.getPngByBlocks();
    } else if (opts.pngConstructionMethod == "pixels") {
      png = this.getPngByPixels();
    } else {
      throw new Error("Invalid construction method: " + opts.pngConstructionMethod);
    }

    if (!opts.dryRun) {
      console.log("\tWriting to: %s", filename);
      fs.writeFileSync(filename, png.toString('binary'), 'binary');
    } else {
      console.log("\tdry run, not writing");
    }
  };
};