function verifyStyles(template, tests) {
  var div = document.createElement('div');
  Blaze.render(template, div);
  div.style.display = 'block';
  document.body.appendChild(div);
  var p = div.querySelector('p');
  tests(p);
  document.body.removeChild(div);
}

Tinytest.add("stylus - presence", function(test) {
  verifyStyles(
    Template.stylus_test_presence,
    function (p) {
      test.equal(getStyleProperty(p, 'border-left-style'), "dashed");
    }
  );
});

Tinytest.add("stylus - @import", function(test) {
  verifyStyles(
    Template.stylus_test_import,
    function (p) {
      test.equal(getStyleProperty(p, 'font-size'), "20px");
      test.equal(getStyleProperty(p, 'border-left-style'), "dashed");
    }
  );
});

Tinytest.add('stylus - direct @import globbing', function (test) {
  verifyStyles(
    Template.stylus_test_direct_import_globbing,
    function (p) {
      test.equal(getStyleProperty(p, 'border-top-style'), 'dotted');
    }
  );
});

Tinytest.add('stylus - indirect @import globbing', function (test) {
  verifyStyles(
    Template.stylus_test_indirect_import_globbing,
    function (p) {
      test.equal(getStyleProperty(p, 'border-right-style'), 'groove');
    }
  );
});

Tinytest.add('stylus - multiple @import globbing', function (test) {
  verifyStyles(
    Template.stylus_test_multiple_import_globbing,
    function (p) {
      test.equal(getStyleProperty(p, 'border-left-style'), 'ridge');
      test.equal(getStyleProperty(p, 'border-bottom-style'), 'inset');
    }
  );
});

// Tinytest.add("stylus - import-var-from-json", function(test) {
//   var div = document.createElement('div');
//   Blaze.render(Template.stylus_test_import_var_from_json, div);
//   div.style.display = 'block';
//   document.body.appendChild(div);

//   var p = div.querySelector('p');
//   test.equal(getStyleProperty(p, 'border-left-style'), "dashed");

//   document.body.removeChild(div);
// });
