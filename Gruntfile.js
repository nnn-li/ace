// The "wrapper" function.
module.exports = function(grunt) {

  // Do grunt-related things in here.

  var path = require('path');
  var cp = require('child_process');
  var Q = require('q');

  // Project configuration.
  grunt.initConfig({

    // Access the package file contents for later use.
    pkg: grunt.file.readJSON('package.json'),

    // Task configuration.
    clean: {
      // Don't clean 'lib' yet until we figure out what to do with the worker-system.js file.
      src: ['dist', 'amd', 'cjs', 'documentation']
    },

    exec: {
      'test': {
        command: 'npm test',
        stdout: true,
        stderr: true
      }
    },

    requirejs: {
      compile: {
        options: {
          mainConfigFile: "build.js",
          paths: {
          }
        }
      }
    },

    uglify: {
      options: {
        banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
      },
      build: {
        src: 'dist/<%= pkg.name %>.js',
        dest: 'dist/<%= pkg.name %>.min.js'
      }
    },

    copy: {
      main: {
        expand: true,
        cwd: 'src/modules/',
        src: ['deuce.d.ts'],
        dest: 'dist/'
      }
    },
    connect: {
        test: {
            options: {
                port: 8080
            }
        }
    },
    jasmine: {
        taskName: {
            src: 'amd/**/*.js',
            options: {
                specs: 'test/amd/*_test.js',
                host: 'http://127.0.0.1:8080/',
                template: require('grunt-template-jasmine-requirejs'),
                templateOptions: {
                    requireConfig: {
                      baseUrl: 'amd/',
                      paths: {
                      }
                    }
                }
            }
        }
    },
    // Check JavaScript files for errors/warnings
    jshint: {
        src: [
            'Gruntfile.js',
            'amd/**/*.js',
            'cjs/**/*.js',
            'spec/**/*.js'
        ],
        options: {
            jshintrc: '.jshintrc'
        }
    },
    // Build TypeScript documentation.
    yuidoc: {
        compile: {
            name: '<%= pkg.name %>',
            description: '<%= pkg.description %>',
            version: '<%= pkg.version %>',
            url: '<%= pkg.homepage %>',
            logo: '../assets/logo.png',
            options: {
                linkNatives: false, // Native types get linked to MDN.
                quiet: true,
                writeJSON: true,
                exclude: 'src/mode/css, src/mode/python',
                extension: '.ts',
                paths: ['src'],
                outdir: 'documentation',
                syntaxtype: 'js'  // YUIDocs doesn't understand TypeScript.
            }
        }
    },
    complexity: {
      generic: {
          src: ['amd/**/*.js'],
          options: {
              jsLintXML: 'report.xml', // create XML JSLint-like report
              checkstyleXML: 'checkstyle.xml', // create checkstyle report
              errorsOnly: false, // show only maintainability errors
              cyclomatic: 3,
              halstead: 8,
              maintainability: 100
          }
      }
    }
  });

  function tsc(tsfile, option) {
    var command = "node " + path.resolve(path.dirname(require.resolve("typescript")), "tsc ");
    var optArray = Object.keys(option || {}).reduce(function(res, key) {
            res.push(key);
            if(option[key]){
                res.push(option[key]);
            }
            return res;
        }, []);

    return Q.Promise(function(resolve, reject) {
      var cmd = command + " " + tsfile + " " + optArray.join(" ");
      var childProcess = cp.exec(cmd, {});
      childProcess.stdout.on('data', function (d) { grunt.log.writeln(d); });
      childProcess.stderr.on('data', function (d) { grunt.log.error(d); });

      childProcess.on('exit', function(code) {
        if (code !== 0) {
          reject();
        }
        resolve();
      });
    });
  }

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-requirejs');
  // Load the plugin that provides the "uglify" task.
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-jasmine');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-yuidoc'); // enable the YUIDocs task.
  grunt.loadNpmTasks('grunt-complexity');
  grunt.loadNpmTasks('grunt-exec');

  var compilerSources = [
      "src/deuce.ts",
      "src/main.ts",
      "src/mode/HtmlMode",
      "src/mode/HtmlWorker",
      "src/mode/JavaScriptMode",
      "src/mode/JavaScriptWorker",
      "src/mode/TypeScriptMode",
      "src/mode/TypeScriptWorker",
      "./node_modules/typescript/lib/lib.es6.d.ts",
      "./node_modules/typescript/lib/typescriptServices.d.ts",
      "./typings/tsd.d.ts"
  ];

  function ES5(xs) {
      return ['--target ES5'].concat(xs);
  }

  function AMD(xs) {
      return ['--module amd'].concat(xs);
  }

  function COMMONJS(xs) {
      return ['--module commonjs'].concat(xs);
  }

  function noImplicitAny(xs) {
      return ['--noImplicitAny'].concat(xs);
  }

  function removeComments(xs) {
      return ['--removeComments'].concat(xs);
  }

  function outDir(where, xs) {
      return ['--outDir', where].concat(xs);
  }

  var argsAMD = AMD(ES5(compilerSources));
  var argsCJS = COMMONJS(ES5(compilerSources));

  grunt.registerTask('buildAMD', "Build", function(){
    var done = this.async();
    tsc(['--declaration'].concat(outDir('amd', argsAMD)).join(" ")).then(function(){
      done(true);
    }).catch(function(){
      done(false);
    });
  });

  grunt.registerTask('buildCJS', "Build", function(){
    var done = this.async();
    tsc(['--declaration'].concat(outDir('cjs', argsCJS)).join(" ")).then(function(){
      done(true);
    }).catch(function(){
      done(false);
    });
  });

  grunt.registerTask('test', ['connect:test', 'jasmine']);

  // Register 'docs' so that we can do `grunt docs` from the command line. 
  grunt.registerTask('docs', ['yuidoc']);

  grunt.registerTask('testAll', ['exec:test', 'test']);

  grunt.registerTask('style', ['clean', 'buildAMD', 'jshint', 'docs', 'copy', 'requirejs', 'uglify']);

  grunt.registerTask('default', ['clean', 'buildAMD', 'docs', 'copy', 'requirejs', 'uglify']);
};
