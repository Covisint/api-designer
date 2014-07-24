(function () {
  'use strict';

  angular.module('codeMirror')
    .directive('ramlEditorIncludeLink', function($compile, $rootScope, ramlRepository){
      function relativeToAbsolutePath (path, parent) {
        return parent.path === '/' ?
          parent.path + path :
          parent.path + '/' + path;
      }

      return {
        restrict: 'A',
        link: function(scope, elm) {
          var path = elm[0].innerText;

          // convert to absolute pathnames
          if (path.charAt(0) !== '/') {
            path = relativeToAbsolutePath(path, ramlRepository.getParent($rootScope.fileBrowser.selectedFile));
          }

          var action = 'fileBrowser.selectWithPath("' + path + '")';
          elm.attr('ng-click', action);
          elm.removeAttr('raml-editor-include-link');
          $compile(elm)(scope);
        }
      };
    })
    .factory('codeMirrorHighLight', function (indentUnit) {
      var mode = {};

      mode.highlight = function highlight(config) {
        mode.indentationOverlay = {
          token: function token(stream, state) {
            if (state.cutoff === undefined || stream.column() <= state.cutoff) {
              if (stream.match('  ')) {
                return 'indent indent-col-' + stream.column();
              } else if (stream.match(' ')) {
                return 'indent-incomplete';
              }
            }
            stream.skipToEnd();
          },
          startState: function startState() {
            return {};
          }
        };

        mode.includeHighlightOverlay = {
          token: function(stream, state) {
            if (state.foundInclude) {
              stream.skipToEnd();
              // reset the state
              state.foundInclude = false;
              return 'include-path';
            }

            if (stream.match('!include')) {
              // skip all the white spaces
              while(stream.eatSpace()) {}
              state.foundInclude = true;
              return null;
            }

            // search forward for the '!include token'
            while (stream.next() && !stream.match('!include', false)) {}
            return null;
          },
          startState: function startState() {
            return { foundInclude: false };
          }
        };

        mode.yaml     = CodeMirror.overlayMode(CodeMirror.getMode(config, 'yaml'), mode.indentationOverlay);
        mode.yaml     = CodeMirror.overlayMode(mode.yaml, mode.includeHighlightOverlay);
        mode.xml      = CodeMirror.overlayMode(CodeMirror.getMode(config, 'xml'), mode.indentationOverlay);
        mode.json     = CodeMirror.overlayMode(CodeMirror.getMode(config, { name: 'javascript', json: true }), mode.indentationOverlay);
        mode.markdown = CodeMirror.overlayMode(CodeMirror.getMode(config, 'gfm'), mode.indentationOverlay);

        return {
          startState: function startState() {
            return {
              token: mode._yaml,
              localMode: null,
              localState: null,
              yamlState: mode.yaml.startState()
            };
          },
          copyState: function copyState(state) {
            var local;
            if (state.localState) {
              local = CodeMirror.copyState(state.localMode, state.localState);

              if (!local.parentIndentation) {
                local.parentIndentation = state.localState.parentIndentation;
              }
            }

            return {
              token: state.token,
              localMode: state.localMode,
              localState: local,
              yamlState: CodeMirror.copyState(mode.yaml, state.yamlState)
            };
          },
          innerMode: function innerMode(state) {
            return {
              state: state.localState || state.yamlState,
              mode: state.localMode || mode.yaml
            };
          },
          token: function token(stream, state) {
            return state.token(stream, state);
          }
        };
      };

      mode._yaml = function(stream, state) {
        if (/(content|description):(\s?)\|/.test(stream.string)) {
          mode._setMode('markdown', stream, state);
        }

        if (/application\/json:/.test(stream.string)) {
          mode._setMode('json', stream, state, 2);
        }

        if (/text\/xml:/.test(stream.string)) {
          mode._setMode('xml', stream, state, 2);
        }

        return mode.yaml.token(stream, state.yamlState);
      };

      mode._xml = function (stream, state) {
        return mode._applyMode('xml', stream, state);
      };

      mode._json = function (stream, state) {
        return mode._applyMode('json', stream, state);
      };

      mode._markdown = function (stream, state) {
        return mode._applyMode('markdown', stream, state);
      };

      mode._setMode = function(modeName, stream, state, indent) {
        state.token = mode['_' + modeName];
        state.localMode = mode[modeName];
        state.localState = mode[modeName].startState();
        state.localState.parentIndentation = stream.indentation() + (indent || 0);

        if (stream.string.match(/^\s*\- /i)) {
          state.localState.parentIndentation += indentUnit;
        }

        if (modeName === 'markdown') {
          state.localState.base.parentIndentation = state.localState.parentIndentation;
        }
      };

      mode._applyMode = function (modeName, stream, state) {
        if (/(schema|example):(\s?)\|/.test(stream.string)) {
          return mode._yaml(stream, state);
        }

        if (stream.string.trim().length > 0 &&
           stream.indentation() <= state.localState.parentIndentation) {

          state.token = mode._yaml;
          state.localState = state.localMode = null;
          return mode._yaml(stream, state);
        }

        state.localState.overlay.cutoff = state.localState.parentIndentation;
        return mode[modeName].token(stream, state.localState);
      };

      return mode;
    })
  ;
})();
