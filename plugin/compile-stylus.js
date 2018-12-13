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
      }

      const [ignored, packageName, pathInPackage] = match;
      return { packageName, pathInPackage };
    }
    function absoluteImportPath(parsed) {
      return '{' + parsed.packageName + '}/' + parsed.pathInPackage;
    }

    const importer = {
      find(importPath, paths, filename) {
        const parsed = parseImportPath(importPath, paths[paths.length - 1]);
        if (!parsed) {
          return null;
        }

        if (importPath[0] !== '{') {
          console.log('trying to find path for', importPath, 'in:', filename, 'with:', paths)
          // bail out early for absolute paths, plugins or BIFs
          if (shouldUseDefaultImplementation(importPath) && statOrNull(importPath)) {
            // TODO: Check for a folder + index.styl, this sems to be where this fails?
            return [importPath];
          }
          // if it is not a custom syntax path, it could be a lookup in a folder
          for (let i = paths.length - 1; i >= 0; i--) {
            if (shouldUseDefaultImplementation(paths[i])) continue;
            let joined = path.join(paths[i], importPath);
            // if we ended up with a custom syntax path, let's try without
            if (joined.startsWith('{}/')) {
              joined = joined.substr(3);
            }
            console.log('about to call resolvePath with:', joined, 'meta:', filename)
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
        if (shouldUseDefaultImplementation(filePath)) {
          // absolute path? let the default implementation handle this
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
      .use(axis())
      .use(nib())
      .use(rupture())
      .use(jeet())
      .use(typographic());

    if (fileOptions.autoprefixer) {
      style = style.use(autoprefixer(fileOptions.autoprefixer));
    } else {
      style = style.use(autoprefixer({ hideWarnings: true }));
    }

    /**
     * Add custom function in stylus that allows loading variables from JSON
     * This was primarily added to support sharing vars in settings.json between
     * Meteor.settings and stylus files like so:
     * ```stylus
     * $cdnroot = load-var-from-json('{}/settings.json', 'public.cdnroot')
     * ```
     * Stylus casts JavaScript values to their Stylus equivalents when possible
     *
     * NOTE: Package imports are not yet supported
     */
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
      console.error(e);
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

function resolvePath(path) {
  let paths = glob.sync(path);
  if (paths.length === 0) {
    console.log('test glob searching:', path);
    paths = glob.sync(`**/${path}`);
    console.log('test glob found:', paths);
    console.log((new Error).stack)
  }
  return paths;
}

function statOrNull(path) {
  try {
    return fs.statSync(path);
  } catch (e) {
    return null;
  }
}

function shouldUseDefaultImplementation(path = '') {
  // Because the default file loader is overwritten, we need to check for
  // absolute paths or built in plugins and allow the
  // default implementation to handle this
  return (
    // isAbsolute
    path[0] === '/' ||
    // isStylusBuiltIn
    path.includes('/node_modules/stylus/lib/') ||
    // isNib
    path.includes('/node_modules/nib/lib/nib/') ||
    // isAxis
    path.includes('/node_modules/axis/axis/') ||
    // isJeet
    path.includes('/node_modules/jeet/styl/') ||
    // isRupture
    path.includes('/node_modules/rupture/rupture/') ||
    // istypographic
    path.includes('/node_modules/typographic/stylus/')
  );
}
