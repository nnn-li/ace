// The "wrapper" function.
module.exports = function(grunt) {

  // Do grunt-related things in here.

  var path = require('path');
  var Builder = require('systemjs-builder');
  var cp = require('child_process');
  var Q = require('q');

  // Project configuration.
  grunt.initConfig({

    // Access the package file contents for later use.
    pkg: grunt.file.readJSON('package.json'),

    // Task configuration.
    clean: {
      // Don't clean 'lib' yet until we figure out what to do with the worker-system.js file.
      src: ['amd', 'dist', 'es6', 'system', 'lib', 'documentation']
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
        src: 'dist/ace.js',
        dest: 'dist/ace.min.js'
      }
    },
    copy: {
      typings: {
        expand: true,
        cwd: 'src/modules/',
        src: ['ace.d.ts'],
        dest: 'dist/typings'
      },
      themes: {
        expand: true,
        cwd: 'src/theme/',
        src: ['**/*.css'],
        dest: 'dist/themes/'
      },
      workers: {
        expand: true,
        cwd: 'amd/worker/',
        src: ['**/worker-systemjs.js'],
        dest: 'dist/workers/'
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
            logo: '../assets/logo_half.png',
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

  /**
   * tsc(tsgile: string, options): Promise
   */
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
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-requirejs');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-contrib-jasmine');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-yuidoc');
  grunt.loadNpmTasks('grunt-complexity');
  grunt.loadNpmTasks('grunt-exec');

  var compilerSources = [
      "src/ace.ts",
      "src/main.ts",
      "src/lib/dom.ts",
      "src/mode/HtmlMode.ts",
      "src/mode/JavaScriptMode.ts",
      "src/mode/TypeScriptMode.ts",
      "./node_modules/typescript/lib/lib.es6.d.ts",
      "./typings/systemjs.d.ts"
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

  function TARGET(xs, target) {
      return ['--target ' + target].concat(xs);
  }

  function MODULE(xs, module) {
      return ['--module ' + module].concat(xs);
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

  grunt.registerTask('buildAMD', "Build", function() {
    var args = compilerSources;
    args = TARGET(args, 'ES5');
    args = MODULE(args, 'amd');
    args = removeComments(args);
    var done = this.async();
    tsc(outDir('amd', args).join(" "))
    .then(function(){
      done(true);
    })
    .catch(function(){
      done(false);
    });
  });

  grunt.registerTask('buildES6', "Build", function() {
    var args = compilerSources;
    args = TARGET(args, 'ES6');
    args = MODULE(args, 'es6');
    args = removeComments(args);
    var done = this.async();
    tsc(outDir('es6', args).join(" "))
    .then(function(){
      done(true);
    })
    .catch(function(){
      done(false);
    });
  });

  function bundle() {
    var builder = new Builder('es6', './config.js');
    return builder.bundle('ace.js', 'lib/ace.js');
  }

  grunt.registerTask('bundle', "Bundle", function() {
    var done = this.async();
    bundle()
    .then(function(){
      done(true);
    })
    .catch(function(err){
      console.log(err);
      done(false);
    });
  });

  grunt.registerTask('test', ['connect:test', 'jasmine']);

  // Register 'docs' so that we can do `grunt docs` from the command line. 
  grunt.registerTask('docs', ['yuidoc']);

  grunt.registerTask('testAll', ['exec:test', 'test']);

  // This creates a bundle in amd format and targeting ES5.
  grunt.registerTask('default', ['clean', 'buildAMD', 'docs', 'copy', 'requirejs', 'uglify']);

  // grunt.registerTask('default', ['clean', 'buildES6', 'copy', 'bundle']);
};
