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

    // Element should exist, since tree was refreshed to show it
    const el = this.domEl.querySelector( "#" + id );
    console.assert(  el, "NodeTree: Can't select node " + id );

    el.classList.add( "selected" );
    this.selected = [ el.treeData ];
    el.focus();
}
// END OF FIX 2

// FIX 3
// frefresh does not call refresh apropriately. 
// If a node is parent, and is currently selected, frefresh will lose focus and select root 
LX.NodeTree.prototype.frefresh = function( id ) {
    this.refresh( null, id ); // <-- added (null, id)
    var el = this.domEl.querySelector( "#" + id );
    if( el )
    {
        el.focus();
    }
}
// END OF FIX 3


export{};