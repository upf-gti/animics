import { LX } from 'lexgui';

if(!LX) {
    throw("lexgui.js missing!");
}

LX.components.push( 'CodeEditor' );

function flushCss(element) {
    // By reading the offsetHeight property, we are forcing
    // the browser to flush the pending CSS changes (which it
    // does to ensure the value obtained is accurate).
    element.offsetHeight;
}

function swapElements (obj, a, b) {
    [obj[a], obj[b]] = [obj[b], obj[a]];
}

function swapArrayElements (array, id0, id1) {
    [array[id0], array[id1]] = [array[id1], array[id0]];
};

function sliceChar(str, idx) {
    return str.substr(0, idx) + str.substr(idx + 1);
}

function firstNonspaceIndex(str) {
    return str.search(/\S|$/);
}

let ASYNC_ENABLED = true;

function doAsync( fn, ms ) {
    if( ASYNC_ENABLED )
        setTimeout( fn, ms ?? 0 );
    else
        fn();
}

class ISelection {

    constructor(editor, ix, iy) {

        this.editor = editor;
        this.chars  = 0;

        this.fromX  = ix;
        this.toX    = ix;
        this.fromY  = iy;
        this.toY    = iy;
    }

    sameLine() {
        return this.fromY === this.toY;
    }

    invertIfNecessary() {
        if(this.fromX > this.toX)
            swapElements(this, 'fromX', 'toX');
        if(this.fromY > this.toY)
            swapElements(this, 'fromY', 'toY');
    }

    selectInline(x, y, width) {
        
        this.chars = width / this.editor.charWidth;
        this.fromX = x;
        this.toX = x + this.chars;
        this.fromY = this.toY = y;

        var domEl = document.createElement('div');
        domEl.className = "lexcodeselection";
        
        domEl._top = 4 + y * this.editor.lineHeight;
        domEl.style.top = (domEl._top - this.editor.getScrollTop()) + "px";
        domEl._left = x * this.editor.charWidth;
        domEl.style.left = "calc(" + (domEl._left - this.editor.getScrollLeft()) + "px + " + this.editor.xPadding + ")";
        domEl.style.width = width + "px";
        this.editor.selections.appendChild(domEl);
    }
};

/**
 * @class CodeEditor
 */

class CodeEditor {

    static __instances  = [];

    static CURSOR_LEFT  = 1;
    static CURSOR_TOP   = 2;

    static WORD_TYPE_METHOD = 0;
    static WORD_TYPE_CLASS  = 1;

    /**
     * @param {*} options
     * skip_info, allow_add_scripts, name
     */

    constructor( area, options = {} ) {

        window.editor = this;

        CodeEditor.__instances.push( this );

        this.disable_edition = options.disable_edition ?? false;

        this.skip_info = options.skip_info;
        this.base_area = area;
        this.area = new LX.Area( { className: "lexcodeeditor", height: "auto", no_append: true } );

        this.tabs = this.area.addTabs( { onclose: (name) => delete this.openedTabs[name] } );
        this.tabs.root.addEventListener( 'dblclick', (e) => {
            if( options.allow_add_scripts ?? true ) {
                e.preventDefault();
                this.addTab("unnamed.js", true);
            }
        } );

        area.root.classList.add('codebasearea');
        this.gutter = document.createElement('div');
        this.gutter.className = "lexcodegutter";
        area.attach( this.gutter );

        this.root = this.area.root;
        this.root.tabIndex = -1;
        area.attach( this.root );

        this.root.addEventListener( 'keydown', this.processKey.bind(this), true);
        this.root.addEventListener( 'mousedown', this.processMouse.bind(this) );
        this.root.addEventListener( 'mouseup', this.processMouse.bind(this) );
        this.root.addEventListener( 'mousemove', this.processMouse.bind(this) );
        this.root.addEventListener( 'click', this.processMouse.bind(this) );
        this.root.addEventListener( 'contextmenu', this.processMouse.bind(this) );
        this.root.addEventListener( 'focus', this.processFocus.bind(this, true) );
        this.root.addEventListener( 'focusout', this.processFocus.bind(this, false) );

        // Cursors and selection

        this.cursors = document.createElement('div');
        this.cursors.className = 'cursors';
        this.tabs.area.attach(this.cursors);

        this.selections = document.createElement('div');
        this.selections.className = 'selections';
        this.tabs.area.attach(this.selections);

        // Css char synchronization
        this.xPadding = "0.25em";

        // Add main cursor
        {
            var cursor = document.createElement('div');
            cursor.className = "cursor";
            cursor.innerHTML = "&nbsp;";
            cursor._left = 0;
            cursor.style.left = this.xPadding;
            cursor._top = 4;
            cursor.style.top = "4px";
            cursor.position = 0;
            cursor.line = 0;
            cursor.print = (function() { console.log( this.line, this.position ) }).bind(cursor);
            this.cursors.appendChild(cursor);
        }

        // Add autocomplete box
        {
            var box = document.createElement('div');
            box.className = "autocomplete";
            this.autocomplete = box;
            this.tabs.area.attach(box);

            this.isAutoCompleteActive = false;
        }

        // State

        this.state = {
            overwrite: false,
            focused: false,
            selectingText: false
        }

        // Code

        this.useAutoComplete = options.autocomplete ?? true;
        this.highlight = options.highlight ?? 'Plain Text';
        this.onsave = options.onsave ?? ((code) => {  });
        this.onrun = options.onrun ?? ((code) => { this.runScript(code) });
        this.actions = {};
        this.cursorBlinkRate = 550;
        this.tabSpaces = 4;
        this.maxUndoSteps = 16;
        this.lineHeight = 20;
        this.charWidth = 8; //this.measureChar();
        this._lastTime = null;

        this.languages = [
            'Plain Text', 'JavaScript', 'CSS', 'GLSL', 'WGSL', 'JSON', 'XML', 'Python'
        ];
        this.specialKeys = [
            'Backspace', 'Enter', 'ArrowUp', 'ArrowDown', 
            'ArrowRight', 'ArrowLeft', 'Delete', 'Home',
            'End', 'Tab', 'Escape'
        ];
        this.keywords = {
            'JavaScript': ['var', 'let', 'const', 'this', 'in', 'of', 'true', 'false', 'new', 'function', 'NaN', 'static', 'class', 'constructor', 'null', 'typeof', 'debugger', 'abstract',
                          'arguments', 'extends', 'instanceof'],
            'GLSL': ['true', 'false', 'function', 'int', 'float', 'vec2', 'vec3', 'vec4', 'mat2x2', 'mat3x3', 'mat4x4', 'struct'],
            'CSS': ['body', 'html', 'canvas', 'div', 'input', 'span', '.'],
            'WGSL': ['var', 'let', 'true', 'false', 'fn', 'bool', 'u32', 'i32', 'f16', 'f32', 'vec2f', 'vec3f', 'vec4f', 'mat2x2f', 'mat3x3f', 'mat4x4f', 'array', 'atomic', 'struct',
                    'sampler', 'sampler_comparison', 'texture_depth_2d', 'texture_depth_2d_array', 'texture_depth_cube', 'texture_depth_cube_array', 'texture_depth_multisampled_2d',
                    'texture_external', 'texture_1d', 'texture_2d', 'texture_2d_array', 'texture_3d', 'texture_cube', 'texture_cube_array', 'texture_storage_1d', 'texture_storage_2d',
                    'texture_storage_2d_array', 'texture_storage_3d'],
            'Python': ['False', 'def', 'None', 'True', 'in', 'is', 'and', 'lambda', 'nonlocal', 'not', 'or']
        };
        this.utils = { // These ones don't have hightlight, used as suggestions to autocomplete only...
            'JavaScript': ['querySelector', 'body', 'addEventListener', 'removeEventListener', 'remove', 'sort', 'keys', 'filter', 'isNaN', 'parseFloat', 'parseInt', 'EPSILON', 'isFinite',
                          'bind', 'prototype', 'length', 'assign', 'entries', 'values', 'concat', 'substring', 'substr', 'splice', 'slice', 'buffer', 'appendChild', 'createElement', 'prompt',
                          'alert'],
            'WGSL': ['textureSample'],
            'Python': ['abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytearray', 'bytes', 'callable', 'chr', 'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir', 'divmod', 
                      'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance',
                      'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 
                      'reversed', 'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip']
        };
        this.types = {
            'JavaScript': ['Object', 'String', 'Function', 'Boolean', 'Symbol', 'Error', 'Number', 'TextEncoder', 'TextDecoder'],
            'Python': ['int', 'type', 'float', 'map', 'list', 'ArithmeticError', 'AssertionError', 'AttributeError', 'Exception', 'EOFError', 'FloatingPointError', 'GeneratorExit', 
                      'ImportError', 'IndentationError', 'IndexError', 'KeyError', 'KeyboardInterrupt', 'LookupError', 'MemoryError', 'NameError', 'NotImplementedError', 'OSError',
                      'OverflowError', 'ReferenceError', 'RuntimeError', 'StopIteration', 'SyntaxError', 'TabError', 'SystemError', 'SystemExit', 'TypeError', 'UnboundLocalError', 
                      'UnicodeError', 'UnicodeEncodeError', 'UnicodeDecodeError', 'UnicodeTranslateError', 'ValueError', 'ZeroDivisionError' ]
        };
        this.builtin = {
            'JavaScript': ['document', 'console', 'window', 'navigator', 'performance'],
            'CSS': ['*', '!important']
        };
        this.statementsAndDeclarations = {
            'JavaScript': ['for', 'if', 'else', 'case', 'switch', 'return', 'while', 'continue', 'break', 'do', 'import', 'from', 'throw', 'async', 'try', 'catch', 'await'],
            'GLSL': ['for', 'if', 'else', 'return', 'continue', 'break'],
            'WGSL': ['const','for', 'if', 'else', 'return', 'continue', 'break', 'storage', 'read', 'uniform'],
            'Python': ['if', 'raise', 'del', 'import', 'return', 'elif', 'try', 'else', 'while', 'as', 'except', 'with', 'assert', 'finally', 'yield', 'break', 'for', 'class', 'continue', 'global', 'pass']
        };
        this.symbols = {
            'JavaScript': ['<', '>', '[', ']', '{', '}', '(', ')', ';', '=', '|', '||', '&', '&&', '?', '??'],
            'JSON': ['[', ']', '{', '}', '(', ')'],
            'GLSL': ['[', ']', '{', '}', '(', ')'],
            'WGSL': ['[', ']', '{', '}', '(', ')', '->'],
            'CSS': ['{', '}', '(', ')', '*'],
            'Python': ['<', '>', '[', ']', '(', ')', '=']
        };

        // Action keys

        this.action('Escape', false, ( ln, cursor, e ) => {
            this.hideAutoCompleteBox();
        });

        this.action('Backspace', false, ( ln, cursor, e ) => {

            this._addUndoStep(cursor);

            if(this.selection) {
                this.deleteSelection(cursor);
                // Remove entire line when selecting with triple click
                if(this.code.lines[ln] && !this.code.lines[ln].length) 
                    this.actions['Backspace'].callback(ln, cursor, e);
            }
            else {
                var letter = this.getCharAtPos( cursor, -1 );
                if(letter) {
                    this.code.lines[ln] = sliceChar( this.code.lines[ln], cursor.position - 1 );
                    this.cursorToLeft( letter );
                    this.processLine(ln);
                    if( this.useAutoComplete )
                        this.showAutoCompleteBox( 'foo', cursor );
                } 
                else if(this.code.lines[ln - 1] != undefined) {
                    this.lineUp();
                    this.actions['End'].callback(cursor.line, cursor, e);
                    // Move line on top
                    this.code.lines[ln - 1] += this.code.lines[ln];
                    this.code.lines.splice(ln, 1);
                    this.processLines(ln - 1);
                }
            }
        });

        this.action('Delete', false, ( ln, cursor, e ) => {

            this._addUndoStep( cursor );
            
            if(this.selection) {
                // Use 'Backspace' as it's the same callback...
                this.actions['Backspace'].callback(ln, cursor, e);
            }
            else
            {
                var letter = this.getCharAtPos( cursor );
                if(letter) {
                    this.code.lines[ln] = sliceChar( this.code.lines[ln], cursor.position );
                    this.processLine(ln);
                } 
                else if(this.code.lines[ln + 1] != undefined) {
                    this.code.lines[ln] += this.code.lines[ln + 1];
                    this.code.lines.splice(ln + 1, 1);
                    this.processLines(ln);
                }
            }
        });

        this.action('Tab', true, ( ln, cursor, e ) => {
            
            if( this.isAutoCompleteActive )
            {
                this.autoCompleteWord( cursor );
            } else 
            {
                this.addSpaces( this.tabSpaces );
            }
        });

        this.action('Home', false, ( ln, cursor, e ) => {
            
            let idx = firstNonspaceIndex(this.code.lines[ln]);

            // We already are in the first non space index...
            if(idx == cursor.position) idx = 0;

            const prestring = this.code.lines[ln].substring(0, idx);
            let last_pos = cursor.position;

            this.resetCursorPos( CodeEditor.CURSOR_LEFT );
            if(idx > 0) this.cursorToString(cursor, prestring);
            this._refreshCodeInfo(cursor.line + 1, cursor.position);
            this.code.scrollLeft = 0;

            if( e.shiftKey && !e.cancelShift )
            {
                // Get last selection range
                if(this.selection) 
                last_pos += this.selection.chars;

                this.startSelection(cursor);
                var string = this.code.lines[ln].substring(idx, last_pos);
                this.selection.selectInline(idx, cursor.line, this.measureString(string));
            } else
                this.endSelection();
        });

        this.action('End', false, ( ln, cursor, e ) => {
            
            if( e.shiftKey || e._shiftKey ) {
                
                var string = this.code.lines[ln].substring(cursor.position);
                if(!this.selection)
                    this.startSelection(cursor);
                this.selection.selectInline(cursor.position, cursor.line, this.measureString(string));
            } else 
                this.endSelection();

            this.resetCursorPos( CodeEditor.CURSOR_LEFT );
            this.cursorToString( cursor, this.code.lines[ln] );

            const last_char = ((this.code.scrollLeft + this.code.clientWidth) / this.charWidth)|0;
            this.code.scrollLeft = cursor.position >= last_char ? (cursor.position - last_char) * this.charWidth : 0;
        });

        this.action('Enter', true, ( ln, cursor, e ) => {

            // Add word
            if( this.isAutoCompleteActive )
            {
                this.autoCompleteWord( cursor );
                return;
            }

            if(e.ctrlKey)
            {
                this.onrun( this.getText() );
                return;
            }

            this._addUndoStep(cursor);

            var _c0 = this.getCharAtPos( cursor, -1 );
            var _c1 = this.getCharAtPos( cursor );

            this.code.lines.splice(cursor.line + 1, 0, "");
            this.code.lines[cursor.line + 1] = this.code.lines[ln].substr( cursor.position ); // new line (below)
            this.code.lines[ln] = this.code.lines[ln].substr( 0, cursor.position ); // line above
            this.lineDown(cursor, true);

            // Check indentation
            var spaces = firstNonspaceIndex(this.code.lines[ln]);
            var tabs = Math.floor( spaces / this.tabSpaces );

            if( _c0 == '{' && _c1 == '}' ) {
                this.code.lines.splice(cursor.line, 0, "");
                this.addSpaceTabs(tabs + 1);
                this.code.lines[cursor.line + 1] = " ".repeat(spaces) + this.code.lines[cursor.line + 1];
            } else {
                this.addSpaceTabs(tabs);
            }

            this.processLines( ln );
        });

        this.action('ArrowUp', false, ( ln, cursor, e ) => {

            // Move cursor..
            if( !this.isAutoCompleteActive )
            {
                if( e.shiftKey ) {
                    if(!this.selection)
                        this.startSelection(cursor);

                    this.selection.toY = (this.selection.toY > 0) ? (this.selection.toY - 1) : 0;
                    this.cursorToLine(cursor, this.selection.toY);

                    var letter = this.getCharAtPos( cursor );
                    if(!letter) {
                        this.selection.toX = (this.code.lines[cursor.line].length - 1);
                        this.cursorToPosition(cursor, this.selection.toX);
                    }
                    
                    this.processSelection(null, true);

                } else {
                    this.endSelection();
                    this.lineUp();
                    // Go to end of line if out of line
                    var letter = this.getCharAtPos( cursor );
                    if(!letter) this.actions['End'].callback(cursor.line, cursor, e);
                }
            } 
            // Move up autocomplete selection
            else
            {
                this.moveArrowSelectedAutoComplete('up');
            }
        });

        this.action('ArrowDown', false, ( ln, cursor, e ) => {

            // Move cursor..
            if( !this.isAutoCompleteActive )
            {
                if( e.shiftKey ) {
                    if(!this.selection)
                        this.startSelection(cursor);

                    this.selection.toY = this.selection.toY < this.code.lines.length - 1 ? this.selection.toY + 1 : this.code.lines.length - 1;
                    this.cursorToLine(cursor, this.selection.toY);
                    
                    var letter = this.getCharAtPos( cursor );
                    if(!letter) {
                        this.selection.toX = Math.max(this.code.lines[cursor.line].length - 1, 0);
                        this.cursorToPosition(cursor, this.selection.toX);
                    }

                    this.processSelection(null, true);
                } else {
    
                    if( this.code.lines[ ln + 1 ] == undefined ) 
                        return;
                    this.endSelection();
                    this.lineDown();
                    // Go to end of line if out of line
                    var letter = this.getCharAtPos( cursor );
                    if(!letter) this.actions['End'].callback(cursor.line, cursor, e);
                }
            } 
            // Move down autocomplete selection
            else
            {
                this.moveArrowSelectedAutoComplete('down');
            }
        });

        this.action('ArrowLeft', false, ( ln, cursor, e ) => {

            if(e.metaKey) { // Apple devices (Command)
                e.preventDefault();
                this.actions[ 'Home' ].callback( ln, cursor );
            }
            else if(e.ctrlKey) {
                // Get next word
                const [word, from, to] = this.getWordAtPos( cursor, -1 );
                var diff = Math.max(cursor.position - from, 1);
                var substr = word.substr(0, diff);
                // Selections...
                if( e.shiftKey ) if(!this.selection) this.startSelection(cursor);
                this.cursorToString(cursor, substr, true);
                if( e.shiftKey ) this.processSelection();
            }
            else {
                var letter = this.getCharAtPos( cursor, -1 );
                if(letter) {
                    if( e.shiftKey ) {
                        if(!this.selection) this.startSelection(cursor);
                        if( ((cursor.position - 1) < this.selection.fromX) && this.selection.sameLine() )
                            this.selection.fromX--;
                        else if( (cursor.position - 1) == this.selection.fromX && this.selection.sameLine() ) {
                            this.cursorToLeft( letter, cursor );
                            this.endSelection();
                            return;
                        }
                        else this.selection.toX--;
                        this.cursorToLeft( letter, cursor );
                        this.processSelection(null, true);
                    }
                    else {
                        if(!this.selection) {
                            this.cursorToLeft( letter, cursor );
                            if( this.useAutoComplete && this.isAutoCompleteActive )
                                this.showAutoCompleteBox( 'foo', cursor );
                        }
                        else {
                            this.selection.invertIfNecessary();
                            this.resetCursorPos( CodeEditor.CURSOR_LEFT | CodeEditor.CURSOR_TOP );
                            this.cursorToLine(cursor, this.selection.fromY, true);
                            this.cursorToPosition(cursor, this.selection.fromX);
                            this.endSelection();
                        }
                    }
                }
                else if( cursor.line > 0 ) {

                    this.lineUp( cursor );
                    this.resetCursorPos( CodeEditor.CURSOR_LEFT );
                    this.cursorToPosition( cursor, this.code.lines[cursor.line].length );

                    if( e.shiftKey ) {
                        if(!this.selection) this.startSelection(cursor);
                        this.selection.toX = cursor.position;
                        this.selection.toY--;
                        this.processSelection(null, true);
                    }
                }
            }
        });

        this.action('ArrowRight', false, ( ln, cursor, e ) => {

            if(e.metaKey) { // Apple devices (Command)
                e.preventDefault();
                this.actions[ 'End' ].callback( ln, cursor );
            } else if(e.ctrlKey) {
                // Get next word
                const [word, from, to] = this.getWordAtPos( cursor );
                var diff = cursor.position - from;
                var substr = word.substr(diff);
                // Selections...
                if( e.shiftKey ) if(!this.selection) this.startSelection(cursor);
                this.cursorToString(cursor, substr);
                if( e.shiftKey ) this.processSelection();
            } else {
                var letter = this.getCharAtPos( cursor );
                if(letter) {
                    if( e.shiftKey ) {
                        if(!this.selection) this.startSelection(cursor);
                        var keep_range = false;
                        if( cursor.position == this.selection.fromX ) {
                            if( (cursor.position + 1) == this.selection.toX && this.selection.sameLine() ) {
                                this.cursorToRight( letter, cursor );
                                this.endSelection();
                                return;
                            } else if( cursor.position < this.selection.toX ) {
                                this.selection.fromX++;
                                keep_range = true;
                            } else this.selection.toX++;
                        }
                        this.cursorToRight( letter, cursor );
                        this.processSelection(null, keep_range);
                    }else{
                        if(!this.selection) {
                            this.cursorToRight( letter, cursor );
                            if( this.useAutoComplete && this.isAutoCompleteActive )
                                this.showAutoCompleteBox( 'foo', cursor );
                        }
                        else 
                        {
                            this.selection.invertIfNecessary();
                            this.resetCursorPos( CodeEditor.CURSOR_LEFT | CodeEditor.CURSOR_TOP );
                            this.cursorToLine(cursor, this.selection.toY);
                            this.cursorToPosition(cursor, this.selection.toX);
                            this.endSelection();
                        }
                    }
                }
                else if( this.code.lines[ cursor.line + 1 ] !== undefined ) {
                    
                    this.lineDown( cursor );
                    e.cancelShift = true;
                    this.actions['Home'].callback(cursor.line, cursor, e);
                    this.hideAutoCompleteBox();

                    if( e.shiftKey ) {
                        if(!this.selection) this.startSelection(cursor);
                        this.selection.toX = cursor.position;
                        this.selection.toY++;
                        this.processSelection(null, true);
                    }
                }
            }
        });

        // Default code tab
    
        this.openedTabs = { };
        
        if( options.allow_add_scripts ?? true )
            this.addTab("+", false, "New File");

        this.addTab(options.name || "untitled", true, options.title);

        // Create inspector panel
        let panel = this._createPanelInfo();
        if( panel ) area.attach( panel );
    }

    static getInstances()
    {
        return CodeEditor.__instances;
    }

    getText( min ) {
        return this.code.lines.join(min ? ' ' : '\n');
    }

    // This can be used to empty all text...
    setText( text = "" ) {

        let new_lines = text.split('\n');
        this.code.lines = [].concat(new_lines);

        let cursor = this.cursors.children[0];
        let lastLine = new_lines.pop();

        this.cursorToLine(cursor, new_lines.length); // Already substracted 1
        this.cursorToPosition(cursor, lastLine.length);
        this.processLines();
    }

    appendText( text ) {

        let cursor = this.cursors.children[0];
        let lidx = cursor.line;

        if( this.selection ) {
            this.deleteSelection(cursor);
            lidx = cursor.line;
        }

        this.endSelection();

        const new_lines = text.split('\n');

        // Pasting Multiline...
        if(new_lines.length != 1)
        {
            let num_lines = new_lines.length;
            console.assert(num_lines > 0);
            const first_line = new_lines.shift();
            num_lines--;

            const remaining = this.code.lines[lidx].slice(cursor.position);

            // Add first line
            this.code.lines[lidx] = [
                this.code.lines[lidx].slice(0, cursor.position), 
                first_line
            ].join('');

            this.cursorToPosition(cursor, (cursor.position + first_line.length));

            // Enter next lines...

            let _text = null;

            for( var i = 0; i < new_lines.length; ++i ) {
                _text = new_lines[i];
                this.cursorToLine(cursor, cursor.line++, true);
                // Add remaining...
                if( i == (new_lines.length - 1) )
                    _text += remaining;
                this.code.lines.splice( 1 + lidx + i, 0, _text);
            }

            if(_text) this.cursorToPosition(cursor, _text.length);
            this.cursorToLine(cursor, cursor.line + num_lines);
            this.processLines(lidx);
        }
        // Pasting one line...
        else
        {
            this.code.lines[lidx] = [
                this.code.lines[lidx].slice(0, cursor.position), 
                new_lines[0], 
                this.code.lines[lidx].slice(cursor.position)
            ].join('');

            this.cursorToPosition(cursor, (cursor.position + new_lines[0].length));
            this.processLine(lidx);
        }
    }

    loadFile( file ) {

        const inner_add_tab = ( text, name, title ) => {
            this.addTab(name, true, title);
            text = text.replaceAll('\r', '');
            this.code.lines = text.split('\n');
            this.processLines();
            this._refreshCodeInfo();
        };

        if(file.constructor == String)
        {
            let filename = file;
            LX.request({ url: filename, success: text => {

                const name = filename.substring(filename.lastIndexOf('/') + 1);
                this._changeLanguageFromExtension( LX.getExtension(name) );
                inner_add_tab( text, name, filename );
            } });
        }
        else // File Blob
        {
            const fr = new FileReader();
            fr.readAsText( file );
            fr.onload = e => { 
                this._changeLanguageFromExtension( LX.getExtension(file.name) );
                const text = e.currentTarget.result;
                inner_add_tab( text, file.name );
            };
        }
        
    }

    _addUndoStep( cursor )  {

        var cursor = cursor ?? this.cursors.children[0];

        this.code.undoSteps.push( {
            lines: LX.deepCopy(this.code.lines),
            cursor: this.saveCursor(cursor),
            line: cursor.line
        } );
    }

    _changeLanguage( lang ) {
        this.highlight = lang;
        this._refreshCodeInfo();
        this.processLines();
    }

    _changeLanguageFromExtension( ext ) {
        
        switch(ext.toLowerCase())
        {
            case 'js': return this._changeLanguage('JavaScript');
            case 'glsl': return this._changeLanguage('GLSL');
            case 'css': return this._changeLanguage('CSS');
            case 'json': return this._changeLanguage('JSON');
            case 'xml': return this._changeLanguage('XML');
            case 'wgsl': return this._changeLanguage('WGSL');
            case 'txt': 
            default:
                this._changeLanguage('Plain Text');
        }
    }

    _createPanelInfo() {
        
        if( !this.skip_info )
        {
            let panel = new LX.Panel({ className: "lexcodetabinfo", width: "calc(100%)", height: "auto" });
            panel.ln = 0;
            panel.col = 0;

            this._refreshCodeInfo = (ln = panel.ln, col = panel.col) => {
                panel.ln = ln;
                panel.col = col;
                panel.clear();
                panel.sameLine();
                panel.addLabel(this.code.title, { float: 'right' });
                panel.addLabel("Ln " + ln, { width: "64px" });
                panel.addLabel("Col " + col, { width: "64px" });
                panel.addButton("<b>{ }</b>", this.highlight, (value, event) => {
                    LX.addContextMenu( "Language", event, m => {
                        for( const lang of this.languages )
                            m.add( lang, this._changeLanguage.bind(this) );
                    });
                }, { width: "25%", nameWidth: "15%" });
                panel.endLine();
            };

            this._refreshCodeInfo();

            return panel;
        }
        else
        {
            this._refreshCodeInfo = () => {};

            doAsync( () => {

                // Change css a little bit...
                this.gutter.style.height = "calc(100% - 38px)";
                this.root.querySelectorAll('.code').forEach( e => e.style.height = "calc(100% - 6px)" );
                this.root.querySelector('.lexareatabscontent').style.height = "calc(100% - 23px)";

            }, 100);
        }
    }

    _onNewTab( e ) {

        this.processFocus(false);

        LX.addContextMenu( null, e, m => {
            m.add( "Create", this.addTab.bind(this, "unnamed.js", true) );
            m.add( "Load", this.loadTab.bind(this, "unnamed.js", true) );
        });
    }

    addTab(name, selected, title) {
        
        if(this.openedTabs[name])
        {
            this.tabs.select( this.code.tabName );
            return;
        }

        // Create code content
        let code = document.createElement('div');
        code.className = 'code';
        code.lines = [""];
        code.cursorState = {};
        code.undoSteps = [];
        code.tabName = name;
        code.title = title ?? name;
        code.tokens = {}; 

        code.addEventListener('dragenter', function(e) {
            e.preventDefault();
            this.classList.add('dragging');
        });
        code.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('dragging');
        });
        code.addEventListener('drop', (e) => {
            e.preventDefault();
            code.classList.remove('dragging');
            for( let i = 0; i < e.dataTransfer.files.length; ++i )
                this.loadFile( e.dataTransfer.files[i] );
        });

        code.addEventListener('scroll', (e) => {
            this.gutter.scrollTop = code.scrollTop;
            this.gutter.scrollLeft = code.scrollLeft;

            // Update cursor
            var cursor = this.cursors.children[0];
            cursor.style.top = (cursor._top - code.scrollTop) + "px";
            cursor.style.left = "calc( " + (cursor._left - code.scrollLeft) + "px + " + this.xPadding + ")";

            // Update selection
            for( let s of this.selections.childNodes ) {
                s.style.top = (s._top - code.scrollTop) + "px";
                s.style.left = "calc( " + (s._left - code.scrollLeft) + "px + " + this.xPadding + ")";
            }
        });

        this.openedTabs[name] = code;

        this.tabs.add(name, code, { 'selected': selected, 'fixed': (name === '+') , 'title': code.title, 'onSelect': (e, tabname) => {

            if(tabname == '+')
            {
                this._onNewTab( e );
                return;
            }

            var cursor = cursor ?? this.cursors.children[0];
            this.saveCursor(cursor, this.code.cursorState);    
            this.code = this.openedTabs[tabname];
            this.restoreCursor(cursor, this.code.cursorState);    
            this.endSelection();
            this._changeLanguageFromExtension( LX.getExtension(tabname) );
            this._refreshCodeInfo(cursor.line + 1, cursor.position);

            // Restore scroll
            this.gutter.scrollTop = this.code.scrollTop;
            this.gutter.scrollLeft = this.code.scrollLeft;
        }});
        
        this.endSelection();

        if(selected){
            this.code = code;  
            this.resetCursorPos(CodeEditor.CURSOR_LEFT | CodeEditor.CURSOR_TOP);
            this.processLines();
            doAsync( () => this._refreshCodeInfo(0, 0), 50 );
        }
    }

    loadTab() {
        const input = document.createElement('input');
        input.type = 'file';
        document.body.appendChild(input);
        input.click();
        input.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.loadFile( e.target.files[0] );
            }
            input.remove();
        });
    }

    processFocus( active ) {

        if( active )
            this.restartBlink();
        else {
            clearInterval( this.blinker );
            this.cursors.classList.remove('show');
        }
    }

    processMouse(e) {

        if( !e.target.classList.contains('code') ) return;
        if( !this.code ) return;

        var cursor = this.cursors.children[0];
        var code_rect = this.code.getBoundingClientRect();
        var mouse_pos = [(e.clientX - code_rect.x) + this.getScrollLeft(), (e.clientY - code_rect.y) + this.getScrollTop()];

        // Discard out of lines click...
        if( e.type != 'contextmenu' )
        {
            var ln = (mouse_pos[1] / this.lineHeight)|0;
            if(this.code.lines[ln] == undefined) return;
        }

        if( e.type == 'mousedown' )
        {
            if( mouse_pos[0] > this.code.scrollWidth || mouse_pos[1] > this.code.scrollHeight )
                return; // Scrollbar click

            // Left click only...
            if( e.button === 2 )
            {
                this.processClick(e);

                this.canOpenContextMenu = !this.selection;

                if( this.selection )
                {
                    this.canOpenContextMenu |= (cursor.line >= this.selection.fromY && cursor.line <= this.selection.toY 
                                                && cursor.position >= this.selection.fromX && cursor.position <= this.selection.toX);
                    if( this.canOpenContextMenu )
                        return;
                }
            }

            this.lastMouseDown = LX.getTime();
            this.state.selectingText = true;
            this.endSelection();
        }
        
        else if( e.type == 'mouseup' )
        {
            if( (LX.getTime() - this.lastMouseDown) < 300 ) {
                this.state.selectingText = false;
                this.processClick(e);
                this.endSelection();
            }

            if(this.selection) this.selection.invertIfNecessary();

            this.state.selectingText = false;
        }

        else if( e.type == 'mousemove' )
        {
            if( this.state.selectingText )
                this.processSelection(e);
        }

        else if ( e.type == 'click' ) // trip
        {
            switch( e.detail )
            {
                case LX.MOUSE_DOUBLE_CLICK:
                    const [word, from, to] = this.getWordAtPos( cursor );
                    this.resetCursorPos( CodeEditor.CURSOR_LEFT );
                    this.cursorToPosition( cursor, from );
                    this.startSelection( cursor );
                    this.selection.selectInline(from, cursor.line, this.measureString(word));
                    this.cursorToString( cursor, word ); // Go to the end of the word
                    break;
                // Select entire line
                case LX.MOUSE_TRIPLE_CLICK:
                    this.resetCursorPos( CodeEditor.CURSOR_LEFT );
                    e._shiftKey = true;
                    this.actions['End'].callback(cursor.line, cursor, e);
                    break;
            }
        }

        else if ( e.type == 'contextmenu' )
        {
            e.preventDefault();

            if( !this.canOpenContextMenu )
                return;

            LX.addContextMenu( null, e, m => {
                m.add( "Format/JSON", () => { 
                    let json = this.toJSONFormat(this.getText());
                    this.code.lines = json.split("\n"); 
                    this.processLines();
                } );
                m.add( "" )
                m.add( "Cut", () => {  this._cutContent(); } );
                m.add( "Copy", () => {  this._copyContent(); } );
                m.add( "Paste", () => {  this._pasteContent(); } );
            });

            this.canOpenContextMenu = false;
        }
    }

    processClick(e, skip_refresh = false) {

        var code_rect = this.code.getBoundingClientRect();
        var position = [(e.clientX - code_rect.x) + this.getScrollLeft(), (e.clientY - code_rect.y) + this.getScrollTop()];
        var ln = (position[1] / this.lineHeight)|0;

        if(this.code.lines[ln] == undefined) return;
        
        var cursor = this.cursors.children[0];
        cursor.line = ln;

        this.cursorToLine(cursor, ln, true);
        
        var ch = (position[0] / this.charWidth)|0;
        var string = this.code.lines[ln].slice(0, ch);
        // this.cursorToString(cursor, string);
        this.cursorToPosition(cursor, string.length);

        this.hideAutoCompleteBox();
        
        if(!skip_refresh) 
            this._refreshCodeInfo( ln + 1, cursor.position );
    }

    processSelection( e, keep_range ) {

        var cursor = this.cursors.children[0];

        if(e) this.processClick(e, true);
        if( !this.selection )
            this.startSelection(cursor);

        // Update selection
        if(!keep_range)
        {
            this.selection.toX = cursor.position;
            this.selection.toY = cursor.line;
        }

        this.selection.chars = 0;

        const fromX = this.selection.fromX,
                fromY = this.selection.fromY,
                toX = this.selection.toX,
                toY = this.selection.toY;
        const deltaY = toY - fromY;

        // Selection goes down...
        if( deltaY >= 0 )
        {
            while( deltaY < (this.selections.childElementCount - 1) )            
                this.selections.lastChild.remove();

            for(let i = fromY; i <= toY; i++){

                const sId = i - fromY;

                // Make sure that the line selection is generated...
                let domEl = this.selections.childNodes[sId];
                if(!domEl)
                {
                    domEl = document.createElement('div');
                    domEl.className = "lexcodeselection";
                    this.selections.appendChild( domEl );
                }

                // Compute new width and selection margins
                let string;
                
                if(sId == 0) // First line 2 cases (single line, multiline)
                {
                    const reverse = fromX > toX;
                    if(deltaY == 0) string = !reverse ? this.code.lines[i].substring(fromX, toX) : this.code.lines[i].substring(toX, fromX);
                    else string = this.code.lines[i].substr(fromX);
                    const pixels = ((reverse && deltaY == 0 ? toX : fromX) * this.charWidth) - this.getScrollLeft();
                    domEl.style.left = "calc(" + pixels + "px + " + this.xPadding + ")";
                }
                else
                {
                    string = (i == toY) ? this.code.lines[i].substring(0, toX) : this.code.lines[i]; // Last line, any multiple line...
                    const pixels = -this.getScrollLeft();
                    domEl.style.left = "calc(" + pixels + "px + " + this.xPadding + ")";
                }
                
                const stringWidth = this.measureString(string);
                domEl.style.width = (stringWidth || 8) + "px";
                domEl._top = 4 + i * this.lineHeight;
                domEl.style.top = (domEl._top - this.getScrollTop()) + "px";
                this.selection.chars += stringWidth / this.charWidth;
            }
        }
        else // Selection goes up...
        {
            while( Math.abs(deltaY) < (this.selections.childElementCount - 1) )            
                this.selections.firstChild.remove();

            for(let i = toY; i <= fromY; i++){

                const sId = i - toY;

                // Make sure that the line selection is generated...
                let domEl = this.selections.childNodes[sId];
                if(!domEl)
                {
                    domEl = document.createElement('div');
                    domEl.className = "lexcodeselection";
                    this.selections.appendChild( domEl );
                }

                // Compute new width and selection margins
                let string;
                
                if(sId == 0)
                {
                    string = this.code.lines[i].substr(toX);
                    const pixels = (toX * this.charWidth) - this.getScrollLeft();
                    domEl.style.left = "calc(" + pixels + "px + " + this.xPadding + ")";
                }
                else
                {
                    string = (i == fromY) ? this.code.lines[i].substring(0, fromX) : this.code.lines[i]; // Last line, any multiple line...
                    domEl.style.left = "calc(" + (-this.getScrollLeft()) + "px + " + this.xPadding + ")";
                }
                
                const stringWidth = this.measureString(string);
                domEl.style.width = (stringWidth || 8) + "px";
                domEl._top = 4 + i * this.lineHeight;
                domEl.style.top = (domEl._top - this.getScrollTop()) + "px";
                this.selection.chars += stringWidth / this.charWidth;
            }
        }
    }

    async processKey(e) {

        if( !this.code ) 
            return;

        var key = e.key ?? e.detail.key;

        const skip_undo = e.detail.skip_undo ?? false;

        // keys with length > 1 are probably special keys
        if( key.length > 1 && this.specialKeys.indexOf(key) == -1 )
            return;

        let cursor = this.cursors.children[0];
        let lidx = cursor.line;
        this.code.lines[lidx] = this.code.lines[lidx] ?? "";

        // Check combinations

        if( e.ctrlKey || e.metaKey )
        {
            switch( key.toLowerCase() ) {
            case 'a': // select all
                e.preventDefault();
                this.resetCursorPos( CodeEditor.CURSOR_LEFT | CodeEditor.CURSOR_TOP );
                this.startSelection(cursor);
                const nlines = this.code.lines.length - 1;
                this.selection.toX = this.code.lines[nlines].length;
                this.selection.toY = nlines;
                this.processSelection(null, true);
                this.cursorToPosition(cursor, this.selection.toX);
                this.cursorToLine(cursor, this.selection.toY);
                break;
            case 'c': // copy
                this._copyContent();
                return;
            case 'd': // duplicate line
                e.preventDefault();
                this.code.lines.splice(lidx, 0, this.code.lines[lidx]);
                this.lineDown( cursor );
                this.processLines(lidx);
                return;
            case 's': // save
                e.preventDefault();
                this.onsave( this.getText() );
                return;
            case 'v': // paste
                this._pasteContent();
                return;
            case 'x': // cut line
                this._cutContent();
                return;
            case 'z': // undo
                if(!this.code.undoSteps.length)
                    return;
                const step = this.code.undoSteps.pop();
                this.code.lines = step.lines;
                cursor.line = step.line;
                this.restoreCursor( cursor, step.cursor );
                this.processLines();
                return;

                
            }
        }

        else if( e.altKey )
        {
            switch( key ) {
                case 'ArrowUp':
                if(this.code.lines[ lidx - 1 ] == undefined)
                    return;
                swapArrayElements(this.code.lines, lidx - 1, lidx);
                this.lineUp();
                this.processLine( lidx - 1 );
                this.processLine( lidx );
                return;
            case 'ArrowDown':
                if(this.code.lines[ lidx + 1 ] == undefined)
                    return;
                swapArrayElements(this.code.lines, lidx, lidx + 1);
                this.lineDown();
                this.processLine( lidx );
                this.processLine( lidx + 1 );
                return;
            }
        }
        
        // Apply binded actions...

        for( const actKey in this.actions ) {
            if( key != actKey ) continue;
            e.preventDefault();

            if(this.actions[ key ].deleteSelection && this.selection)
                this.actions['Backspace'].callback(lidx, cursor, e);

            return this.actions[ key ].callback( lidx, cursor, e );
        }

        // From now on, don't allow ctrl, shift or meta (mac) combinations
        if( (e.ctrlKey || e.metaKey) )
            return;

        // Add undo steps

        const d = new Date();
        const current = d.getTime();

        if( !skip_undo )
        {
            if( !this._lastTime ) {
                this._lastTime = current;
                this._addUndoStep( cursor );
            } else {
                if( (current - this._lastTime) > 3000 && this.code.lines.length){
                    this._lastTime = null;
                    this._addUndoStep( cursor );
                }else{
                    // If time not enough, reset timer
                    this._lastTime = current;
                }
            }
        }

        //  Some custom cases for word enclosing (), {}, "", '', ...

        const enclosableKeys = ["\"", "'", "(", "{"];
        if( enclosableKeys.indexOf( key ) > -1 )
        {
            if( this.encloseSelectedWordWithKey(key, lidx, cursor) ) 
                return;
        }

        // Until this point, if there was a selection, we need 
        // to delete the content..

        if( this.selection )
        {
            this.actions['Backspace'].callback(lidx, cursor, e);
            lidx = cursor.line; // Update this, since it's from the old code
        }

        // Append key 

        this.code.lines[lidx] = [
            this.code.lines[lidx].slice(0, cursor.position), 
            key, 
            this.code.lines[lidx].slice(cursor.position)
        ].join('');

        this.cursorToRight( key );

        //  Some custom cases for auto key pair (), {}, "", '', ...

        const pairKeys = ["\"", "'", "(", "{"];
        if( pairKeys.indexOf( key ) > -1 && !this.wasKeyPaired )
        {
            // Find pair key
            let pair = key;
            switch(key)
            {
                case "'":
                case "\"":
                    break;
                case "(": pair = ")"; break;
                case "{": pair = "}"; break;
            }

            // Make sure to detect later that the key is paired automatically to avoid loops...
            this.wasKeyPaired = true;

            this.root.dispatchEvent(new KeyboardEvent('keydown', { 'key': pair }));
            this.cursorToLeft( key, cursor );
            return;
        }

        // Once here we can pair keys again
        delete this.wasKeyPaired;

        // Update only the current line, since it's only an appended key
        this.processLine( lidx );

        // Manage autocomplete

        if( this.useAutoComplete )
            this.showAutoCompleteBox( key, cursor );
    }

    async _pasteContent() {
        let text = await navigator.clipboard.readText();
        this.appendText(text);
    }

    async _copyContent() {

        let cursor = this.cursors.children[0];
        let text_to_copy = "";

        if( !this.selection ) {
            text_to_copy = "\n" + this.code.lines[cursor.line];
        }
        else {
            const separator = "_NEWLINE_";
            let code = this.code.lines.join(separator);

            // Get linear start index
            let index = 0;
            
            for(let i = 0; i <= this.selection.fromY; i++)
                index += (i == this.selection.fromY ? this.selection.fromX : this.code.lines[i].length);

            index += this.selection.fromY * separator.length; 
            const num_chars = this.selection.chars + (this.selection.toY - this.selection.fromY) * separator.length;
            const text = code.substr(index, num_chars);
            const lines = text.split(separator);
            text_to_copy = lines.join('\n');
        }

        navigator.clipboard.writeText(text_to_copy).then(() => console.log("Successfully copied"), (err) => console.error("Error"));
    }

    async _cutContent() {

        let cursor = this.cursors.children[0];
        let lidx = cursor.line;
        let text_to_cut = "";

        if( !this.selection ) {
            text_to_cut = "\n" + this.code.lines[cursor.line];
            this.code.lines.splice(lidx, 1);
            this.processLines(lidx);
            this.resetCursorPos( CodeEditor.CURSOR_LEFT );
        }
        else {
            const separator = "_NEWLINE_";
            let code = this.code.lines.join(separator);

            // Get linear start index
            let index = 0;
            
            for(let i = 0; i <= this.selection.fromY; i++)
                index += (i == this.selection.fromY ? this.selection.fromX : this.code.lines[i].length);

            index += this.selection.fromY * separator.length; 
            const num_chars = this.selection.chars + (this.selection.toY - this.selection.fromY) * separator.length;
            const text = code.substr(index, num_chars);
            const lines = text.split(separator);
            text_to_cut = lines.join('\n');

            this.deleteSelection( cursor );
        }

        navigator.clipboard.writeText(text_to_cut).then(() => console.log("Successfully cut"), (err) => console.error("Error"));
    }

    action( key, deleteSelection, fn ) {

        this.actions[ key ] = {
            "callback": fn,
            "deleteSelection": deleteSelection
        };
    }

    processLines( from ) {

        if( !from )
        {
            this.gutter.innerHTML = "";
            this.code.innerHTML = "";
            this.code.tokens = {};
        }

        for( let i = from ?? 0; i < this.code.lines.length; ++i )
        {
            this.processLine( i );
        }

        // Clean up...
        if( from )
        {
            while( this.code.lines.length != this.gutter.children.length )            
                this.gutter.lastChild.remove();
            while( this.code.lines.length != this.code.children.length )            
                this.code.lastChild.remove();
        }

    }

    processLine( linenum ) {

        delete this._building_string; // multi-line strings not supported by now
        
        // It's allowed to process only 1 line to optimize
        let linestring = this.code.lines[ linenum ];
        var _lines = this.code.querySelectorAll('pre');
        var pre = null, single_update = false;
        if( _lines[linenum] ) {
            pre = _lines[linenum];
            single_update = true;
        }
        
        if(!pre)
        {
            var pre = document.createElement('pre');
            pre.dataset['linenum'] = linenum;
            this.code.appendChild(pre);
        }
        else
        {
            pre.children[0].remove(); // Remove token list
        }

        var linespan = document.createElement('span');
        pre.appendChild(linespan);

        // Check if line comment
        const is_comment = linestring.split('//');
        linestring = ( is_comment.length > 1 ) ? is_comment[0] : linestring;

        const tokens = linestring.split(' ').join('¬ ¬').split('¬'); // trick to split without losing spaces
        const to_process = []; // store in a temp array so we know prev and next tokens...

        for( let t of tokens )
        {
            let iter = t.matchAll(/[\[\](){}<>.,;:"']/g);
            let subtokens = iter.next();
            if( subtokens.value )
            {
                let idx = 0;
                while( subtokens.value != undefined )
                {
                    const _pt = t.substring(idx, subtokens.value.index);
                    to_process.push( _pt );
                    to_process.push( subtokens.value[0] );
                    idx = subtokens.value.index + 1;
                    subtokens = iter.next();
                    if(!subtokens.value) {
                        const _at = t.substring(idx);
                        to_process.push( _at );
                    }
                }
            }
            else
                to_process.push( t );
        }

        if( is_comment.length > 1 )
            to_process.push( "//" + is_comment[1] );

        // Process all tokens
        for( var i = 0; i < to_process.length; ++i )
        {
            let it = i - 1;
            let prev = to_process[it];
            while( prev == '' || prev == ' ' ) {
                it--;
                prev = to_process[it];
            }

            it = i + 1;
            let next = to_process[it];
            while( next == '' || next == ' ' || next == '"') {
                it++;
                next = to_process[it];
            }
            
            let token = to_process[i];
            if( token.substr(0, 2) == '/*' )
                this._building_block_comment = true;
            if( token.substr(token.length - 2) == '*/' )
                delete this._building_block_comment;
            
            this.processToken(token, linespan, prev, next);
        }

        // add line gutter
        if(!single_update)
        {
            var linenumspan = document.createElement('span');
            linenumspan.innerHTML = (linenum + 1);
            this.gutter.appendChild(linenumspan);
        }
    }

    _mustHightlightWord( token, kindArray ) {

        return kindArray[this.highlight] && kindArray[this.highlight].indexOf(token) > -1;
    }

    processToken(token, linespan, prev, next) {

        let sString = false;
        let highlight = this.highlight.replace(/\s/g, '').toLowerCase();

        if(token == '"' || token == "'")
        {
            sString = (this._building_string == token); // stop string if i was building it
            this._building_string = this._building_string ? this._building_string : token;
        }

        if(token == ' ')
        {
            linespan.innerHTML += token;
        }
        else
        {
            var span = document.createElement('span');
            span.innerHTML = token;

            if( this._building_block_comment )
                span.classList.add("cm-com");
            
            else if( this._building_string  )
                span.classList.add("cm-str");
            
            else if( this._mustHightlightWord( token, this.keywords ) )
                span.classList.add("cm-kwd");

            else if( this._mustHightlightWord( token, this.builtin ) )
                span.classList.add("cm-bln");

            else if( this._mustHightlightWord( token, this.statementsAndDeclarations ) )
                span.classList.add("cm-std");

                else if( this._mustHightlightWord( token, this.symbols ) )
                span.classList.add("cm-sym");

            else if( token.substr(0, 2) == '//' )
                span.classList.add("cm-com");

            else if( token.substr(0, 2) == '/*' )
                span.classList.add("cm-com");

            else if( token.substr(token.length - 2) == '*/' )
                span.classList.add("cm-com");

            else if(  this.isNumber(token) || this.isNumber( token.replace(/[px]|[em]|%/g,'') ) )
                span.classList.add("cm-dec");

            else if( this.isCSSClass(token, prev, next) )
                span.classList.add("cm-kwd");

            else if ( this.isType(token, prev, next) ) {
                span.classList.add("cm-typ");
                this.code.tokens[ token ] = CodeEditor.WORD_TYPE_CLASS;
            }

            else if ( token[0] != '@' && next == '(' ) {
                span.classList.add("cm-mtd");
                this.code.tokens[ token ] = CodeEditor.WORD_TYPE_METHOD;
            }

            else if ( highlight == 'css' && prev == ':' && (next == ';' || next == '!important') ) // CSS value
                span.classList.add("cm-str");

            else if ( highlight == 'css' && prev == undefined && next == ':' ) // CSS attribute
                span.classList.add("cm-typ");
            else {

                if( token.length > 1 )
                {
                    // Store in token map to show later as autocomplete suggestions
                    this.code.tokens[ token ] = -1;
                }
            }

            span.classList.add(highlight);
            linespan.appendChild(span);
        }

        if(sString) delete this._building_string;
    }

    isCSSClass( token, prev, next ) {
        return this.highlight == 'CSS' && prev == '.';
    }

    isNumber( token ) {
        return token.length && !Number.isNaN(+token);
    }

    isType( token, prev, next ) {
        
        // Common case
        if( this._mustHightlightWord( token, this.types ) )
            return true;

        if( this.highlight == 'JavaScript' )
        {
            return (prev == 'class' && next == '{') || (prev == 'new' && next == '(');
        }
        else if ( this.highlight == 'WGSL' )
        {
            const is_kwd = (this.keywords[this.highlight] && this.keywords[this.highlight].indexOf(token) == -1);
            return (prev == 'struct' && next == '{') || 
            ( is_kwd && 
                ( prev == ':' && next == ')' || prev == ':' && next == ',' || prev == '>' && next == '{' 
                    || prev == '<' && next == ',' || prev == '<' && next == '>' || prev == '>' && !next ));
        }
    }

    encloseSelectedWordWithKey( key, lidx, cursor ) {

        if( !this.selection || (this.selection.fromY != this.selection.toY) )
        return false;
        
        const _lastLeft = cursor._left;

        // Insert first..
        this.code.lines[lidx] = [
            this.code.lines[lidx].slice(0, this.selection.fromX), 
            key, 
            this.code.lines[lidx].slice(this.selection.fromX)
        ].join('');

        // Go to the end of the word
        this.cursorToPosition(cursor, this.selection.toX + 1);

        // Change next key?
        switch(key)
        {
            case "'":
            case "\"":
                break;
            case "(": key = ")"; break;
            case "{": key = "}"; break;
        }

        // Insert the other
        this.code.lines[lidx] = [
            this.code.lines[lidx].slice(0, cursor.position), 
            key, 
            this.code.lines[lidx].slice(cursor.position)
        ].join('');

        // Recompute and reposition current selection
        
        this.selection.fromX++; 
        this.selection.toX++;

        this.processSelection();
        this.processLine( lidx );

        // Stop propagation
        return true;
    }

    lineUp(cursor, resetLeft) {

        cursor = cursor ?? this.cursors.children[0];
        cursor.line--;
        cursor.line = Math.max(0, cursor.line);
        this.cursorToTop(cursor, resetLeft);
    }

    lineDown(cursor, resetLeft) {

        cursor = cursor ?? this.cursors.children[0];
        cursor.line++;
        this.cursorToBottom(cursor, resetLeft);
    }

    restartBlink() {

        if( !this.code ) return;

        clearInterval(this.blinker);
        this.cursors.classList.add('show');

        if (this.cursorBlinkRate > 0)
            this.blinker = setInterval(() => {
                this.cursors.classList.toggle('show');
            }, this.cursorBlinkRate);
        else if (this.cursorBlinkRate < 0)
            this.cursors.classList.remove('show');
    }

    startSelection( cursor ) {

        // Clear other selections...
        this.selections.innerHTML = "";

        // Show elements
        this.selections.classList.add('show');

        // Create new selection instance
        this.selection = new ISelection(this, cursor.position, cursor.line);
    }

    deleteSelection( cursor ) {

        if(this.disable_edition) 
            return;
        // Some selections don't depend on mouse up..
        if(this.selection) this.selection.invertIfNecessary();

        const separator = "_NEWLINE_";
        let code = this.code.lines.join(separator);

        // Get linear start index
        let index = 0;
        for(let i = 0; i <= this.selection.fromY; i++)
            index += (i == this.selection.fromY ? this.selection.fromX : this.code.lines[i].length);

        index += this.selection.fromY * separator.length; 

        const num_chars = this.selection.chars + (this.selection.toY - this.selection.fromY) * separator.length;
        const pre = code.slice(0, index);
        const post = code.slice(index + num_chars);

        this.code.lines = (pre + post).split(separator);
        this.processLines(this.selection.fromY);

        this.cursorToLine(cursor, this.selection.fromY, true);
        this.cursorToPosition(cursor, this.selection.fromX);
        this.endSelection();

        this._refreshCodeInfo(cursor.line, cursor.position);
    }

    endSelection() {

        this.selections.classList.remove('show');
        this.selections.innerHTML = "";
        delete this.selection;
    }

    cursorToRight( key, cursor ) {

        if(!key) return;
        cursor = cursor ?? this.cursors.children[0];
        cursor._left += this.charWidth;
        cursor.style.left = "calc(" + (cursor._left - this.getScrollLeft()) + "px + " + this.xPadding + ")";
        cursor.position++;
        this.restartBlink();
        this._refreshCodeInfo( cursor.line + 1, cursor.position );

        // Add horizontal scroll

        doAsync(() => {
            var last_char = ((this.code.scrollLeft + this.code.clientWidth) / this.charWidth)|0;
            if( cursor.position >= last_char )
                this.code.scrollLeft += this.charWidth;
        });
    }

    cursorToLeft( key, cursor ) {

        if(!key) return;
        cursor = cursor ?? this.cursors.children[0];
        cursor._left -= this.charWidth;
        cursor._left = Math.max(cursor._left, 0);
        cursor.style.left = "calc(" + (cursor._left - this.getScrollLeft()) + "px + " + this.xPadding + ")";
        cursor.position--;
        cursor.position = Math.max(cursor.position, 0);
        this.restartBlink();
        this._refreshCodeInfo( cursor.line + 1, cursor.position );

        doAsync(() => {
            var first_char = (this.code.scrollLeft / this.charWidth)|0;
            if( (cursor.position - 1) < first_char )
                this.code.scrollLeft -= this.charWidth;
        });
    }

    cursorToTop( cursor, resetLeft = false ) {

        cursor = cursor ?? this.cursors.children[0];
        cursor._top -= this.lineHeight;
        cursor._top = Math.max(cursor._top, 4);
        cursor.style.top = "calc(" + (cursor._top - this.getScrollTop()) + "px)";
        this.restartBlink();
        
        if(resetLeft)
            this.resetCursorPos( CodeEditor.CURSOR_LEFT, cursor );

        this._refreshCodeInfo( cursor.line + 1, cursor.position );

        doAsync(() => {
            var first_line = (this.code.scrollTop / this.lineHeight)|0;
            if( (cursor.line - 1) < first_line )
                this.code.scrollTop -= this.lineHeight;
        });
    }

    cursorToBottom( cursor, resetLeft = false ) {

        cursor = cursor ?? this.cursors.children[0];
        cursor._top += this.lineHeight;
        cursor.style.top = "calc(" + (cursor._top - this.getScrollTop()) + "px)";
        this.restartBlink();

        if(resetLeft)
            this.resetCursorPos( CodeEditor.CURSOR_LEFT, cursor );

        this._refreshCodeInfo( cursor.line + 1, cursor.position );

        doAsync(() => {
            var last_line = ((this.code.scrollTop  + this.code.offsetHeight) / this.lineHeight)|0;
            if( cursor.line >= last_line )
                this.code.scrollTop += this.lineHeight;
        });
    }

    cursorToString( cursor, text, reverse ) {

        cursor = cursor ?? this.cursors.children[0];
        for( let char of text ) 
            reverse ? this.cursorToLeft(char) : this.cursorToRight(char);
    }

    cursorToPosition( cursor, position ) {

        cursor.position = position;
        cursor._left = position * this.charWidth;
        cursor.style.left = "calc(" + (cursor._left - this.getScrollLeft()) + "px + " + this.xPadding + ")";
    }

    cursorToLine( cursor, line, resetLeft = false ) {

        cursor.line = line;
        cursor._top = 4 + this.lineHeight * line;
        cursor.style.top = (cursor._top - this.getScrollTop()) + "px";
        if(resetLeft) this.resetCursorPos( CodeEditor.CURSOR_LEFT, cursor );
    }

    saveCursor( cursor, state = {} ) {

        var cursor = cursor ?? this.cursors.children[0];
        state.top = cursor._top;
        state.left = cursor._left;
        state.line = cursor.line;
        state.charPos = cursor.position;
        return state;
    }

    restoreCursor( cursor, state ) {

        cursor = cursor ?? this.cursors.children[0];
        cursor.line = state.line ?? 0;
        cursor.position = state.charPos ?? 0;

        cursor._left = state.left ?? 0;
        cursor.style.left = "calc(" + (cursor._left - this.getScrollLeft()) + "px + " + this.xPadding + ")";
        cursor._top = state.top ?? 4;
        cursor.style.top = "calc(" + (cursor._top - this.getScrollTop()) + "px)";
    }

    resetCursorPos( flag, cursor ) {
        
        cursor = cursor ?? this.cursors.children[0];

        if( flag & CodeEditor.CURSOR_LEFT )
        {
            cursor._left = 0;
            cursor.style.left = "calc(" + (-this.getScrollLeft()) + "px + " + this.xPadding + ")";
            cursor.position = 0;
        }

        if( flag & CodeEditor.CURSOR_TOP )
        {
            cursor._top = 4;
            cursor.style.top = (cursor._top - this.getScrollTop()) + "px";
            cursor.line = 0;
        }
    }

    addSpaceTabs(n) {
        
        for( var i = 0; i < n; ++i ) {
            this.actions['Tab'].callback();
        }
    }

    addSpaces(n) {
        
        for( var i = 0; i < n; ++i ) {
            this.root.dispatchEvent(new CustomEvent('keydown', {'detail': {
                skip_undo: true,
                key: ' '
            }}));
        }
    }

    getScrollLeft() {
        
        if(!this.code) return 0;
        return this.code.scrollLeft;
    }

    getScrollTop() {
        
        if(!this.code) return 0;
        return this.code.scrollTop;
    }

    getCharAtPos( cursor, offset = 0 ) {
        
        cursor = cursor ?? this.cursors.children[0];
        return this.code.lines[cursor.line][cursor.position + offset];
    }

    getWordAtPos( cursor, offset = 0 ) {
        
        cursor = cursor ?? this.cursors.children[0];
        const col = cursor.line;
        const words = this.code.lines[col];

        const is_char = (char) => {
            const exceptions = ['_'];
            const code = char.charCodeAt(0);
            return (exceptions.indexOf(char) > - 1) || (code > 47 && code < 58) || (code > 64 && code < 91) || (code > 96 && code < 123);
        }

        let it = cursor.position + offset;

        while( words[it] && is_char(words[it]) )
            it--;

        const from = it + 1;
        it = cursor.position + offset;

        while( words[it] && is_char(words[it]) )
            it++;

        const to = it;

        return [words.substring( from, to ), from, to];
    }

    measureChar( char = "a", get_bb = false ) {
        
        var test = document.createElement("pre");
        test.className = "codechar";
        test.innerHTML = char;
        document.body.appendChild(test);
        var rect = test.getBoundingClientRect();
        test.remove();
        const bb = [Math.floor(rect.width), Math.floor(rect.height)];
        return get_bb ? bb : bb[0];
    }

    measureString( str ) {

        return str.length * this.charWidth;
    }

    runScript( code ) {
        var script = document.createElement('script');
        script.type = 'module';
        script.innerHTML = code;
        // script.src = url[i] + ( version ? "?version=" + version : "" );
        script.async = false;
        // script.onload = function(e) { };
        document.getElementsByTagName('head')[0].appendChild(script);
    }

    toJSONFormat( text ) {

        let params = text.split(":");

        for(let i = 0; i < params.length; i++) {
            let key = params[i].split(',');
            if(key.length > 1) {
                if(key[key.length-1].includes("]"))
                    continue;
                key = key[key.length-1];
            }
            else if(key[0].includes("}"))
                continue;
            else
                key = key[0];
            key = key.replaceAll(/[{}\n\r]/g,"").replaceAll(" ","")
            if(key[0] != '"' && key[key.length - 1] != '"') {
                params[i] = params[i].replace(key, '"' + key + '"');
            }
        }

        text = params.join(':');

        try {
            let json = JSON.parse(text);
            return JSON.stringify(json, undefined, 4);
        }
        catch(e) {
            alert("Invalid JSON format");
            return;	
        }
    }

    showAutoCompleteBox( key, cursor ) {
        
        const [word, start, end] = this.getWordAtPos( cursor, -1 );
        if(key == ' ' || !word.length) {
            this.hideAutoCompleteBox();
            return;
        }

        this.autocomplete.innerHTML = ""; // Clear all suggestions

        let suggestions = [];

        // Add language special keys...
        suggestions = suggestions.concat(   
            this.builtin[ this.highlight ] ?? [],
            this.keywords[ this.highlight ] ?? [],
            this.statementsAndDeclarations[ this.highlight ] ?? [],
            this.types[ this.highlight ] ?? [],
            this.utils[ this.highlight ] ?? []
        );

        // Add words in current tab plus remove current word
        // suggestions = suggestions.concat( Object.keys(this.code.tokens).filter( a => a != word ) );

        // Remove single chars and duplicates...        
        suggestions = suggestions.filter( (value, index) => value.length > 1 && suggestions.indexOf(value) === index );

        // Order...
        suggestions = suggestions.sort( (a, b) => a.localeCompare(b) );

        for( let s of suggestions )
        {
            if( !s.toLowerCase().includes(word.toLowerCase()) )
            continue;

            var pre = document.createElement('pre');
            this.autocomplete.appendChild(pre);

            var icon = document.createElement('a');
            
            if( this._mustHightlightWord( s, this.utils ) )
                icon.className = "fa fa-cube";
            else if( this._mustHightlightWord( s, this.types ) )
                icon.className = "fa fa-code";
            else
                icon.className = "fa fa-font";

            pre.appendChild(icon);

            pre.addEventListener( 'click', () => {
                this.autoCompleteWord( cursor, s );
            } ); 

            // Highlight the written part
            const index = s.toLowerCase().indexOf(word.toLowerCase());

            var preWord = document.createElement('span');
            preWord.innerHTML = s.substring(0, index);
            pre.appendChild(preWord);

            var actualWord = document.createElement('span');
            actualWord.innerHTML = s.substr(index, word.length);
            actualWord.classList.add( 'word-highlight' );
            pre.appendChild(actualWord);

            var postWord = document.createElement('span');
            postWord.innerHTML = s.substring(index + word.length);
            pre.appendChild(postWord);
        }

        if( !this.autocomplete.childElementCount )
        {
            this.hideAutoCompleteBox();
            return;
        }

        // Select always first option
        this.autocomplete.firstChild.classList.add('selected');

        // Show box
        this.autocomplete.classList.toggle('show', true);
        this.autocomplete.classList.toggle('no-scrollbar', !(this.autocomplete.scrollHeight > this.autocomplete.offsetHeight));
        this.autocomplete.style.left = (cursor._left + 36) + "px";
        this.autocomplete.style.top = (cursor._top + 48) + "px";


        this.isAutoCompleteActive = true;
    }

    hideAutoCompleteBox() {

        this.isAutoCompleteActive = false;
        this.autocomplete.classList.remove('show');
    }

    autoCompleteWord( cursor, suggestion ) {
        
        if( !this.isAutoCompleteActive )
        return;

        let [suggestedWord, idx] = this.getSelectedAutoComplete();
        suggestedWord = suggestion ?? suggestedWord;

        const [word, start, end] = this.getWordAtPos( cursor, -1 );

        const lineString = this.code.lines[ cursor.line ];
        this.code.lines[ cursor.line ] = 
            lineString.slice(0, start) + suggestedWord + lineString.slice(end);

        // Process lines and remove suggestion box
        this.cursorToPosition(cursor, start + suggestedWord.length);
        this.processLine(cursor.line);
        this.hideAutoCompleteBox();
    }

    getSelectedAutoComplete() {
        
        if( !this.isAutoCompleteActive )
        return;

        for( let i = 0; i < this.autocomplete.childElementCount; ++i )
        {
            const child = this.autocomplete.childNodes[i];
            if( child.classList.contains('selected') )
            {
                var word = "";
                for( let childSpan of child.childNodes )
                    word += childSpan.innerHTML;

                return [ word, i ]; // Get text of the span inside the 'pre' element
            }
        }
    }

    moveArrowSelectedAutoComplete( dir ) {

        if( !this.isAutoCompleteActive )
        return;

        const [word, idx] = this.getSelectedAutoComplete();
        const offset = dir == 'down' ? 1 : -1;

        if( dir == 'down' ) {
            if( (idx + offset) >= this.autocomplete.childElementCount ) return;
        } else if( dir == 'up') {
            if( (idx + offset) < 0 ) return;
        }

        this.autocomplete.scrollTop += offset * 18;

        // Remove selected from the current word and add it to the next one
        this.autocomplete.childNodes[ idx ].classList.remove('selected');
        this.autocomplete.childNodes[ idx + offset ].classList.add('selected');
    }
}

LX.CodeEditor = CodeEditor;

export { CodeEditor };