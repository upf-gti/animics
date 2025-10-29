// temporal file to solve some functionalities of lexgui

import { LX } from 'lexgui';

// FIX 1

/**
 * @method getSubitems
 * @param {Object} item: parent item
 * @param {Array} tokens: split path strings
*/
LX.Menubar.prototype.getSubitem = function( item, tokens ) {

    let subitem = null;
    let path = tokens[ 0 ];

    for( let i = 0; i < item.length; i++ )
    {
        if ( !item[ i ] )
        {
            continue;
        }

        if( item[ i ].name == path )
        {
            if( tokens.length == 1 )
            {
                subitem = item[ i ];
                return subitem;
            }
            else if ( item[ i ].submenu )
            {
                tokens.splice( 0, 1 );
                return this.getSubitem( item[ i ].submenu, tokens );
            }

        }
    }

    return null;
}

// END OF FIX 1

// FIX 2
// if a filter is applied, select will break. Select should overrule node filters. 
// Maybe a paremeter could be added to choose whether to overrule them 
LX.NodeTree.prototype.select = function( id ) {
    const nodeFilter = this.domEl.querySelector( ".lexnodetreefilter" );
    if ( nodeFilter ){
        nodeFilter.value = "";
    }

    this.refresh( null, id );

    this.domEl.querySelectorAll( ".selected" ).forEach( i => i.classList.remove( "selected" ) );

    // Unselect
    if ( !id ){
        this.selected.length = 0;
        return;
    }
    
    // Element should exist, since tree was refreshed to show it
    const el = this.domEl.querySelector( "#" + id );
    console.assert(  el, "NodeTree: Can't select node " + id );

    el.classList.add( "selected" );
    this.selected = [ el.treeData ];
    el.focus();
}
// END OF FIX 2

// FIX 3
// make icons as buttons so they can have swap.
// changed only "if ( node.actions )"

LX.NodeTree.prototype._createItem = function( parent, node, level = 0, selectedId ) {

    const that = this;
    const nodeFilterInput = this.domEl.querySelector( ".lexnodetreefilter" );

    node.children = node.children ?? [];

    if( nodeFilterInput && nodeFilterInput.value != "" && !node.id.includes( nodeFilterInput.value ) )
    {
        for( var i = 0; i < node.children.length; ++i )
        {
            this._createItem( node, node.children[ i ], level + 1, selectedId );
        }

        return;
    }

    const list = this.domEl.querySelector( 'ul' );

    node.visible = node.visible ?? true;
    node.parent = parent;
    let isParent = node.children.length > 0;
    let isSelected = this.selected.indexOf( node ) > -1 || node.selected;

    if( this.options.onlyFolders )
    {
        let hasFolders = false;
        node.children.forEach( c => hasFolders |= (c.type == 'folder') );
        isParent = !!hasFolders;
    }

    let item = document.createElement('li');
    item.className = "lextreeitem " + "datalevel" + level + (isParent ? " parent" : "") + (isSelected ? " selected" : "");
    item.id = LX.getSupportedDOMName( node.id );
    item.tabIndex = "0";
    item.treeData = node;

    // Select hierarchy icon
    let icon = (this.options.skipDefaultIcon ?? true) ? null : "Dot"; // Default: no childs
    if( isParent )
    {
        icon = node.closed ? "Right" : "Down";
    }

    if( icon )
    {
        item.appendChild( LX.makeIcon( icon, { iconClass: "hierarchy", svgClass: "xs" } ) );
    }

    // Add display icon
    icon = node.icon;

    // Process icon
    if( icon )
    {
        if( !node.icon.includes( '.' ) ) // Not a file
        {
            const classes = node.icon.split( ' ' );
            const nodeIcon = LX.makeIcon( classes[ 0 ], { iconClass: "tree-item-icon mr-2", svgClass: "md" + ( classes.length > 1 ? ` ${ classes.slice( 0 ).join( ' ' ) }` : '' ) } );
            item.appendChild( nodeIcon );
        }
        else // an image..
        {
            const rootPath = "https://raw.githubusercontent.com/jxarco/lexgui.js/master/";
            item.innerHTML += "<img src='" + ( rootPath + node.icon ) + "'>";
        }
    }

    item.innerHTML += (node.rename ? "" : node.id);

    item.setAttribute( 'draggable', true );
    item.style.paddingLeft = ((3 + (level+1) * 15)) + "px";
    list.appendChild( item );

    // Callbacks
    item.addEventListener("click", e => {
        if( handled )
        {
            handled = false;
            return;
        }

        if( !e.shiftKey )
        {
            list.querySelectorAll( "li" ).forEach( e => { e.classList.remove( 'selected' ); } );
            this.selected.length = 0;
        }

        // Add or remove
        const idx = this.selected.indexOf( node );
        if( idx > -1 )
        {
            item.classList.remove( 'selected' );
            this.selected.splice( idx, 1 );
        }
        else
        {
            item.classList.add( 'selected' );
            this.selected.push( node );
        }

        // Only Show children...
        if( isParent && node.id.length > 1 /* Strange case... */)
        {
            node.closed = false;
            if( that.onevent )
            {
                const event = new LX.TreeEvent( LX.TreeEvent.NODE_CARETCHANGED, node, node.closed );
                that.onevent( event );
            }
            that.frefresh( node.id );
        }

        if( that.onevent )
        {
            const event = new LX.TreeEvent(LX.TreeEvent.NODE_SELECTED, e.shiftKey ? this.selected : node );
            event.multiple = e.shiftKey;
            that.onevent( event );
        }
    });

    item.addEventListener("dblclick", function() {

        if( that.options.rename ?? true )
        {
            // Trigger rename
            node.rename = true;
            that.refresh();
        }

        if( that.onevent )
        {
            const event = new LX.TreeEvent( LX.TreeEvent.NODE_DBLCLICKED, node );
            that.onevent( event );
        }
    });

    item.addEventListener( "contextmenu", e => {

        e.preventDefault();

        if( !that.onevent )
        {
            return;
        }

        const event = new LX.TreeEvent(LX.TreeEvent.NODE_CONTEXTMENU, this.selected.length > 1 ? this.selected : node, e);
        event.multiple = this.selected.length > 1;

        LX.addContextMenu( event.multiple ? "Selected Nodes" : event.node.id, event.value, m => {
            event.panel = m;
        });

        that.onevent( event );

        if( this.options.addDefault ?? false )
        {
            if( event.panel.items )
            {
                event.panel.add( "" );
            }

            event.panel.add( "Select Children", () => {

                const selectChildren = ( n ) => {

                    if( n.closed )
                    {
                        return;
                    }

                    for( let child of n.children ?? [] )
                    {
                        if( !child )
                        {
                            continue;
                        }

                        let nodeItem = this.domEl.querySelector( '#' + child.id );
                        nodeItem.classList.add( "selected" );
                        this.selected.push( child );
                        selectChildren( child );
                    }
                };

                this.domEl.querySelectorAll( ".selected" ).forEach( i => i.classList.remove( "selected" ) );
                this.selected.length = 0;

                // Add childs of the clicked node
                selectChildren( node );
            } );

            event.panel.add( "Delete", { callback: () => {

                const ok = that.deleteNode( node );

                if( ok && that.onevent )
                {
                    const event = new LX.TreeEvent( LX.TreeEvent.NODE_DELETED, node, e );
                    that.onevent( event );
                }

                this.refresh();
            } } );
        }
    });

    item.addEventListener("keydown", e => {

        if( node.rename )
        {
            return;
        }

        e.preventDefault();

        if( e.key == "Delete" )
        {
            const nodesDeleted = [];

            for( let _node of this.selected )
            {
                if( that.deleteNode( _node ) )
                {
                    nodesDeleted.push( _node );
                }
            }

            // Send event now so we have the info in selected array..
            if( nodesDeleted.length && that.onevent )
            {
                const event = new LX.TreeEvent( LX.TreeEvent.NODE_DELETED, nodesDeleted.length > 1 ? nodesDeleted : node, e );
                event.multiple = nodesDeleted.length > 1;
                that.onevent( event );
            }

            this.selected.length = 0;

            this.refresh();
        }
        else if( e.key == "ArrowUp" || e.key == "ArrowDown" ) // Unique or zero selected
        {
            var selected = this.selected.length > 1 ? ( e.key == "ArrowUp" ? this.selected.shift() : this.selected.pop() ) : this.selected[ 0 ];
            var el = this.domEl.querySelector( "#" + LX.getSupportedDOMName( selected.id ) );
            var sibling = e.key == "ArrowUp" ? el.previousSibling : el.nextSibling;
            if( sibling )
            {
                sibling.click();
            }
        }
    });

    // Node rename

    const nameInput = document.createElement( "input" );
    nameInput.toggleAttribute( "hidden", !node.rename );
    nameInput.className = "bg-none";
    nameInput.value = node.id;
    item.appendChild( nameInput );

    if( node.rename )
    {
        item.classList.add('selected');
        nameInput.focus();
    }

    nameInput.addEventListener("keyup", function( e ) {
        if( e.key == "Enter" )
        {
            this.value = this.value.replace(/\s/g, '_');

            if( that.onevent )
            {
                const event = new LX.TreeEvent(LX.TreeEvent.NODE_RENAMED, node, this.value);
                that.onevent( event );
            }

            node.id = LX.getSupportedDOMName( this.value );
            delete node.rename;
            that.frefresh( node.id );
            list.querySelector( "#" + node.id ).classList.add('selected');
        }
        else if(e.key == "Escape")
        {
            delete node.rename;
            that.frefresh( node.id );
        }
    });

    nameInput.addEventListener("blur", function( e ) {
        delete node.rename;
        that.refresh();
    });

    if( this.options.draggable ?? true )
    {
        // Drag nodes
        if( parent ) // Root doesn't move!
        {
            item.addEventListener("dragstart", e => {
                window.__tree_node_dragged = node;
            });
        }

        /* Events fired on other node items */
        item.addEventListener("dragover", e => {
            e.preventDefault(); // allow drop
        }, false );
        item.addEventListener("dragenter", (e) => {
            e.target.classList.add("draggingover");
        });
        item.addEventListener("dragleave", (e) => {
            e.target.classList.remove("draggingover");
        });
        item.addEventListener("drop", e => {
            e.preventDefault(); // Prevent default action (open as link for some elements)
            let dragged = window.__tree_node_dragged;
            if(!dragged)
                return;
            let target = node;
            // Can't drop to same node
            if( dragged.id == target.id )
            {
                console.warn("Cannot parent node to itself!");
                return;
            }

            // Can't drop to child node
            const isChild = function( newParent, node ) {
                var result = false;
                for( var c of node.children )
                {
                    if( c.id == newParent.id ) return true;
                    result |= isChild( newParent, c );
                }
                return result;
            };

            if( isChild( target, dragged ))
            {
                console.warn("Cannot parent node to a current child!");
                return;
            }

            // Trigger node dragger event
            if( that.onevent )
            {
                const event = new LX.TreeEvent(LX.TreeEvent.NODE_DRAGGED, dragged, target);
                that.onevent( event );
            }

            const index = dragged.parent.children.findIndex(n => n.id == dragged.id);
            const removed = dragged.parent.children.splice(index, 1);
            target.children.push( removed[ 0 ] );
            that.refresh();
            delete window.__tree_node_dragged;
        });
    }

    let handled = false;

    // Show/hide children
    if( isParent )
    {
        item.querySelector('a.hierarchy').addEventListener("click", function( e ) {

            handled = true;
            e.stopImmediatePropagation();
            e.stopPropagation();

            if( e.altKey )
            {
                const _closeNode = function( node ) {
                    node.closed = !node.closed;
                    for( var c of node.children )
                    {
                        _closeNode( c );
                    }
                };
                _closeNode( node );
            }
            else
            {
                node.closed = !node.closed;
            }

            if( that.onevent )
            {
                const event = new LX.TreeEvent(LX.TreeEvent.NODE_CARETCHANGED, node, node.closed);
                that.onevent( event );
            }
            that.frefresh( node.id );
        });
    }

    // Add button icons

    const inputContainer = document.createElement( "div" );
    item.appendChild( inputContainer );

    if( node.actions )
    {
        for( let i = 0; i < node.actions.length; ++i )
        {
            const action = node.actions[ i ];
            const actionBtn = new LX.Button( null, "", ( swapValue, event ) => {
                event.stopPropagation();
                if ( action.callback ){
                    action.callback( node, swapValue, event );
                }
            }, { icon: action.icon, swap: action.swap, title: action.name, hideName:true, className: "p-0 m-0", buttonClass: "p-0 m-0 bg-none" } );
            actionBtn.root.style.minWidth = "fit-content";
            actionBtn.root.style.margin = "0"; // adding classes does not work
            actionBtn.root.style.padding = "0"; // adding classes does not work
            const _btn = actionBtn.root.querySelector("button");
            _btn.style.minWidth = "fit-content";
            _btn.style.margin = "0"; // adding classes does not work
            _btn.style.padding = "0"; // adding classes does not work

            inputContainer.appendChild( actionBtn.root );
        }
    }

    if( !node.skipVisibility ?? false )
    {
        const visibilityBtn = new LX.Button( null, "", ( swapValue, event ) => {
            event.stopPropagation();
            node.visible = node.visible === undefined ? false : !node.visible;
            // Trigger visibility event
            if( that.onevent )
            {
                const event = new LX.TreeEvent( LX.TreeEvent.NODE_VISIBILITY, node, node.visible );
                that.onevent( event );
            }
        }, { icon: node.visible ? "Eye" : "EyeOff", swap: node.visible ? "EyeOff" : "Eye", title: "Toggle visible", className: "p-0 m-0", buttonClass: "bg-none" } );
        inputContainer.appendChild( visibilityBtn.root );
    }

    const _hasChild = function( node, id ) {
        if( node.id == id ) return true;
        let found = false;
        for( var c of ( node?.children ?? [] ) )
        {
            found |= _hasChild( c, id );
        }
        return found;
    };

    const exists = _hasChild( node, selectedId );

    if( node.closed && !exists )
    {
        return;
    }

    for( var i = 0; i < node.children.length; ++i )
    {
        let child = node.children[ i ];

        if( this.options.onlyFolders && child.type != 'folder' )
        {
            continue;
        }

        this._createItem( node, child, level + 1, selectedId );
    }
}
// END OF FIX 3

export{};