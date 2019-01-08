const stylus = Npm.require('stylus');
const Future = Npm.require('fibers/future');
const glob = Npm.require('glob');
const fs = Plugin.fs;
const path = Plugin.path;

const nib = Npm.require('nib');
const jeet = Npm.require('jeet');
const rupture = Npm.require('rupture');
const axis = Npm.require('axis');
const typographic = Npm.require('typographic');
const autoprefixer = Npm.require('autoprefixer-stylus');

// prettier-ignore
Plugin.registerCompiler({
  extensions: ['styl'],
  archMatching: 'web'
}, () => new StylusCompiler());

// CompileResult is {css, sourceMap}.
class StylusCompiler extends MultiFileCachingCompiler {
  constructor() {
    super({
      compilerName: 'stylus',
      defaultCacheSize: 1024 * 1024 * 10,
    });
  }

  getCacheKey(inputFile) {
    // prettier-ignore
    return [
      inputFile.getArch(),
      inputFile.getSourceHash()
    ];
  }

  compileResultSize(compileResult) {
    return (
      compileResult.css.length + this.sourceMapSize(compileResult.sourceMap)
    );
  }

  // The heuristic is that a file is an import (ie, is not itself
  // processed as a root) if it matches *.import.styl.  This can be
  // overridden in either direction via an explicit `isImport` file option
  // in api.addFiles.
  isRoot(inputFile) {
    const fileOptions = inputFile.getFileOptions();
    if (fileOptions.hasOwnProperty('isImport')) {
      return !fileOptions.isImport;
    }

    const pathInPackage = inputFile.getPathInPackage();
    return !/\.import\.styl$/.test(pathInPackage);
  }

  compileOneFileLater(inputFile, getResult) {
    // prettier-ignore
    inputFile.addStylesheet({
        path: inputFile.getPathInPackage(),
      }, async () => {
        const result = await getResult();
        return (
          result && {
            data: result.css,
            sourceMap: result.sourceMap,
          }
        );
      }
    );
  }
  compileOneFile(inputFile, allFiles) {
    const referencedImportPaths = [];

    function parseImportPath(filePath, importerDir) {
      if (!filePath) {
        throw new Error('filePath is undefined');
      }
      if (filePath === inputFile.getPathInPackage()) {
        return {
          packageName: inputFile.getPackageName() || '',
          pathInPackage: inputFile.getPathInPackage(),
        };
      }
      if (!filePath.match(/^\{.*\}\//)) {
        if (!importerDir) {
          return {
            packageName: inputFile.getPackageName() || '',
            pathInPackage: filePath,
          };
        }

        // relative path in the same package
        const parsedImporter = parseImportPath(importerDir, null);

        // resolve path if it is absolute or relative
        const importPath =
          filePath[0] === '/'
            ? filePath
            : path.join(parsedImporter.pathInPackage, filePath);

        return {
          packageName: parsedImporter.packageName,
          pathInPackage: importPath,
        };
      }

      const match = /^\{(.*)\}\/(.*)$/.exec(filePath);
      if (!match) {
        return null;
      } else {
        const [, packageName, pathInPackage] = match;
        return { packageName, pathInPackage };
      }
    }

    function absoluteImportPath(parsed) {
      return '{' + parsed.packageName + '}/' + parsed.pathInPackage;
    }

    function resolvePath(filePath, sourceRoot) {
      let filePaths = glob.sync(filePath);
      if (filePaths.length === 0) {
        // See https://github.com/meteor/meteor/pull/9272#issuecomment-348249629
        filePaths = glob.sync(path.join('**', filePath));
      }
      return filePaths;
    }

    function isPluginPath(filePath) {
      return filePath.includes('compileStylusBatch/node_modules/stylus/lib/') || // Stylus built-in
        filePath.includes('compileStylusBatch/node_modules/nib/') || // Nib
        filePath.includes('compileStylusBatch/node_modules/axis/') || // Axis
        filePath.includes('compileStylusBatch/node_modules/jeet/') || // Jeet
        filePath.includes('compileStylusBatch/node_modules/rupture/') || // Rupture
        filePath.includes('compileStylusBatch/node_modules/typographic/') || // Typographic
        false; // Not a plugin
    }

    const importer = {
      find(importPath, paths, filename) {
        const parsed = parseImportPath(importPath, paths[paths.length - 1]);
        if (!parsed) {
          return null;
        }

        if (importPath[0] !== '{' && !isPluginPath(importPath)) {
          // if it is not a custom syntax path, it could be a lookup in a folder
          for (let i = paths.length - 1; i >= 0; i--) {
            let joined = path.join(paths[i], importPath);
            // if we ended up with a custom syntax path, let's try without
            if (joined.startsWith('{}/')) {
              joined = joined.substr(3);
            }
            if (joined[0] === '{') {
              continue; // We can never resolve paths like '{foo:bar}/styles.styl'
            }
            const resolvedPaths = resolvePath(joined);
            if (resolvedPaths.length) {
              return resolvedPaths;
            }
          }
        }

        const absolutePath = absoluteImportPath(parsed);

        if (!allFiles.has(absolutePath)) {
          return null;
        }

        return [absolutePath];
      },

      readFile(filePath) {
        // Because the default file loader is overwritten, we need to check for
        // absolute paths or built in plugins and allow the
        // default implementation to handle this
        if (filePath[0] === '/' || isPluginPath(filePath)) {
          return Npm.require('fs').readFileSync(filePath, 'utf8');
        }

        // The `allFiles` Map references package files using a key that starts
        // from the root of the package. If `filePath` includes a package
        // path prefix (like "packages/[package name]"), we'll remove it to
        // make sure the `filePath` can be properly matched to a key in the
        // `allFiles` Map.
        let cleanFilePath = filePath;
        let packageName = inputFile.getPackageName();
        if (packageName) {
          packageName = packageName.replace('local-test:', '');
          const packagePathPrefix = `packages/${packageName}/`;
          if (filePath.startsWith(packagePathPrefix)) {
            cleanFilePath = filePath.replace(packagePathPrefix, '');
          }
        }

        const parsed = parseImportPath(cleanFilePath);
        const absolutePath = absoluteImportPath(parsed);

        referencedImportPaths.push(absolutePath);

        if (!allFiles.has(absolutePath)) {
          throw new Error(
            `Cannot read file ${absolutePath} for ${inputFile.getDisplayPath()}`
          );
        }

        return allFiles.get(absolutePath).getContentsAsString();
      },
    };

    function processSourcemap(sourcemap) {
      delete sourcemap.file;
      sourcemap.sourcesContent = sourcemap.sources.map(importer.readFile);
      sourcemap.sources = sourcemap.sources.map(filePath => {
        const parsed = parseImportPath(filePath);
        if (!parsed.packageName) return parsed.pathInPackage;
        return 'packages/' + parsed.packageName + '/' + parsed.pathInPackage;
      });

      return sourcemap;
    }

    const fileOptions = inputFile.getFileOptions();

    const f = new Future();

    // Here is where the stylus module is instantiated and plugins are attached
    let style = stylus(inputFile.getContentsAsString())
      .use(nib())
      .use(jeet())
      .use(rupture({implicit: false})) // https://github.com/jescalan/rupture#usage
      .use(typographic())
      .use(axis({implicit: false})); // https://axis.netlify.com/#usage

    if (fileOptions.autoprefixer) {
      style = style.use(autoprefixer(fileOptions.autoprefixer));
    } else {
      style = style.use(autoprefixer({ hideWarnings: true }));
    }

    // DEBUG: This loads too late to be able to add new vars
    // style = style.define('loadVarsFromJson', function (filePath) {
    //     const rootUrl = path.resolve('.').split('.meteor')[0]
    //     const parsed = parseImportPath(filePath.val, [rootUrl])

    //     if (parsed.packageName != '') { console.warn ('WARN: PACKAGE PATHS NOT IMPLEMENTED\n'); }

    //     const json = fs.readFileSync(rootUrl + path.sep + parsed.pathInPackage, 'utf8');
    //     try {
    //         const vars = JSON.parse(json);

    //         const flattenedVars = Object.assign( {},
    //             //spread the result into our return object
    //             ...function _flatten( objectBit, path = '' ) {
    //                 //concat everything into one level
    //                 return [].concat(
    //                     //iterate over object
    //                     ...Object.keys( objectBit ).map(key => {
    //                         //check if there is a nested object
    //                         let newKey = path === '' ? key : `${ path }-${ key }`
    //                         if (typeof objectBit[ key ] === 'object') {
    //                             //call itself if there is
    //                             return _flatten( objectBit[ key ], newKey )
    //                         } else {
    //                             //append object with it's path as key
    //                             return ( { [ newKey ]: objectBit[ key ] } )
    //                         }
    //                     })
    //                 )
    //             }( vars )
    //         );

    //         Object.keys(flattenedVars).forEach(key => {
    //             style = style.define( '$'+key, flattenedVars[key]);
    //         })

    //         style = style.define('$test-variable', true);
    //         style = style.define('$test-variable2', 'a string');
    //         style = style.define('$test-variable3', 42);

    //     } catch (e) {
    //         console.warn(`coagmano:stylus - loadVarsFromJson: Problem parsing ${parsed.pathInPackage} in ${inputFile.getDisplayPath()} `);
    //         console.error(e)
    //     }
    // })
    //
    style = style.define('load-var-from-json', function(filePath, ref) {
      const rootUrl = path.resolve('.').split('.meteor')[0];
      const parsed = parseImportPath(filePath.val, [rootUrl]);

      if (parsed.packageName != '') {
        console.warn('WARN: PACKAGE PATHS NOT IMPLEMENTED\n');
      }

      const json = fs.readFileSync(
        rootUrl + path.sep + parsed.pathInPackage,
        'utf8'
      );
      try {
        const vars = JSON.parse(json);
        let val = vars;
        ref.val.split('.').forEach(refBit => {
          val = val[refBit];
        });
        return val;
      } catch (e) {
        console.warn(
          `coagmano:stylus - load-var-from-json: Problem parsing ${
            parsed.pathInPackage
          } in ${inputFile.getDisplayPath()} `
        );
        console.error(e);
      }
    });

    style = style
      .set('filename', inputFile.getPathInPackage())
      .set('sourcemap', { inline: false, comment: false })
      .set('cache', false)
      .set('importer', importer);

    style.render(f.resolver());
    let css;
    try {
      css = f.wait();
    } catch (e) {
      inputFile.error({
        message: 'Stylus compiler error: ' + e.message,
        line: e.lineno,
        column: e.column,
      });
      return null;
    }

    // Postcss would go here

    const sourceMap = processSourcemap(style.sourcemap);
    return { referencedImportPaths, compileResult: { css, sourceMap } };
  }

  addCompileResult(inputFile, { css, sourceMap }) {
    inputFile.addStylesheet({
      path: inputFile.getPathInPackage() + '.css',
      data: css,
      sourceMap: sourceMap,
    });
  }

}
