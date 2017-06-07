import { Meteor } from 'meteor/meteor';

const stylus = Npm.require('stylus');
const Future = Npm.require('fibers/future');
const fs = Plugin.fs;
const path = Plugin.path;

const nib = Npm.require('nib');
const jeet = Npm.require('jeet');
const rupture = Npm.require('rupture');
const axis = Npm.require('axis');
const typographic = Npm.require('typographic');
const autoprefixer = Npm.require('autoprefixer-stylus');


Plugin.registerCompiler({
  extensions: ['styl'],
  archMatching: 'web'
}, () => new StylusCompiler());

// CompileResult is {css, sourceMap}.
class StylusCompiler extends MultiFileCachingCompiler {
  constructor() {
    super({
      compilerName: 'stylus',
      defaultCacheSize: 1024*1024*10,
    });
  }

  getCacheKey(inputFile) {
    return [
      inputFile.getSourceHash(),
      inputFile.getFileOptions(),
    ];
  }

  compileResultSize(compileResult) {
    return compileResult.css.length +
      this.sourceMapSize(compileResult.sourceMap);
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
    return ! /\.import\.styl$/.test(pathInPackage);
  }

  compileOneFile(inputFile, allFiles) {
    const referencedImportPaths = [];

    function parseImportPath(filePath, importerDir) {
      if (! filePath) {
        throw new Error('filePath is undefined');
      }
      if (filePath === inputFile.getPathInPackage()) {
        return {
          packageName: inputFile.getPackageName() || '',
          pathInPackage: inputFile.getPathInPackage()
        };
      }
      if (! filePath.match(/^\{.*\}\//)) {
        if (! importerDir) {
          return { packageName: inputFile.getPackageName() || '',
                   pathInPackage: filePath };
        }

        // relative path in the same package
        const parsedImporter = parseImportPath(importerDir, null);

        // resolve path if it is absolute or relative
        const importPath =
          (filePath[0] === '/') ? filePath :
            path.join(parsedImporter.pathInPackage, filePath);

        return {
          packageName: parsedImporter.packageName,
          pathInPackage: importPath
        };
      }

      const match = /^\{(.*)\}\/(.*)$/.exec(filePath);
      if (! match) { return null; }

      const [ignored, packageName, pathInPackage] = match;
      return {packageName, pathInPackage};
    }
    function absoluteImportPath(parsed) {
      return '{' + parsed.packageName + '}/' + parsed.pathInPackage;
    }

    const importer = {
      find(importPath, paths) {
        const parsed = parseImportPath(importPath, paths[paths.length - 1]);
        if (! parsed) { return null; }

        if (importPath[0] !== '{') {
          // if it is not a custom syntax path, it could be a lookup in a folder
          for (let i = paths.length - 1; i >= 0; i--) {
            const joined = path.join(paths[i], importPath);
            if (statOrNull(joined)) {
              return [joined];
            }
          }
        }

        const absolutePath = absoluteImportPath(parsed);

        if (! allFiles.has(absolutePath)) {
          return null;
        }

        return [absolutePath];
      },
      readFile(filePath) {
        // Because the default file loader is overwritten, we need to check for
        // absolute paths or built in plugins and allow the
        // default implementation to hande this
        const isAbsolute = filePath[0] === '/';
        const isStylusBuiltIn =
                filePath.indexOf('/node_modules/stylus/lib/') !== -1;
        const isNib =
                filePath.indexOf('/node_modules/nib/lib/nib/') !== -1;
        const isAxis =
                filePath.indexOf('/node_modules/axis/axis/') !== -1;
        const isJeet =
                filePath.indexOf('/node_modules/jeet/styl/') !== -1;
        const isRupture =
                filePath.indexOf('/node_modules/rupture/rupture/') !== -1;
        const istypographic =
                filePath.indexOf('/node_modules/typographic/stylus/') !== -1;

        if (isAbsolute || isStylusBuiltIn || isNib ||
            isAxis || isJeet || isRupture || istypographic) {
          // absolute path? let the default implementation handle this
          return fs.readFileSync(filePath, 'utf8');
        }

        const parsed = parseImportPath(filePath);
        const absolutePath = absoluteImportPath(parsed);

        referencedImportPaths.push(absolutePath);

        if (! allFiles.has(absolutePath)) {
          throw new Error(
            `Cannot read file ${absolutePath} for ${inputFile.getDisplayPath()}`
          );
        }

        return allFiles.get(absolutePath).getContentsAsString();
      }
    };

    function processSourcemap(sourcemap) {
      delete sourcemap.file;
      sourcemap.sourcesContent = sourcemap.sources.map(importer.readFile);
      sourcemap.sources = sourcemap.sources.map((filePath) => {
        const parsed = parseImportPath(filePath);
        if (!parsed.packageName)
          return parsed.pathInPackage;
        return 'packages/' + parsed.packageName + '/' + parsed.pathInPackage;
      });

      return sourcemap;
    }

    const fileOptions = inputFile.getFileOptions();

    const f = new Future;

    // Here is where the stylus module is instantiated and plugins are attached
    let style = stylus(inputFile.getContentsAsString())
      .use(axis())
      .use(nib())
      .use(rupture())
      .use(jeet())
      .use(typographic());

    if (fileOptions.autoprefixer) {
      style = style.use(autoprefixer(fileOptions.autoprefixer));
    } else {
      style = style.use(autoprefixer({hideWarnings: true}));
    }

    // DEBUG: This loads too late to be able to add new vars
    // style = style.define('loadVarsFromJson', function (filePath) {
    //     const rootUrl = path.resolve('.').split('.meteor')[0]
    //     const parsed = parseImportPath(filePath.val, [rootUrl])

    //     if (parsed.packageName != '') { console.warn ('WARN: PACKAGE PATHS NOT IMPLEMTED\n'); }

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
    style = style.define('load-var-from-json', function (filePath, ref) {
        const rootUrl = path.resolve('.').split('.meteor')[0]
        const parsed = parseImportPath(filePath.val, [rootUrl, ])

        if (parsed.packageName != '') { console.warn ('WARN: PACKAGE PATHS NOT IMPLEMTED\n'); }

        const json = fs.readFileSync(rootUrl + path.sep + parsed.pathInPackage, 'utf8');
        try {
            const vars = JSON.parse(json);
            let val = vars;
            ref.val.split('.').forEach(refBit => {
                val = val[refBit];
            })
            return val;
        } catch (e) {
            console.warn(`coagmano:stylus - load-var-from-json: Problem parsing ${parsed.pathInPackage} in ${inputFile.getDisplayPath()} `);
            console.error(e)
        }
    })

    style = style.set('filename', inputFile.getPathInPackage())
                 .set('sourcemap', { inline: false, comment: false })
                 .set('cache', false)
                 .set('importer', importer);

    style.render(f.resolver());
    let css;
    try {
      css = f.wait();
    } catch (e) {
      inputFile.error({
        message: 'Stylus compiler error: ' + e.message
      });
      return null;
    }

    // Postcss would go here

    const sourceMap = processSourcemap(style.sourcemap);
    return {referencedImportPaths, compileResult: {css, sourceMap}};
  }

  addCompileResult(inputFile, {css, sourceMap}) {
    inputFile.addStylesheet({
      path: inputFile.getPathInPackage() + '.css',
      data: css,
      sourceMap: sourceMap
    });
  }
}

function statOrNull(path) {
  try {
    return fs.statSync(path);
  } catch (e) {
    return null;
  }
}
