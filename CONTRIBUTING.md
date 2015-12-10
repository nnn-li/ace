deuce CONTRIBUTING
==================

Browser Code Editor targeting ES6 written in TypeScript

# SetUp #

git clone ...

npm install

jspm install

bower install

# Development #

This uses SystemJS to load the unbundled files using ES6 module loader.
It may take a while for the application to initialize.
Suggest Ctrl+Shift+J to monitor progress and execution.

tsc [-w]

http-server -o

# Package #

Grunt is used to create a classic distribution and documentation.

grunt