# coagmano:stylus

A fork of `meteor:stylus` including the stylus plugins from `mquandalle:stylus`

`mquandalle:stylus` was failing when using the `import` syntax as part of
`ecmascript` modules, so I forked the excellent `meteor:stylus` package which
supports ecmascript and caching and added the same stylus plugins that
`mquandalle:stylus` used so it is backwards compatible with `mquandalle:stylus`.

### 1.1.0 Update

This project now supports Meteor 1.8's lazy compilation via the
`compileOneFileLater` method ([Meteor PR#9983](https://github.com/meteor/meteor/pull/9983))

## Included packages

### [Stylus](http://stylus-lang.com/) 0.54.5 (Meteor's fork)

Expressive, dynamic, robust CSS. Curly braces and semicolons: optional.

### [Nib](http://tj.github.io/nib/) 1.1.2

Nib is a popular Stylus package that adds many helpful, basic, utility mixins.

It's important to remember to include it in your styles, like so:

```
@import 'nib'
```

### [Jeet](http://jeet.gs/) 7.2.0

An advanced -- yet intuitive -- grid system. Very capable, and useful for laying
out a page without cluttering up HTML with grid classes. Must be imported before use.

### [Rupture](http://jenius.github.io/rupture/) 0.7.1

Simple media queries for Stylus. Must be imported before use.

### [Typographic](https://github.com/corysimmons/typographic) 3.0.0

Quick and dirty responsive typography for the rest of us. Offers great selection
of common font stacks, and several ways to apply them to your document. Must be
imported before use.

### [Axis](http://axis.netlify.com/) 1.0.0

A higher-level Stylus mixin library with lots of extra functionality. Be sure
not to miss the normalize() mixin. Axis uses and imports Nib, so Nib has been
removed from this package. Must be imported before use.

### [Autoprefixer](https://github.com/jenius/autoprefixer-stylus) 0.14.0

An autoprefixer plugin for Stylus. Will also remove unnecessary prefixes if
there is widespread browser support. It is automatic and does not need to be
imported.

------

[Stylus](http://learnboost.github.com/stylus/) is a CSS pre-processor with a
simple syntax and expressive dynamic behavior. It allows for more compact
stylesheets and helps reduce code duplication in CSS files.

With the `stylus` package installed, files with the `.styl` extension are sent
through the `stylus` CSS pre-processor and the results are included in the
client CSS bundle.

The `stylus` package also includes `nib` support. Add `@import 'nib'` to any
`*.styl` file to enable cross-browser mixins such as `linear-gradient` and
`border-radius`.

If you want to `@import` a file, give it the extension `.import.styl`
to prevent Meteor from processing it independently.

See <http://tj.github.io/nib/> for documentation of the nib extensions of Stylus.


## Usage

The package processes all `.styl` files, treating `.styl` as entry points
and all files with extension `.import.styl` or a file in under an `imports`
folder as an import.

Also, if a file is added in a package, a special `isImport: true` option can be
passed to mark it as an import: `api.add('styles.styl', 'client', {isImport: true})`.

Example:

A component stylus file, importable, but not an entry-point:

```stylus
// app/components/my-component/styles.import.styl
$primary-color = #A7A7A7
.my-component
  input
    border 1px solid
  textarea
    color $primary-color
```

The main app entry point for the styles, `app.styl`:

```stylus
// app/app.styl
@import './components/my-component/styles.import'

// ... rest of app styles
```


## Cross-packages imports

This package allows apps to import Stylus styles from packages and vice-versa.
The import syntax from importing files from other packages is curly braces:

```javasciprt
// in procoder:fancy-buttons package's package.js file
...
api.addFiles('styles/buttons.styl', 'client', {isImport: true});
...
```

```stylus
// app.styl
// import styles from a package
@import '{procoder:fancy-buttons}/styles/buttons.styl'

// use imported styles in our code
.my-buttons
  @extend .fancy-buttons
  color: white
```

To import a file from the app, leave the content of curly braces empty:

```stylus
// packages/my-package/generic-buttons.styl
// import the base styles from app
@import '{}/client/imports/colors.styl'

// use the colors from app in this component
.generic-buttons
  background-color: $app-base-color
```

You can also import from an NPM package:

```stylus
@import '{}/node_modules/vuetify/src/stylus/main'
```

## Limitations

Since this package uses custom code for `@import`s, some of the import syntax is
not supported at the moment:

- importing `index.styl`: `@import ./folder/` - should automatically load
  `./folder/index.styl`

## Tests

To test this package, check out the repo and run:

```bash
meteor test-packages ./
```
