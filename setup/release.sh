#!/bin/bash
set +e
npm install
set -e
cd ..
node_modules/bower/bin/bower install
node_modules/gulp/bin/gulp.js fast-build
node_modules/gulp/bin/gulp.js release-build
rm -rf public/css/
rm public/*.js*
rm public/*.map
cd setup
